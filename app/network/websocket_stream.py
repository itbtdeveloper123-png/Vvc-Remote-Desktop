"""High-Speed Binary WebSocket Streaming Engine (Fallback & Direct Mode)"""
import asyncio
import json
import time
from typing import Set
from fastapi import WebSocket, WebSocketDisconnect

from app.core.screen_capture import ScreenCaptureEngine
from app.core.input_injector import Win32InputInjector
from app.core.security import SessionSecurityManager


class WebSocketStreamManager:
    """
    Delivers real-time binary frame packets and processes input messages
    over a high-throughput WebSocket connection.
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
        self.active_clients: Set[WebSocket] = set()

    async def handle_stream(self, websocket: WebSocket, session_id: str):
        """
        Handles bi-directional streaming for an authenticated WebSocket client.
        """
        await websocket.accept()
        self.active_clients.add(websocket)
        print(f"[WS-Stream] Client connected: {websocket.client}")

        # Send initial host monitor specs
        stats = self.capture_engine.get_stats()
        await websocket.send_text(json.dumps({
            "type": "init",
            "width": stats["width"],
            "height": stats["height"],
            "fps": stats["target_fps"]
        }))

        # Concurrently run frame sender and input receiver
        send_task = asyncio.create_task(self._frame_sender(websocket))
        recv_task = asyncio.create_task(self._input_receiver(websocket))

        try:
            done, pending = await asyncio.wait(
                [send_task, recv_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
        except Exception as e:
            print(f"[WS-Stream] Session error: {e}")
        finally:
            self.active_clients.discard(websocket)
            self.security_manager.end_session(session_id)
            print(f"[WS-Stream] Client disconnected: {websocket.client}")

    async def _frame_sender(self, websocket: WebSocket):
        """
        Continuously pushes latest JPEG frames to the client.
        """
        last_timestamp = 0.0
        interval = 1.0 / max(1, self.capture_engine.target_fps)

        try:
            while True:
                t0 = time.perf_counter()
                jpeg_bytes = self.capture_engine.get_latest_frame_jpeg()
                curr_timestamp = self.capture_engine._frame_timestamp

                if jpeg_bytes and curr_timestamp != last_timestamp:
                    last_timestamp = curr_timestamp
                    # Binary packet: [0x01 (FRAME_JPEG)] + [jpeg bytes]
                    packet = b"\x01" + jpeg_bytes
                    await websocket.send_bytes(packet)

                elapsed = time.perf_counter() - t0
                sleep_time = interval - elapsed
                if sleep_time > 0.001:
                    await asyncio.sleep(sleep_time)
                else:
                    await asyncio.sleep(0.001)
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass

    async def _input_receiver(self, websocket: WebSocket):
        """
        Receives input actions and telemetry pings from the client.
        """
        try:
            while True:
                message = await websocket.receive_text()
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await websocket.send_text(json.dumps({
                            "type": "pong",
                            "clientTime": data.get("time"),
                            "serverTime": time.time() * 1000
                        }))
                        continue

                    self.input_injector.handle_client_message(data)

                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    print(f"[WS-Stream] Input handling error: {e}")
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
