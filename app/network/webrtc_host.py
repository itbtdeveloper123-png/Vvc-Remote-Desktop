"""WebRTC Host Implementation via aiortc for Low-Latency P2P Video and Input DataChannel"""
import asyncio
import json
import time
from typing import Dict, Optional, Set
import numpy as np
import av
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCIceCandidate, RTCConfiguration, RTCIceServer
from aiortc.contrib.media import MediaBlackhole
import aiortc.codecs.vpx as vpx_codec
import aiortc.codecs.h264 as h264_codec

from app.core.screen_capture import ScreenCaptureEngine
from app.core.input_injector import Win32InputInjector
from app.core.security import SessionSecurityManager
from app.config import CONFIG

# Optimize WebRTC Video Codecs for Crisp Desktop / Remote Workspace Streaming
# 1. Raise Bitrates: Default aiortc was 500 kbps (VP8) / 1000 kbps (H264), capped at 1.5-3.0 Mbps.
# We raise default to 8 Mbps, minimum floor to 3 Mbps (never blur out during motion), and max to 20 Mbps.
vpx_codec.MIN_BITRATE = 3_000_000
vpx_codec.DEFAULT_BITRATE = 8_000_000
vpx_codec.MAX_BITRATE = 20_000_000

h264_codec.MIN_BITRATE = 3_000_000
h264_codec.DEFAULT_BITRATE = 8_000_000
h264_codec.MAX_BITRATE = 20_000_000

# 2. Limit VP8 qmax to prevent blurry compression artifacts when scrolling or typing
_orig_vpx_encode = vpx_codec.Vp8Encoder.encode
def _crisp_vpx_encode(self, frame, force_keyframe=False):
    is_new = self.codec is None
    res = _orig_vpx_encode(self, frame, force_keyframe)
    if is_new and self.codec is not None:
        self.codec.qmin = 2
        self.codec.qmax = 36  # Retain sharp text quality even during motion
    return res
vpx_codec.Vp8Encoder.encode = _crisp_vpx_encode



class DesktopVideoStreamTrack(VideoStreamTrack):
    """
    aiortc VideoStreamTrack that reads captured RGB frames from ScreenCaptureEngine
    and streams them as real-time video to the client.
    """
    kind = "video"

    def __init__(self, capture_engine: ScreenCaptureEngine):
        super().__init__()
        self.capture_engine = capture_engine
        self._last_pts = 0

    async def recv(self) -> av.VideoFrame:
        """
        Yields the next video frame to the WebRTC video encoder.
        Uses native zero-copy BGR format directly.
        """
        pts, time_base = await self.next_timestamp()

        # Wait briefly if capture engine is warming up to prevent initial black frame
        bgr = getattr(self.capture_engine, "get_latest_frame_bgr", lambda: None)()
        if bgr is None:
            for _ in range(10):
                await asyncio.sleep(0.01)
                bgr = getattr(self.capture_engine, "get_latest_frame_bgr", lambda: None)()
                if bgr is not None:
                    break

        if bgr is not None:
            frame = av.VideoFrame.from_ndarray(bgr, format="bgr24")
        else:
            rgb = self.capture_engine.get_latest_frame_rgb()
            if rgb is None:
                w = getattr(self.capture_engine, "screen_width", 1920)
                h = getattr(self.capture_engine, "screen_height", 1080)
                rgb = np.zeros((h, w, 3), dtype=np.uint8)
            frame = av.VideoFrame.from_ndarray(rgb, format="rgb24")

        frame.pts = pts
        frame.time_base = time_base
        return frame


