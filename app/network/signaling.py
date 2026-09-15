"""FastAPI Signaling Server and Unified Endpoint Router"""
import sys
import os
import shutil
import string
import json
import socket
import platform
from pathlib import Path
from typing import Optional, List, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.core.screen_capture import ScreenCaptureEngine
from app.core.input_injector import Win32InputInjector
from app.core.security import SessionSecurityManager, is_safe_file_path
from app.network.webrtc_host import WebRTCHostManager
from app.network.websocket_stream import WebSocketStreamManager
from app.config import CONFIG

# Pydantic models for API
class AuthRequest(BaseModel):
    peer_id: str
    pin: str

class AuthResponse(BaseModel):
    success: bool
    session_id: Optional[str] = None
    message: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None

class ConnectInitRequest(BaseModel):
    peer_id: str                   # Identity of requester
    target_id: Optional[str] = None # Optional target being contacted
    client_name: Optional[str] = None

class ConnectInitResponse(BaseModel):
    success: bool
    request_id: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None

class ConnectStatusResponse(BaseModel):
    request_id: str
    status: str
    session_id: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    message: Optional[str] = None

class ConnectRespondRequest(BaseModel):
    request_id: str
    action: str  # "accept" or "reject"
    allow_mouse: bool = True
    allow_keyboard: bool = True

class ConnectCancelRequest(BaseModel):
    request_id: str

class WebRTCOfferRequest(BaseModel):
    sdp: str
    type: str
    session_id: str

class PermissionsUpdateRequest(BaseModel):
    allow_mouse: Optional[bool] = None
    allow_keyboard: Optional[bool] = None

class MkdirRequest(BaseModel):
    path: str
    folder_name: str
    session_id: Optional[str] = None

class DeleteFileRequest(BaseModel):
    path: str
    session_id: Optional[str] = None


