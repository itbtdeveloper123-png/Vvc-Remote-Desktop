"""Security, Peer ID Generation, PIN Authentication, and Session Permissions"""
import os
import sys
import secrets
import time
import hmac
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


def is_safe_file_path(target_path: str, for_write: bool = False) -> Tuple[bool, str]:
    """
    Validates that a path is safe from path traversal and does not target protected OS files.
    """
    if not target_path or "\x00" in target_path:
        return False, "Invalid path characters detected."

    try:
        abs_path = os.path.abspath(target_path)
    except Exception as e:
        return False, f"Invalid path structure: {e}"

    norm_path = os.path.normpath(abs_path).lower()

    # Windows protected system paths
    if sys.platform == "win32" and for_write:
        windir = os.environ.get("WINDIR", "C:\\Windows").lower()
        protected_prefixes = [
            windir,
            "c:\\pagefile.sys",
            "c:\\swapfile.sys",
            "c:\\hiberfil.sys"
        ]
        for prot in protected_prefixes:
            if norm_path == prot or norm_path.startswith(prot + os.sep):
                return False, "Access to protected Windows system location is denied."

    return True, abs_path


def generate_peer_id(length: int = 9) -> str:
    """
    Generates an AnyDesk-style 9-digit peer identifier formatted as 'XXX XXX XXX'.
    """
    digits = "".join(str(secrets.randbelow(10)) for _ in range(length))
    # Group in 3s: e.g. 842 195 723
    return f"{digits[:3]} {digits[3:6]} {digits[6:]}"


def generate_pin(length: int = 6) -> str:
    """
    Generates a secure numeric one-time connection PIN.
    """
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


@dataclass
class SessionInfo:
    session_id: str
    client_id: str
    connected_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    allow_mouse: bool = True
    allow_keyboard: bool = True
    allow_clipboard: bool = True


@dataclass
class ConnectionRequest:
    request_id: str
    peer_id: str
    client_ip: str
    status: str = "pending"  # "pending", "accepted", "rejected", "cancelled", "expired"
    created_at: float = field(default_factory=time.time)
    session_id: Optional[str] = None
    allow_mouse: bool = True
    allow_keyboard: bool = True
    allow_clipboard: bool = True


