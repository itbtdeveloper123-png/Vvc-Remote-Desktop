"""Vvc Remote Cloud Relay Client

Maintains an ultra-low-overhead WebSocket connection to the Vvc Central Signaling Server.
Enables instant global peer-to-peer connection discovery, incoming connection requests,
and WebRTC SDP negotiation across different internet connections (Global WAN).
"""

import asyncio
import json
import logging
import threading
import time
from typing import Optional, Callable, Dict, Any

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
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._task: Optional[asyncio.Task] = None
        self._pending_responses: Dict[str, asyncio.Future] = {}  # request_id / session_id -> Future
        self._lock = threading.Lock()

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
        """Starts the persistent relay connection in the background."""
        if not self.is_configured():
            logger.info("Cloud Relay is disabled (no central_relay_url configured). Operating in LAN P2P mode.")
            return

        if self.running:
            return

        self.running = True

        if loop and loop.is_running():
            self._loop = loop
            self._task = loop.create_task(self._connection_loop())
        else:
            self._thread = threading.Thread(target=self._run_in_thread, daemon=True, name="CloudRelayThread")
            self._thread.start()

    def _run_in_thread(self):
        """Dedicated asyncio event loop thread for PyInstaller / desktop_app environments."""
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._connection_loop())
        except Exception as e:
            logger.error(f"Cloud Relay loop stopped: {e}")
        finally:
            try:
                self._loop.close()
            except Exception:
                pass

    def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
        if self._loop and self._loop.is_running():
            try:
                self._loop.call_soon_threadsafe(self._loop.stop)
            except Exception:
                pass

        self._last_pong = time.time()
        self._keepalive_task: Optional[asyncio.Task] = None

    async def _keepalive_sender(self, ws):
        """Periodically sends application keepalive ping to prevent proxy drops."""
        try:
            while self.running and self.ws == ws:
                await asyncio.sleep(15)
                if not self.running or self.ws != ws:
                    break
                try:
                    await ws.send(json.dumps({"type": "ping", "time": time.time()}))
                except Exception:
                    break
        except asyncio.CancelledError:
            pass

    async def _connection_loop(self):
        """Persistent connection loop with automatic reconnect and active keepalive."""
        import websockets

        ws_url = self.get_ws_url()
        backoff = 2

        while self.running:
            try:
                logger.info(f"Connecting to Central Cloud Signaling: {ws_url}...")
                async with websockets.connect(
                    ws_url,
                    ping_interval=20,
                    ping_timeout=15,
                    close_timeout=5
                ) as ws:
                    self.ws = ws
                    self.connected = True
                    self._last_pong = time.time()
                    backoff = 2
                    logger.info(f"[✓] Connected & Registered with Vvc Central Signaling Server as Peer {self.peer_id}!")

                    # Launch active keepalive task
                    keepalive_task = asyncio.create_task(self._keepalive_sender(ws))

                    try:
                        while self.running:
                            message = await ws.recv()
                            await self._handle_message(message)
                    finally:
                        keepalive_task.cancel()

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.connected = False
                self.ws = None
                if self.running:
                    logger.warning(f"[!] Cloud Relay disconnected: {e}. Reconnecting in {backoff}s...")
                    await asyncio.sleep(backoff)
                    backoff = min(20, backoff * 1.5)

    async def _handle_message(self, raw_message: str):
        try:
            data = json.loads(raw_message)
        except Exception:
            return

        msg_type = data.get("type")
        sender = data.get("from")

        # Keepalive response from relay server
        if msg_type == "pong":
            self._last_pong = time.time()
            return

        # 1. Incoming Connection Request from remote peer
        if msg_type == "connect_request":
            req_id = data.get("request_id")
            if self.on_incoming_request:
                async def _process_incoming():
                    try:
                        res = self.on_incoming_request(data)
                        if asyncio.iscoroutine(res):
                            res = await res
                        if res and isinstance(res, dict):
                            await self._send_ws({
                                "type": "connect_response",
                                "to": sender,
                                "request_id": req_id,
                                **res
                            })
                    except Exception as e:
                        logger.error(f"Error handling incoming connect request: {e}")

                loop = self._loop or asyncio.get_event_loop()
                if loop and loop.is_running():
                    loop.create_task(_process_incoming())

        # 2. Response to an outgoing request we made
        elif msg_type == "connect_response":
            req_id = data.get("request_id")
            with self._lock:
                fut = self._pending_responses.get(req_id)
            if fut and not fut.done():
                self._resolve_future(fut, data)

        # 3. WebRTC Offer forwarded from remote client
        elif msg_type == "webrtc_offer":
            if self.on_offer_received:
                async def _process_offer():
                    try:
                        res = self.on_offer_received(data)
                        if asyncio.iscoroutine(res):
                            res = await res
                        if res and isinstance(res, dict):
                            await self._send_ws({
                                "type": "webrtc_answer",
                                "to": sender,
                                "sdp": res.get("sdp"),
                                "offer_type": res.get("type", "answer"),
                                "session_id": data.get("session_id")
                            })
                    except Exception as e:
                        logger.error(f"Error handling incoming WebRTC offer: {e}")

                loop = self._loop or asyncio.get_event_loop()
                if loop and loop.is_running():
                    loop.create_task(_process_offer())

        # 4. WebRTC Answer received from remote host
        elif msg_type == "webrtc_answer":
            session_id = data.get("session_id")
            with self._lock:
                fut = self._pending_responses.get(session_id)
            if fut and not fut.done():
                self._resolve_future(fut, data)

        # 5. Remote peer is offline
        elif msg_type == "peer_offline":
            target = data.get("target")
            with self._lock:
                for k, fut in list(self._pending_responses.items()):
                    if not fut.done():
                        self._resolve_future(fut, {
                            "success": False,
                            "status": "offline",
                            "message": f"Partner address '{target}' is currently offline or unreachable."
                        })

    def _resolve_future(self, fut: asyncio.Future, result: Any):
        """Thread-safely resolves a future on its loop."""
        target_loop = None
        try:
            target_loop = fut.get_loop()
        except Exception:
            target_loop = getattr(fut, "_loop", None) or self._loop

        def _do_resolve():
            if not fut.done():
                fut.set_result(result)

        if target_loop and target_loop.is_running():
            target_loop.call_soon_threadsafe(_do_resolve)
        else:
            _do_resolve()

    async def _send_ws(self, payload: dict) -> bool:
        if not self.ws or not self.connected:
            return False
        try:
            await self.ws.send(json.dumps(payload))
            return True
        except Exception as e:
            logger.error(f"Error sending cloud relay message: {e}")
            return False

    async def send_message(self, payload: dict) -> bool:
        """Thread-safe send_message callable from any event loop or thread."""
        if not self.connected:
            return False
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if current_loop is self._loop and self._loop is not None:
            return await self._send_ws(payload)
        elif self._loop and self._loop.is_running():
            fut = asyncio.run_coroutine_threadsafe(self._send_ws(payload), self._loop)
            return await asyncio.wrap_future(fut)
        else:
            return False

    async def request_remote_connect(self, target_id: str, timeout: float = 65.0) -> dict:
        """Initiates a connection to a remote peer via the central cloud relay."""
        clean_target = "".join(c for c in str(target_id) if c.isdigit())
        req_id = f"req_{int(time.time() * 1000)}"

        # Wait briefly for connection if reconnecting
        if not self.connected or not self.ws:
            for _ in range(8):
                if self.connected and self.ws:
                    break
                await asyncio.sleep(0.5)

        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = self._loop or asyncio.get_event_loop()

        future = current_loop.create_future()
        with self._lock:
            self._pending_responses[req_id] = future

        try:
            sent = await self.send_message({
                "type": "connect_request",
                "to": clean_target,
                "request_id": req_id
            })

            if not sent:
                return {
                    "success": False,
                    "message": "Not connected to Central Relay Server (or Server Offline)"
                }

            response = await asyncio.wait_for(future, timeout=timeout)
            return response
        except asyncio.TimeoutError:
            return {"success": False, "message": "Connection request timed out (partner did not respond in time)"}
        finally:
            with self._lock:
                self._pending_responses.pop(req_id, None)

    async def request_webrtc_offer(
        self,
        target_id: str,
        sdp: str,
        offer_type: str = "offer",
        session_id: Optional[str] = None,
        timeout: float = 30.0
    ) -> dict:
        """Sends WebRTC SDP offer to remote host and waits for SDP answer."""
        clean_target = "".join(c for c in str(target_id) if c.isdigit())
        sid = session_id or f"sess_{int(time.time() * 1000)}"

        # Wait briefly for connection if reconnecting
        if not self.connected or not self.ws:
            for _ in range(8):
                if self.connected and self.ws:
                    break
                await asyncio.sleep(0.5)

        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = self._loop or asyncio.get_event_loop()

        future = current_loop.create_future()
        with self._lock:
            self._pending_responses[sid] = future

        try:
            sent = await self.send_message({
                "type": "webrtc_offer",
                "to": clean_target,
                "sdp": sdp,
                "offer_type": offer_type,
                "session_id": sid
            })

            if not sent:
                return {"success": False, "message": "Failed to send WebRTC offer through Cloud Relay"}

            answer_data = await asyncio.wait_for(future, timeout=timeout)
            return {
                "success": True,
                "sdp": answer_data.get("sdp"),
                "type": answer_data.get("offer_type", "answer")
            }
        except asyncio.TimeoutError:
            return {"success": False, "message": "WebRTC offer timed out waiting for remote host answer"}
        finally:
            with self._lock:
                self._pending_responses.pop(sid, None)