def create_app(
    capture_engine: ScreenCaptureEngine,
    input_injector: Win32InputInjector,
    security_manager: SessionSecurityManager,
    discovery: Optional[Any] = None,
    cloud_relay: Optional[Any] = None
) -> FastAPI:
    """
    Constructs the FastAPI application instance wired to the engine components.
    """
    app = FastAPI(title="AnyDesk-Inspired Remote Desktop Host", version="1.0.0")

    # Secure CORS configuration: allow loopback and local private networks
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:[0-9]+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Security & Boundary Verification Helpers ---
    def is_local_request(req: Request) -> bool:
        """Determines if the request originates from localhost or the internal test harness."""
        if not req.client:
            return False
        host = req.client.host
        return host in ("127.0.0.1", "::1", "localhost", "testclient")

    def is_authorized_host(req: Request) -> bool:
        """Verifies if caller has Host Administrator authority."""
        token = req.headers.get("X-Host-Token") or req.cookies.get("vvc_host_token")
        if token and security_manager.verify_host_token(token):
            return True
        if is_local_request(req):
            sec_fetch = req.headers.get("Sec-Fetch-Site", "")
            if sec_fetch not in ("cross-site",):
                return True
        return False

    def require_host_authorization(req: Request):
        """Raises 403 Forbidden if not authorized host."""
        if not is_authorized_host(req):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: This action requires local host administrator privileges."
            )

    def verify_file_access(req: Request, session_id: Optional[str] = None):
        """
        Ensures caller has permission to perform file operations (local host or valid active session).
        """
        if is_authorized_host(req):
            return True
        sid = session_id or req.headers.get("X-Session-ID") or req.query_params.get("session_id")
        if sid and security_manager.validate_session(sid):
            return True
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: File operations require an active authorized session or host privileges."
        )

    webrtc_manager = WebRTCHostManager(capture_engine, input_injector, security_manager)
    ws_stream_manager = WebSocketStreamManager(capture_engine, input_injector, security_manager)

    # Wire Cloud Relay callbacks if available
    if cloud_relay:
        async def _on_relay_connect_request(data: dict):
            sender = data.get("from", "Remote Client")
            req = security_manager.create_connect_request(
                peer_id=sender,
                client_ip=f"Cloud Relay ({sender})"
            )
            if getattr(security_manager, "auto_accept", False):
                security_manager.respond_to_request(
                    request_id=req.request_id,
                    accept=True,
                    allow_mouse=True,
                    allow_keyboard=True
                )
                return {
                    "status": "accepted",
                    "session_id": req.session_id,
                    "auto_accepted": True
                }
            else:
                for _ in range(60):
                    await asyncio.sleep(0.5)
                    curr = security_manager.connect_requests.get(req.request_id)
                    if not curr or curr.status != "pending":
                        if curr and curr.status == "accepted":
                            return {
                                "status": "accepted",
                                "session_id": curr.session_id
                            }
                        else:
                            return {"status": "rejected"}
                return {"status": "timeout"}

        async def _on_relay_offer(data: dict):
            sdp = data.get("sdp")
            offer_type = data.get("offer_type", "offer")
            sid = data.get("session_id")
            if sid:
                security_manager.validate_or_create_external_session(sid)
            answer = await webrtc_manager.handle_offer(sdp, offer_type)
            return answer

        cloud_relay.on_incoming_request = _on_relay_connect_request
        cloud_relay.on_offer_received = _on_relay_offer

    # Static assets directory (supports normal and PyInstaller bundled environments)
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        static_dir = Path(sys._MEIPASS) / "app" / "static"
        if not static_dir.exists():
            static_dir = Path(sys._MEIPASS) / "static"
    else:
        static_dir = Path(__file__).resolve().parent.parent / "static"

    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
        assets_dir = static_dir / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        index_file = static_dir / "index.html"
        if index_file.exists():
            resp = FileResponse(index_file)
            if is_local_request(request):
                resp.set_cookie(
                    key="vvc_host_token",
                    value=security_manager.host_token,
                    httponly=False,
                    samesite="lax"
                )
            return resp
        return HTMLResponse("<h2>Remote Desktop Host Running</h2>")

    @app.get("/icon.ico")
    @app.get("/favicon.ico")
    async def get_favicon():
        ico = static_dir / "icon.ico"
        if ico.exists():
            return FileResponse(ico)
        return HTMLResponse(status_code=404)

    @app.get("/api/info")
    async def get_host_info(request: Request):
        local_ip = "127.0.0.1"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass

        stats = capture_engine.get_stats()
        is_host = is_authorized_host(request)
        return {
            "peer_id": security_manager.peer_id,
            "hostname": platform.node() or "Windows Desktop",
            "local_ip": local_ip,
            # Only reveal PIN and host token to the local machine owner!
            "pin": security_manager.pin if is_host else None,
            "host_token": security_manager.host_token if is_host else None,
            "is_host": is_host,
            "width": stats["width"],
            "height": stats["height"],
            "target_fps": stats["target_fps"],
            "actual_fps": stats["actual_fps"],
            "active_sessions": len(security_manager.active_sessions),
            "pending_requests": len(security_manager.get_pending_requests()) if is_host else 0,
            "allow_mouse": input_injector.allow_mouse,
            "allow_keyboard": input_injector.allow_keyboard,
            "ice_servers": CONFIG.network.ice_servers
        }

    # --- Peer Discovery and Resolution Endpoint ---
    @app.get("/api/resolve-peer")
    async def resolve_peer_endpoint(target: str):
        clean = target.strip()
        if not clean:
            return {"success": False, "message": "Target cannot be empty"}

        # 1. Use discovery engine if available
        if discovery:
            res = discovery.resolve(clean)
            if res and res.get("type") != "self":
                return {"success": True, **res}

        # 2. Direct IP / URL check
        if ":" in clean or (clean.count(".") >= 3 and any(c.isdigit() for c in clean)) or clean.startswith("http"):
            url = clean if clean.startswith("http") else f"http://{clean}"
            return {"success": True, "url": url, "peer_id": None, "type": "direct"}

        # 3. Check if self
        norm_clean = clean.replace(" ", "").replace("-", "")
        if norm_clean == security_manager.get_normalized_id():
            return {"success": False, "message": "មិនអាចភ្ជាប់ទៅកាន់កុំព្យូទ័រខ្លួនឯងបានទេ (Cannot connect to your own desktop)"}

        # 4. Check Central Cloud Relay (Global WAN)
        relay_url = getattr(CONFIG.network, "central_relay_url", "https://vvc-remote-relay.onrender.com")
        if relay_url:
            try:
                import urllib.request
                import json
                req = urllib.request.Request(
                    f"{relay_url.rstrip('/')}/api/resolve/{norm_clean}",
                    headers={"User-Agent": "VvcRemote/1.2"}
                )
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode())
                        if data.get("online"):
                            return {
                                "success": True,
                                "peer_id": norm_clean,
                                "type": "relay",
                                "relay": True,
                                "is_relay": True,
                                "online": True,
                                "relay_url": relay_url
                            }
            except Exception:
                pass

        return {"success": False, "message": f"រកមិនឃើញកុំព្យូទ័រ '{target}' ឡើយ (កុំព្យូទ័រនោះអាចមិនទាន់បើក ឬនៅក្រៅបណ្តាញ)"}

    @app.get("/api/peers")
    async def get_discovered_peers():
        peers = discovery.get_all_peers() if discovery and hasattr(discovery, "get_all_peers") else []
        return {"success": True, "peers": peers}

    # --- SQLite Connection History Endpoints ---
    @app.get("/api/history")
    async def get_connection_history():
        try:
            from app.core.database import DB
            items = DB.get_recent_connections(30)
            return {"success": True, "history": items}
        except Exception as e:
            return {"success": False, "history": [], "error": str(e)}

    @app.post("/api/history")
    async def add_connection_history(req: Request):
        try:
            data = await req.json()
            from app.core.database import DB
            hid = DB.record_connection(
                remote_id=data.get("remote_id", ""),
                alias=data.get("alias"),
                remote_ip=data.get("remote_ip", ""),
                direction=data.get("direction", "outgoing"),
                status=data.get("status", "connected")
            )
            return {"success": True, "id": hid}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @app.delete("/api/history/{history_id}")
    async def delete_history_entry(history_id: int, request: Request):
        require_host_authorization(request)
        try:
            from app.core.database import DB
            DB.delete_history_item(history_id)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @app.delete("/api/history")
    async def clear_all_history(request: Request):
        require_host_authorization(request)
        try:
            from app.core.database import DB
            DB.clear_history()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @app.post("/api/history/alias")
    async def update_peer_alias(req: Request):
        try:
            data = await req.json()
            from app.core.database import DB
            DB.set_alias(data.get("remote_id", ""), data.get("alias", ""))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # --- Windows Auto-Startup Settings Endpoints ---
    @app.get("/api/autostart")
    async def get_autostart_status(request: Request):
        require_host_authorization(request)
        try:
            from app.core.autostart import is_autostart_enabled
            return {"success": True, "enabled": is_autostart_enabled()}
        except Exception as e:
            return {"success": False, "enabled": False, "error": str(e)}

    @app.post("/api/autostart")
    async def set_autostart_status(req: Request):
        require_host_authorization(req)
        try:
            data = await req.json()
            enable = bool(data.get("enabled", False))
            from app.core.autostart import set_autostart
            ok, msg = set_autostart(enable)
            return {"success": ok, "enabled": enable, "message": msg}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # --- Auto-Accept Unattended Access Endpoints ---
    @app.get("/api/settings/auto-accept")
    async def get_auto_accept_status(request: Request):
        require_host_authorization(request)
        return {"success": True, "enabled": bool(security_manager.auto_accept)}

    @app.post("/api/settings/auto-accept")
    async def set_auto_accept_status(req: Request):
        require_host_authorization(req)
        try:
            data = await req.json()
            enabled = bool(data.get("enabled", True))
            security_manager.auto_accept = enabled
            from app.core.database import DB
            DB.set_setting("auto_accept", "true" if enabled else "false")
            return {"success": True, "enabled": enabled, "message": "Auto-accept updated"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # --- Host Input Permissions ---
    @app.post("/api/permissions")
    async def update_host_permissions(req: Request):
        require_host_authorization(req)
        try:
            data = await req.json()
            if "allow_mouse" in data:
                input_injector.allow_mouse = bool(data["allow_mouse"])
            if "allow_keyboard" in data:
                input_injector.allow_keyboard = bool(data["allow_keyboard"])
            return {
                "success": True,
                "allow_mouse": input_injector.allow_mouse,
                "allow_keyboard": input_injector.allow_keyboard
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # --- Host Security PIN Management ---
    @app.post("/api/refresh-pin")
    async def refresh_host_pin(request: Request):
        require_host_authorization(request)
        try:
            new_pin = security_manager.refresh_pin()
            return {"success": True, "pin": new_pin}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # --- Interactive Connection Approval Lifecycle ---
    @app.post("/api/connect-request", response_model=ConnectInitResponse)
    async def create_connect_request(req_data: ConnectInitRequest, request: Request):
        client_host = request.client.host if request.client else "Remote Client"

        # Validate that the requested Peer ID matches this host
        norm_req_id = req_data.peer_id.replace(" ", "").replace("-", "")
        norm_host_id = security_manager.get_normalized_id()
        if norm_req_id != norm_host_id:
            return ConnectInitResponse(
                success=False,
                message="Target Peer ID not found on this machine."
            )

        req = security_manager.create_connect_request(
            peer_id=req_data.peer_id,
            client_ip=client_host
        )
        # If Auto-Accept is enabled, instantly authorize the full control session!
        if getattr(security_manager, "auto_accept", False):
            security_manager.respond_to_request(
                request_id=req.request_id,
                accept=True,
                allow_mouse=True,
                allow_keyboard=True
            )
        return ConnectInitResponse(
            success=True,
            request_id=req.request_id,
            status=req.status
        )

    @app.get("/api/connect-request/status", response_model=ConnectStatusResponse)
    async def get_connect_status(request_id: str):
        req = security_manager.get_request(request_id)
        if not req:
            raise HTTPException(status_code=404, detail="Connection request not found.")

        if req.status == "accepted":
            stats = capture_engine.get_stats()
            return ConnectStatusResponse(
                request_id=req.request_id,
                status="accepted",
                session_id=req.session_id,
                width=stats["width"],
                height=stats["height"]
            )
        elif req.status == "rejected":
            return ConnectStatusResponse(
                request_id=req.request_id,
                status="rejected",
                message="Connection was declined by the remote computer."
            )
        elif req.status == "cancelled":
            return ConnectStatusResponse(
                request_id=req.request_id,
                status="cancelled",
                message="Connection request was cancelled."
            )
        elif req.status == "expired":
            return ConnectStatusResponse(
                request_id=req.request_id,
                status="expired",
                message="Connection request timed out without response."
            )
        else:
            return ConnectStatusResponse(
                request_id=req.request_id,
                status="pending"
            )

    @app.get("/api/connect-requests")
    @app.get("/api/connect-request/pending")
    async def get_pending_requests(request: Request):
        require_host_authorization(request)
        pending = security_manager.get_pending_requests()
        return {
            "requests": [
                {
                    "request_id": r.request_id,
                    "peer_id": r.peer_id,
                    "client_ip": r.client_ip,
                    "created_at": r.created_at
                }
                for r in pending
            ]
        }

    @app.post("/api/connect-request/respond")
    async def respond_to_connect_request(body: ConnectRespondRequest, request: Request):
        require_host_authorization(request)
        action = body.action.lower()
        if action == "accept":
            req = security_manager.get_request(body.request_id)
            session = security_manager.respond_to_request(
                request_id=body.request_id,
                accept=True,
                allow_mouse=body.allow_mouse,
                allow_keyboard=body.allow_keyboard
            )
            if not session:
                return {"success": False, "message": "Request expired or already responded."}
            
            # Immediately enable Full Control on host input injector
            input_injector.allow_mouse = True
            input_injector.allow_keyboard = True

            # Record incoming connection in SQLite database history
            if req:
                try:
                    from app.core.database import DB
                    DB.record_connection(
                        remote_id=req.peer_id,
                        remote_ip=req.client_ip,
                        direction="incoming",
                        status="connected"
                    )
                except Exception:
                    pass

            return {
                "success": True,
                "status": "accepted",
                "session_id": session.session_id
            }
        elif action == "reject":
            security_manager.respond_to_request(request_id=body.request_id, accept=False)
            return {"success": True, "status": "rejected"}
        else:
            raise HTTPException(status_code=400, detail="Invalid action. Use 'accept' or 'reject'.")

    @app.post("/api/connect-request/cancel")
    async def cancel_connect_request(body: ConnectCancelRequest):
        success = security_manager.cancel_request(body.request_id)
        return {"success": success}

    # --- PIN Auth Endpoint with Brute-Force Rate Limiting ---
    @app.post("/api/auth", response_model=AuthResponse)
    async def authenticate(req: AuthRequest, request: Request):
        client_ip = request.client.host if request.client else "unknown"

        # 1. Verify brute force lockout
        allowed, remaining_lockout = security_manager.check_pin_rate_limit(client_ip)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed PIN attempts. IP locked out for {remaining_lockout} seconds."
            )

        norm_req_id = req.peer_id.replace(" ", "").replace("-", "")
        norm_host_id = security_manager.get_normalized_id()

        if norm_req_id != norm_host_id:
            security_manager.record_pin_attempt(client_ip, success=False)
            return AuthResponse(success=False, message="Invalid Peer ID. Remote machine not found.")

        if not security_manager.verify_pin(req.pin):
            locked_out, lock_sec = security_manager.record_pin_attempt(client_ip, success=False)
            if locked_out:
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many failed PIN attempts. IP locked out for {lock_sec} seconds."
                )
            return AuthResponse(success=False, message="Incorrect PIN. Connection rejected.")

        # Successful PIN verification -> reset lockout counter
        security_manager.record_pin_attempt(client_ip, success=True)

        session = security_manager.create_session(client_id="web_client")
        session.allow_mouse = True
        session.allow_keyboard = True
        input_injector.allow_mouse = True
        input_injector.allow_keyboard = True

        stats = capture_engine.get_stats()
        return AuthResponse(
            success=True,
            session_id=session.session_id,
            width=stats["width"],
            height=stats["height"]
        )

    @app.post("/api/webrtc/offer")
    async def handle_webrtc_offer(offer_req: WebRTCOfferRequest):
        session = security_manager.validate_session(offer_req.session_id)
        if not session:
            raise HTTPException(status_code=401, detail="Unauthorized session. Connection not accepted.")

        answer = await webrtc_manager.handle_offer(offer_req.sdp, offer_req.type)
        return answer

    @app.websocket("/ws/stream")
    async def websocket_stream_endpoint(websocket: WebSocket, session_id: str = ""):
        session = security_manager.validate_session(session_id)
        if not session:
            await websocket.close(code=4001, reason="Unauthorized session")
            return
        await ws_stream_manager.handle_stream(websocket, session_id)

    # --- Global Cloud Relay Remote Access Endpoints ---
    class RelayConnectInitRequest(BaseModel):
        target_peer_id: str

    @app.post("/api/relay/connect-request")
    async def handle_relay_connect_request(req_data: RelayConnectInitRequest, request: Request):
        require_host_authorization(request)
        if not cloud_relay:
            return {"success": False, "message": "Cloud Relay client is not enabled"}
        res = await cloud_relay.request_remote_connect(req_data.target_peer_id, timeout=45.0)
        return res

    class RelayWebRTCOfferRequest(BaseModel):
        target_peer_id: str
        sdp: str
        offer_type: str = "offer"
        session_id: Optional[str] = None

    @app.post("/api/relay/webrtc-offer")
    async def handle_relay_webrtc_offer(offer_req: RelayWebRTCOfferRequest, request: Request):
        if not cloud_relay:
            return {"success": False, "message": "Cloud Relay client is not enabled"}
        res = await cloud_relay.request_webrtc_offer(
            target_id=offer_req.target_peer_id,
            sdp=offer_req.sdp,
            offer_type=offer_req.offer_type,
            session_id=offer_req.session_id,
            timeout=30.0
        )
        return res

    # --- Remote File Explorer & Transfer Endpoints ---
    @app.get("/api/files/drives")
    async def get_drives(request: Request, session_id: Optional[str] = None):
        verify_file_access(request, session_id)
        drives = []
        if sys.platform == "win32":
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for letter in string.ascii_uppercase:
                if bitmask & 1:
                    drive_path = f"{letter}:\\"
                    drives.append({
                        "path": drive_path,
                        "label": f"Local Disk ({letter}:)",
                        "name": f"{letter}:"
                    })
                bitmask >>= 1
        else:
            drives.append({"path": "/", "label": "Root (/)", "name": "/"})

        user_home = os.path.expanduser("~")
        shortcuts = [
            {"name": "Home", "path": user_home},
            {"name": "Desktop", "path": os.path.join(user_home, "Desktop")},
            {"name": "Downloads", "path": os.path.join(user_home, "Downloads")},
            {"name": "Documents", "path": os.path.join(user_home, "Documents")}
        ]
        valid_shortcuts = [s for s in shortcuts if os.path.exists(s["path"])]
        default_dir = os.path.join(user_home, "Desktop") if os.path.exists(os.path.join(user_home, "Desktop")) else (drives[0]["path"] if drives else user_home)

        return {
            "drives": drives,
            "shortcuts": valid_shortcuts,
            "default_path": default_dir
        }

    @app.get("/api/files/list")
    async def list_files(request: Request, path: str = "C:\\", session_id: Optional[str] = None):
        verify_file_access(request, session_id)
        ok, target_path = is_safe_file_path(path, for_write=False)
        if not ok:
            raise HTTPException(status_code=403, detail=target_path)

        if not os.path.exists(target_path):
            raise HTTPException(status_code=404, detail="Directory not found")
        if not os.path.isdir(target_path):
            raise HTTPException(status_code=400, detail="Path is not a directory")

        items = []
        try:
            with os.scandir(target_path) as it:
                for entry in it:
                    try:
                        stat = entry.stat()
                        is_dir = entry.is_dir(follow_symlinks=False)
                        items.append({
                            "name": entry.name,
                            "path": entry.path,
                            "is_dir": is_dir,
                            "size": 0 if is_dir else stat.st_size,
                            "modified": stat.st_mtime
                        })
                    except (PermissionError, OSError):
                        pass
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied accessing this directory")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

        parent = os.path.dirname(target_path)
        if parent == target_path:
            parent = None

        return {
            "current_path": target_path,
            "parent_path": parent,
            "items": items
        }

    @app.get("/api/files/download")
    async def download_file(request: Request, path: str, session_id: Optional[str] = None):
        verify_file_access(request, session_id)
        ok, target_path = is_safe_file_path(path, for_write=False)
        if not ok:
            raise HTTPException(status_code=403, detail=target_path)

        if not os.path.isfile(target_path):
            raise HTTPException(status_code=404, detail="File not found")
        filename = os.path.basename(target_path)
        return FileResponse(
            path=target_path,
            filename=filename,
            media_type="application/octet-stream"
        )

    @app.post("/api/files/upload")
    async def upload_file(
        request: Request,
        path: str = Form(...),
        session_id: Optional[str] = Form(None),
        file: UploadFile = File(...)
    ):
        verify_file_access(request, session_id)
        ok, target_dir = is_safe_file_path(path, for_write=True)
        if not ok:
            raise HTTPException(status_code=403, detail=target_dir)

        if not os.path.isdir(target_dir):
            raise HTTPException(status_code=400, detail="Target directory does not exist")

        safe_filename = os.path.basename(file.filename) if file.filename else "upload.bin"
        if not safe_filename or safe_filename in (".", ".."):
            raise HTTPException(status_code=400, detail="Invalid filename")

        dest_path = os.path.join(target_dir, safe_filename)
        ok_dest, dest_path = is_safe_file_path(dest_path, for_write=True)
        if not ok_dest:
            raise HTTPException(status_code=403, detail=dest_path)

        try:
            with open(dest_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            return {"success": True, "filename": safe_filename, "path": dest_path}
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied to write to this directory")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            file.file.close()

    @app.post("/api/files/mkdir")
    async def make_directory(req: MkdirRequest, request: Request):
        verify_file_access(request, req.session_id)
        safe_folder = os.path.basename(req.folder_name) if req.folder_name else ""
        if not safe_folder or safe_folder in (".", ".."):
            raise HTTPException(status_code=400, detail="Invalid folder name")

        target = os.path.join(os.path.abspath(req.path), safe_folder)
        ok, target = is_safe_file_path(target, for_write=True)
        if not ok:
            raise HTTPException(status_code=403, detail=target)

        try:
            os.makedirs(target, exist_ok=False)
            return {"success": True, "path": target}
        except FileExistsError:
            raise HTTPException(status_code=400, detail="Folder already exists")
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.delete("/api/files/delete")
    async def delete_file_endpoint(req: DeleteFileRequest, request: Request):
        verify_file_access(request, req.session_id)
        ok, target = is_safe_file_path(req.path, for_write=True)
        if not ok:
            raise HTTPException(status_code=403, detail=target)

        if not os.path.exists(target):
            raise HTTPException(status_code=404, detail="File or folder not found")
        try:
            if os.path.isdir(target):
                shutil.rmtree(target)
            else:
                os.remove(target)
            return {"success": True}
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/screen/wake")
    async def wake_and_unlock_screen(request: Request, session_id: Optional[str] = None):
        """Wakes screen and simulates space/enter to dismiss Windows lock screen."""
        verify_file_access(request, session_id)
        try:
            from app.core.desktop_helper import ensure_input_desktop
            ensure_input_desktop()
            # Simulate space keydown/up to wake screen and slide lock screen up
            input_injector.key_event("Space", " ", "down")
            input_injector.key_event("Space", " ", "up")
            # Also simulate enter key
            input_injector.key_event("Enter", "Enter", "down")
            input_injector.key_event("Enter", "Enter", "up")
            return {"success": True, "message": "Screen wake & unlock signal sent"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    return app