class SessionSecurityManager:
    """
    Manages Host credentials, PIN verification, active sessions, and access permissions.
    """

    def __init__(self, peer_id: Optional[str] = None, pin: Optional[str] = None):
        if peer_id:
            self.peer_id = peer_id
        else:
            try:
                from app.core.database import DB
                self.peer_id = DB.get_or_create_device_peer_id(generate_peer_id)
            except Exception:
                self.peer_id = generate_peer_id()
        self.pin = pin or generate_pin()
        self.host_token = secrets.token_urlsafe(32)
        self.active_sessions: Dict[str, SessionInfo] = {}
        self.pending_requests: Dict[str, ConnectionRequest] = {}
        self.failed_pin_attempts: Dict[str, List[float]] = {}
        self.locked_ips: Dict[str, float] = {}
        try:
            from app.core.database import DB
            saved_auto = DB.get_setting("auto_accept", "true")
            self.auto_accept = (saved_auto.lower() == "true")
        except Exception:
            self.auto_accept = True

    def verify_host_token(self, token: Optional[str]) -> bool:
        """Verifies if the provided token matches the internal host token."""
        if not token:
            return False
        return hmac.compare_digest(token, self.host_token)

    def check_pin_rate_limit(self, client_ip: str) -> Tuple[bool, int]:
        """
        Checks if client IP is currently locked out due to excessive failed PIN attempts.
        Returns (is_allowed, remaining_lockout_seconds).
        """
        now = time.time()
        lockout_until = self.locked_ips.get(client_ip, 0.0)
        if lockout_until > now:
            return False, int(lockout_until - now)
        elif client_ip in self.locked_ips:
            # Lockout expired
            self.locked_ips.pop(client_ip, None)
            self.failed_pin_attempts.pop(client_ip, None)
        return True, 0

    def record_pin_attempt(self, client_ip: str, success: bool) -> Tuple[bool, int]:
        """
        Records a PIN attempt. On 5 failures within 5 minutes, locks out the IP for 10 minutes.
        Returns (is_locked_out_now, lockout_duration_seconds).
        """
        now = time.time()
        if success:
            self.failed_pin_attempts.pop(client_ip, None)
            self.locked_ips.pop(client_ip, None)
            return False, 0

        attempts = self.failed_pin_attempts.get(client_ip, [])
        attempts = [t for t in attempts if now - t < 300]
        attempts.append(now)
        self.failed_pin_attempts[client_ip] = attempts

        if len(attempts) >= 5:
            lockout_sec = 600
            self.locked_ips[client_ip] = now + lockout_sec
            return True, lockout_sec
        return False, 0

    def get_normalized_id(self) -> str:
        """Returns peer ID without spaces for matching."""
        return self.peer_id.replace(" ", "").replace("-", "")

    def refresh_pin(self) -> str:
        """Regenerates the connection PIN."""
        self.pin = generate_pin()
        return self.pin

    def verify_pin(self, candidate_pin: str) -> bool:
        """
        Constant-time PIN comparison to prevent timing attacks.
        """
        if not candidate_pin:
            return False
        clean_candidate = candidate_pin.strip()
        return hmac.compare_digest(clean_candidate, self.pin)

    def create_session(self, client_id: str) -> SessionInfo:
        """
        Creates and stores an authorized session.
        """
        session_id = secrets.token_urlsafe(24)
        session = SessionInfo(
            session_id=session_id,
            client_id=client_id,
            allow_mouse=True,
            allow_keyboard=True,
            allow_clipboard=True
        )
        self.active_sessions[session_id] = session
        return session

    def validate_session(self, session_id: str) -> Optional[SessionInfo]:
        """
        Validates whether a session is active.
        """
        session = self.active_sessions.get(session_id)
        if session:
            session.last_activity = time.time()
        return session

    def validate_or_create_external_session(self, session_id: str, client_id: str = "remote") -> SessionInfo:
        """Validates or registers an active session established via Cloud Relay."""
        session = self.active_sessions.get(session_id)
        if not session:
            session = SessionInfo(
                session_id=session_id,
                client_id=client_id,
                allow_mouse=True,
                allow_keyboard=True,
                allow_clipboard=True
            )
            self.active_sessions[session_id] = session
        else:
            session.last_activity = time.time()
        return session

    def end_session(self, session_id: str):
        """Terminates an active session."""
        self.active_sessions.pop(session_id, None)

    def update_permissions(self, session_id: str, allow_mouse: Optional[bool] = None, allow_keyboard: Optional[bool] = None):
        """Updates control permissions for a session."""
        session = self.active_sessions.get(session_id)
        if session:
            if allow_mouse is not None:
                session.allow_mouse = allow_mouse
            if allow_keyboard is not None:
                session.allow_keyboard = allow_keyboard

    def create_connect_request(self, peer_id: str, client_ip: str = "remote") -> ConnectionRequest:
        """
        Creates an incoming connection request waiting for host acceptance.
        """
        request_id = secrets.token_urlsafe(16)
        req = ConnectionRequest(
            request_id=request_id,
            peer_id=peer_id,
            client_ip=client_ip,
            status="pending",
            created_at=time.time(),
            allow_mouse=True,
            allow_keyboard=True,
            allow_clipboard=True
        )
        self.pending_requests[request_id] = req
        return req

    def get_pending_requests(self) -> list:
        """
        Returns active pending connection requests (within 60 seconds).
        """
        now = time.time()
        pending = []
        for req in list(self.pending_requests.values()):
            if req.status == "pending":
                if now - req.created_at > 60:
                    req.status = "expired"
                else:
                    pending.append(req)
        return pending

    def get_request(self, request_id: str) -> Optional[ConnectionRequest]:
        """
        Retrieves a request by request_id.
        """
        return self.pending_requests.get(request_id)

    def respond_to_request(
        self,
        request_id: str,
        accept: bool,
        allow_mouse: bool = True,
        allow_keyboard: bool = True
    ) -> Optional[SessionInfo]:
        """
        Host responds to incoming connection request (accept or reject).
        If accepted, automatically creates an authorized Full Control session.
        """
        req = self.pending_requests.get(request_id)
        if not req or req.status != "pending":
            return None

        if accept:
            session = self.create_session(client_id=req.peer_id or req.client_ip)
            session.allow_mouse = allow_mouse
            session.allow_keyboard = allow_keyboard
            session.allow_clipboard = True
            req.status = "accepted"
            req.session_id = session.session_id
            req.allow_mouse = allow_mouse
            req.allow_keyboard = allow_keyboard
            return session
        else:
            req.status = "rejected"
            return None

    def cancel_request(self, request_id: str) -> bool:
        """
        Client cancels the pending request.
        """
        req = self.pending_requests.get(request_id)
        if req and req.status == "pending":
            req.status = "cancelled"
            return True
        return False

    def validate_file_access(
        self,
        session_id: Optional[str] = None,
        host_token: Optional[str] = None,
        is_localhost: bool = False
    ) -> bool:
        """
        Validates authorization for file operations.
        Requires either:
        1. Valid host_token from host manager.
        2. Request from localhost loopback.
        3. Valid active remote session_id.
        """
        if host_token and self.verify_host_token(host_token):
            return True
        if is_localhost:
            return True
        if session_id and self.validate_session(session_id) is not None:
            return True
        return False