class WebRTCHostManager:
    """
    Manages WebRTC PeerConnections for incoming remote desktop clients.
    """

    def __init__(
        self,
        capture_engine: ScreenCaptureEngine,
        input_injector: Win32InputInjector,
        security_manager: SessionSecurityManager
    ):
        self.capture_engine = capture_engine
        self.input_injector = input_injector
        self.security_manager = security_manager
        self.peer_connections: Set[RTCPeerConnection] = set()
        self.data_channels: Dict[RTCPeerConnection, any] = {}

    async def create_peer_connection(self) -> RTCPeerConnection:
        ice_servers = []
        raw_ice = getattr(CONFIG.network, "ice_servers", [])
        for entry in raw_ice:
            urls = entry.get("urls") if isinstance(entry, dict) else None
            username = entry.get("username") if isinstance(entry, dict) else None
            credential = entry.get("credential") if isinstance(entry, dict) else None
            if urls:
                if username and credential:
                    ice_servers.append(RTCIceServer(urls=urls, username=username, credential=credential))
                elif isinstance(urls, str):
                    ice_servers.append(RTCIceServer(urls))
                elif isinstance(urls, list):
                    for u in urls:
                        ice_servers.append(RTCIceServer(u))
        if not ice_servers:
            ice_servers = [
                RTCIceServer("stun:stun.l.google.com:19302"),
                RTCIceServer("stun:stun1.l.google.com:19302"),
            ]
        config = RTCConfiguration(iceServers=ice_servers)
        pc = RTCPeerConnection(configuration=config)
        self.peer_connections.add(pc)

        # Add our desktop video stream track
        video_track = DesktopVideoStreamTrack(self.capture_engine)
        pc.addTrack(video_track)

        @pc.on("datachannel")
        def on_datachannel(channel):
            self.data_channels[pc] = channel
            print(f"[WebRTC] DataChannel established: {channel.label}")

            @channel.on("message")
            def on_message(message):
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")

                    # Handle Ping / Latency check
                    if msg_type == "ping":
                        channel.send(json.dumps({
                            "type": "pong",
                            "clientTime": data.get("time"),
                            "serverTime": time.time() * 1000
                        }))
                        return

                    # Handle input control events
                    self.input_injector.handle_client_message(data)

                except Exception as e:
                    print(f"[WebRTC] Error processing DataChannel message: {e}")

            @channel.on("close")
            def on_close():
                print(f"[WebRTC] DataChannel {channel.label} closed")
                self.data_channels.pop(pc, None)

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            print(f"[WebRTC] Connection state changed: {pc.connectionState}")
            if pc.connectionState in ("failed", "closed"):
                await self.close_peer_connection(pc)

        return pc

    async def handle_offer(self, sdp: str, offer_type: str) -> dict:
        """
        Accepts remote client SDP offer, creates an answer, and returns local SDP answer.
        """
        pc = await self.create_peer_connection()
        offer = RTCSessionDescription(sdp=sdp, type=offer_type)
        await pc.setRemoteDescription(offer)

        answer = await pc.createAnswer()
        ans_sdp = answer.sdp
        # Inject high bandwidth (16 Mbps) and Google BWE flags for ultra crisp desktop text and fonts
        if "m=video" in ans_sdp and "b=AS:" not in ans_sdp:
            ans_sdp = ans_sdp.replace("c=IN IP4 0.0.0.0\r\n", "c=IN IP4 0.0.0.0\r\nb=AS:16000\r\nb=TIAS:16000000\r\n", 1)

        # Inject google bitrate flags into video fmtp lines
        lines = []
        for line in ans_sdp.split("\r\n"):
            if line.startswith("a=fmtp:") and "x-google-min-bitrate" not in line:
                line += ";x-google-min-bitrate=3000;x-google-start-bitrate=8000;x-google-max-bitrate=20000"
            lines.append(line)
        ans_sdp = "\r\n".join(lines)

        answer = RTCSessionDescription(sdp=ans_sdp, type=answer.type)
        await pc.setLocalDescription(answer)

        # Allow host ICE candidates to gather into local description (STUN reflexive candidates)
        if pc.iceGatheringState != "complete":
            try:
                for _ in range(24):
                    if pc.iceGatheringState == "complete":
                        break
                    await asyncio.sleep(0.05)
            except Exception:
                pass

        return {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type
        }

    async def add_ice_candidate(self, pc: RTCPeerConnection, candidate_dict: dict):
        """
        Adds an ICE candidate received from client.
        """
        try:
            cand = candidate_dict.get("candidate", "")
            sdp_mid = candidate_dict.get("sdpMid")
            sdp_mline_index = candidate_dict.get("sdpMLineIndex")
            if cand:
                # Parse candidate if needed
                candidate = RTCIceCandidate(
                    component=candidate_dict.get("component", 1),
                    foundation=candidate_dict.get("foundation", ""),
                    ip=candidate_dict.get("ip", ""),
                    port=candidate_dict.get("port", 0),
                    priority=candidate_dict.get("priority", 0),
                    protocol=candidate_dict.get("protocol", "udp"),
                    type=candidate_dict.get("type", "host"),
                    sdpMid=sdp_mid,
                    sdpMLineIndex=sdp_mline_index
                )
                await pc.addIceCandidate(candidate)
        except Exception as e:
            print(f"[WebRTC] Warning adding ICE candidate: {e}")

    async def close_peer_connection(self, pc: RTCPeerConnection):
        """Closes a specific PeerConnection."""
        if pc in self.peer_connections:
            self.peer_connections.remove(pc)
            self.data_channels.pop(pc, None)
            await pc.close()

    async def close_all(self):
        """Closes all active PeerConnections."""
        pcs = list(self.peer_connections)
        for pc in pcs:
            await self.close_peer_connection(pc)
