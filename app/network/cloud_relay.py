"""Vvc Remote Cloud Relay Client

Maintains an ultra-low-overhead WebSocket connection to the Vvc Central Signaling Server.
Enables instant global peer-to-peer connection discovery, incoming connection requests,
and WebRTC SDP negotiation across different internet connections (Global WAN).
"""

import asyncio
import json
import logging
import time
from typing import Optional, Callable

logger = logging.getLogger("CloudRelayClient")


class CloudRelayClient:
    def __init__(
        self,
        peer_id: str,
        relay_url: str,
        on_incoming_request: Optional[Callable] = None,
        on_offer_received: Optional[Callable] = None
    ):
        self.peer_id = "".join(c for c in str(peer_id) if c.isdigit())
        self.relay_url = (relay_url or "").strip().rstrip("/")
        self.on_incoming_request = on_incoming_request
        self.on_offer_received = on_offer_received

        self.running = False
        self.connected = False
        self.ws = None
        self._task = None
        self._pending_responses = {}  # request_id -> asyncio.Future

    def is_configured(self) -> bool:
        return bool(self.relay_url and self.relay_url.startswith(("http", "ws")))

    def get_ws_url(self) -> str:
        url = self.relay_url
        if url.startswith("https://"):
            url = "wss://" + url[8:]
        elif url.startswith("http://"):
            url = "ws://" + url[7:]
        return f"{url}/ws/signal/{self.peer_id}"

    def start(self, loop: Optional[asyncio.AbstractEventLoop] = None):
        if not self.is_configured():
            logger.info("Cloud Relay is disabled (no central_relay_url configured). Operating in LAN P2P mode.")
            return

        self.running = True
        loop = loop or asyncio.get_event_loop()
        self._task = loop.create_task(self._connection_loop())

    def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()

    async def _connection_loop(self):
        """Persistent connection loop with automatic reconnect."""
        import websockets

        ws_url = self.get_ws_url()
        backoff = 2

        while self.running:
            try:
                logger.info(f"Connecting to Central Cloud Signaling: {ws_url}...")
                async with websockets.connect(ws_url, ping_interval=20, ping_timeout=15) as ws:
                    self.ws = ws
                    self.connected = True
                    backoff = 2
                    logger.info("[✓] Connected & Registered with Vvc Central Signaling Server!")

                    while self.running:
                        message = await ws.recv()
                        await self._handle_message(message)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.connected = False
                self.ws = None
                logger.warning(f"[!] Cloud Relay disconnected: {e}. Reconnecting in {backoff}s...")
                await asyncio.sleep(backoff)
                backoff = min(30, backoff * 1.5)

    async def _handle_message(self, raw_message: str):
        try:
            data = json.loads(raw_message)
        except Exception:
            return

        msg_type = data.get("type")
        sender = data.get("from")

        # 1. Incoming Connection Request from remote peer
        if msg_type == "connect_request":
            if self.on_incoming_request:
                await self.on_incoming_request(data)

        # 2. Response to an outgoing request we made
        elif msg_type == "connect_response":
            req_id = data.get("request_id")
            if req_id and req_id in self._pending_responses:
                fut = self._pending_responses[req_id]
                if not fut.done():
                    fut.set_result(data)

        # 3. WebRTC Offer forwarded from remote client
        elif msg_type == "webrtc_offer":
            if self.on_offer_received:
                answer = await self.on_offer_received(data)
                if answer:
                    await self.send_message({
                        "type": "webrtc_answer",
                        "to": sender,
                        "sdp": answer.get("sdp"),
                        "session_id": data.get("session_id")
                    })

        # 4. WebRTC Answer received from remote host
        elif msg_type == "webrtc_answer":
            req_id = data.get("session_id")
            if req_id and req_id in self._pending_responses:
                fut = self._pending_responses[req_id]
                if not fut.done():
                    fut.set_result(data)

    async def send_message(self, payload: dict) -> bool:
        if not self.ws or not self.connected:
            return False
        try:
            await self.ws.send(json.dumps(payload))
            return True
        except Exception as e:
            logger.error(f"Error sending cloud relay message: {e}")
            return False

    async def request_remote_connect(self, target_id: str, timeout: float = 45.0) -> dict:
        """Initiates a connection to a remote peer via the central cloud relay."""
        clean_target = "".join(c for c in str(target_id) if c.isdigit())
        req_id = f"req_{int(time.time() * 1000)}"

        future = asyncio.get_event_loop().create_future()
        self._pending_responses[req_id] = future

        try:
            sent = await self.send_message({
                "type": "connect_request",
                "to": clean_target,
                "request_id": req_id
            })

            if not sent:
                return {"success": False, "message": "Not connected to Central Relay Server"}

            response = await asyncio.wait_for(future, timeout=timeout)
            return response
        except asyncio.TimeoutError:
            return {"success": False, "message": "Connection request timed out"}
        finally:
            self._pending_responses.pop(req_id, None)
