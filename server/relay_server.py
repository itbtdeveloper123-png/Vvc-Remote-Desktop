"""Vvc Remote Central Signaling & Rendezvous Relay Server

Free, ultra-lightweight WebSocket Signaling Server for connecting Vvc Remote Desktop
instances globally across different networks, NATs, and firewalls.

Deployable on Render.com (Free), Railway.app, Fly.io, or any free cloud container.
"""

import asyncio
import json
import logging
import time
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("VvcRelay")

app = FastAPI(
    title="Vvc Remote Central Signaling Server",
    description="Free Global Signaling & NAT Traversal Relay for Vvc Remote Desktop",
    version="1.0.0"
)

# Open CORS so web clients and desktop clients can connect from anywhere
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PeerConnectionManager:
    """Manages online peers and relays WebRTC signaling packets between them."""

    def __init__(self):
        # Maps normalized peer_id -> WebSocket
        self.active_peers: Dict[str, WebSocket] = {}
        # Metadata: peer_id -> {"connected_at": float, "last_ping": float, "ip": str}
        self.peer_meta: Dict[str, dict] = {}
        self._lock = asyncio.Lock()

    def normalize_id(self, raw_id: str) -> str:
        return "".join(c for c in str(raw_id) if c.isdigit())

    async def register(self, raw_id: str, websocket: WebSocket, client_ip: str) -> str:
        norm_id = self.normalize_id(raw_id)
        if not norm_id:
            raise ValueError("Invalid peer ID")

        async with self._lock:
            # If peer ID is already registered from an old socket, close the old one
            if norm_id in self.active_peers:
                old_ws = self.active_peers[norm_id]
                try:
                    await old_ws.close(code=1000, reason="Replaced by new connection")
                except Exception:
                    pass

            self.active_peers[norm_id] = websocket
            self.peer_meta[norm_id] = {
                "raw_id": raw_id,
                "connected_at": time.time(),
                "last_ping": time.time(),
                "ip": client_ip
            }

        logger.info(f"[+] Registered Peer {norm_id} from {client_ip} (Total Online: {len(self.active_peers)})")
        return norm_id

    async def unregister(self, norm_id: str):
        async with self._lock:
            if norm_id in self.active_peers:
                del self.active_peers[norm_id]
            if norm_id in self.peer_meta:
                del self.peer_meta[norm_id]
        logger.info(f"[-] Unregistered Peer {norm_id} (Total Online: {len(self.active_peers)})")

    def is_online(self, raw_id: str) -> bool:
        norm_id = self.normalize_id(raw_id)
        return norm_id in self.active_peers

    async def forward(self, target_raw_id: str, message: dict) -> bool:
        """Forwards a signaling message to the target peer's WebSocket."""
        target_norm = self.normalize_id(target_raw_id)
        ws = self.active_peers.get(target_norm)
        if not ws:
            logger.warning(f"[!] Forward failed: Target {target_norm} is offline.")
            return False

        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception as e:
            logger.error(f"[!] Error forwarding to {target_norm}: {e}")
            await self.unregister(target_norm)
            return False


manager = PeerConnectionManager()


@app.get("/")
async def root():
    return {
        "service": "Vvc Remote Central Signaling Server",
        "status": "online",
        "version": "1.0.0",
        "online_peers_count": len(manager.active_peers)
    }


@app.get("/api/peers")
async def list_peers():
    return {
        "count": len(manager.active_peers),
        "peers": list(manager.peer_meta.keys())
    }


@app.get("/api/resolve/{peer_id}")
async def resolve_peer(peer_id: str):
    norm_id = manager.normalize_id(peer_id)
    online = manager.is_online(norm_id)
    return {
        "peer_id": norm_id,
        "online": online,
        "meta": manager.peer_meta.get(norm_id) if online else None
    }


@app.websocket("/ws/signal/{peer_id}")
async def websocket_signaling_endpoint(websocket: WebSocket, peer_id: str):
    """
    Main Signaling Pipeline:
    Peers maintain an active WebSocket connection here.
    Supports:
    - connect_request (client -> host)
    - connect_response (host -> client: accept/reject)
    - webrtc_offer (client -> host)
    - webrtc_answer (host -> client)
    - ice_candidate (bidirectional)
    - ping / pong (keepalive)
    """
    await websocket.accept()
    client_ip = websocket.client.host if websocket.client else "unknown"

    try:
        norm_id = await manager.register(peer_id, websocket, client_ip)
    except Exception as err:
        await websocket.close(code=4001, reason=str(err))
        return

    # Send registration confirmation
    await websocket.send_text(json.dumps({
        "type": "registered",
        "peer_id": norm_id,
        "message": "Successfully connected to Vvc Global Signaling Server"
    }))

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
            except Exception:
                continue

            msg_type = data.get("type")

            # Keepalive ping
            if msg_type == "ping":
                if norm_id in manager.peer_meta:
                    manager.peer_meta[norm_id]["last_ping"] = time.time()
                await websocket.send_text(json.dumps({"type": "pong", "time": time.time()}))
                continue

            # Forwarding messages: require a target 'to' peer_id
            target = data.get("to")
            if not target:
                continue

            # Automatically inject the verified sender identity
            data["from"] = norm_id

            success = await manager.forward(target, data)
            if not success:
                # Notify sender that target peer is currently offline
                await websocket.send_text(json.dumps({
                    "type": "peer_offline",
                    "target": target,
                    "message": f"Partner address '{target}' is currently offline or unreachable."
                }))

    except WebSocketDisconnect:
        await manager.unregister(norm_id)
    except Exception as e:
        logger.error(f"WebSocket unexpected error on peer {norm_id}: {e}")
        await manager.unregister(norm_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("relay_server:app", host="0.0.0.0", port=8000, reload=True)
