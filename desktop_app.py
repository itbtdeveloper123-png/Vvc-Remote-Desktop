"""Vvc Remote: Native Desktop Application Launcher

Runs the internal host and signaling daemon in a background thread
and presents the Vvc Remote interface inside a native desktop window (Chromium App Mode).
"""
import sys
import os

# PyInstaller --windowed environment fix: sys.stdout/stderr are None, which causes
# uvicorn and colorama isatty() checks to raise AttributeError
if sys.stdout is None:
    try:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    except Exception:
        pass
if sys.stderr is None:
    try:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")
    except Exception:
        pass

import time
import socket
import threading
import urllib.request
import subprocess
import shutil
import tempfile
import webbrowser
from pathlib import Path
from typing import Optional
import uvicorn

from app.config import CONFIG
from app.core.screen_capture import ScreenCaptureEngine
from app.core.input_injector import Win32InputInjector
from app.core.security import SessionSecurityManager
from app.network.signaling import create_app
from app.network.discovery import PeerDiscovery


LOG_FILE = Path(tempfile.gettempdir()) / "vvc_remote.log"

def log_msg(msg: str):
    """Writes log messages to both console and temporary log file."""
    try:
        t = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{t}] {msg}\n")
    except Exception:
        pass
    print(msg)


def find_available_port(start_port: int = 8000, max_attempts: int = 50) -> int:
    """Finds an available TCP port starting from start_port."""
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start_port


def is_anydesk_server_running(port: int = 8000) -> bool:
    """Checks if an AnyDesk Pro host is already running and responsive on the specified port."""
    url = f"http://127.0.0.1:{port}/api/info"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AnyDeskProLauncher"})
        with urllib.request.urlopen(req, timeout=0.8) as resp:
            if resp.status == 200:
                import json
                data = json.loads(resp.read().decode("utf-8"))
                return "peer_id" in data
    except Exception:
        return False
    return False


def wait_for_server(url: str, timeout: float = 8.0) -> bool:
    """Waits until the local server responds with HTTP 200."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(f"{url}/api/info", timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)
    return False


def find_app_browser() -> Optional[str]:
    """Finds a Chromium-based browser executable for native App mode."""
    candidates = [
        # Microsoft Edge (Installed by default on Windows 10 and 11)
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
        shutil.which("msedge"),
        # Google Chrome
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        shutil.which("chrome"),
        shutil.which("google-chrome"),
        # Brave Browser
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        shutil.which("brave"),
    ]
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def launch_browser_app(browser_path: str, url: str) -> subprocess.Popen:
    """
    Launches the URL in dedicated borderless application window mode.
    Forces --new-window to guarantee the window appears even if browser background tasks exist.
    """
    cmd = [
        browser_path,
        "--new-window",
        f"--app={url}",
        "--window-size=1240,800",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-notifications",
        "--disable-features=Translate,OptimizationHints,MediaRouter",
    ]
    return subprocess.Popen(cmd)


class DesktopApplication:
    """
    Manages the lifecycle of the internal server and native desktop window.
    """

    def __init__(self, port: Optional[int] = None):
        self.port = port or find_available_port(CONFIG.network.port)
        self.server_url = f"http://127.0.0.1:{self.port}"
        self.server = None
        self.server_thread = None
        self.capture_engine = None
        self.input_injector = None
        self.security_manager = None
        self.discovery = None

    def start_backend(self):
        """Initializes engines and starts background server daemon."""
        # 1. Screen capture engine
        self.capture_engine = ScreenCaptureEngine(
            target_fps=CONFIG.capture.target_fps,
            scale_factor=CONFIG.capture.scale_factor,
            capture_cursor=CONFIG.capture.capture_cursor
        )
        self.capture_engine.start()

        # 2. Input simulation engine
        self.input_injector = Win32InputInjector(allow_mouse=True, allow_keyboard=True)

        # 3. Security manager
        self.security_manager = SessionSecurityManager()

        # 4. Peer discovery engine (localhost multi-instance & LAN UDP broadcast)
        self.discovery = PeerDiscovery(peer_id=self.security_manager.peer_id, port=self.port)
        self.discovery.start()

        # 5. Construct FastAPI application
        app = create_app(
            self.capture_engine,
            self.input_injector,
            self.security_manager,
            discovery=self.discovery
        )

        # 6. Launch uvicorn in dedicated background thread
        uv_config = uvicorn.Config(
            app=app,
            host="0.0.0.0",
            port=self.port,
            log_level="warning",
            log_config=None,
            loop="asyncio"
        )
        self.server = uvicorn.Server(config=uv_config)

        self.server_thread = threading.Thread(
            target=self.server.run,
            name="AnyDeskBackendServer",
            daemon=True
        )
        self.server_thread.start()

        # Ensure Start with Windows (Silent) is enabled automatically by default
        try:
            from app.core.autostart import is_autostart_enabled, set_autostart
            if not is_autostart_enabled():
                set_autostart(True)
                log_msg("[VvcRemote] Automatic Windows startup enabled by default.")
        except Exception as e:
            log_msg(f"[VvcRemote] Autostart registration note: {e}")

    def shutdown(self):
        """Clean shutdown of all engines and server."""
        log_msg("[VvcRemote] Shutting down desktop application...")
        if self.discovery:
            self.discovery.stop()
        if self.capture_engine:
            self.capture_engine.stop()
        if self.server:
            self.server.should_exit = True

    def run_background(self):
        """Runs the native desktop application in silent background daemon mode (Auto-startup)."""
        log_msg(f"[VvcRemote] Starting Vvc Remote silent background host on port {self.port}...")
        self.start_backend()

        if not wait_for_server(self.server_url):
            log_msg("[VvcRemote] Error: Backend server timed out. Exiting.")
            self.shutdown()
            sys.exit(1)

        log_msg(f"[VvcRemote] Background daemon online at {self.server_url}. Waiting for connections...")
        try:
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            self.shutdown()

    def run(self):
        """Runs the native desktop application with UI window."""
        log_msg(f"[VvcRemote] Starting internal backend on port {self.port}...")
        self.start_backend()

        # Wait for internal server to be ready
        if not wait_for_server(self.server_url):
            log_msg("[VvcRemote] Error: Backend server timed out. Exiting.")
            self.shutdown()
            sys.exit(1)

        log_msg(f"[VvcRemote] Backend ready at {self.server_url}. Launching native GUI...")

        # 1. Primary: Native Chromium App Mode (Chrome/Edge/Brave)
        browser_path = find_app_browser()
        launched = False
        if browser_path:
            log_msg(f"[VvcRemote] Launching native application window via: {browser_path}")
            try:
                launch_browser_app(browser_path, self.server_url)
                launched = True
            except Exception as e:
                log_msg(f"[VvcRemote] Native app mode failed ({e})")

        # 2. Fallback: Default system browser
        if not launched:
            log_msg("[VvcRemote] Opening in default web browser...")
            webbrowser.open(self.server_url)

        # Keep server running for the application session
        try:
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            self.shutdown()


def kill_legacy_instances():
    """Terminates any orphaned AnyDeskPro instances that might hold port 8000."""
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        subprocess.run(
            ["taskkill", "/F", "/IM", "AnyDeskPro.exe", "/T"],
            capture_output=True,
            startupinfo=startupinfo
        )
    except Exception:
        pass


def main():
    try:
        kill_legacy_instances()
        args = sys.argv[1:]
        is_background = any(arg in args for arg in ("--background", "--silent", "--minimized", "-b"))

        log_msg(f"[VvcRemote] Initializing Vvc Remote (background={is_background})...")

        # 1. Handle Auto-Startup / Background Silent Mode
        if is_background:
            if is_anydesk_server_running(CONFIG.network.port):
                log_msg(f"[VvcRemote] Vvc Remote is already running on port {CONFIG.network.port}. Exiting duplicate background request.")
                return
            app = DesktopApplication(port=CONFIG.network.port)
            app.run_background()
            return

        # 2. Normal Interactive Launch (User double-clicked application)
        # If Vvc Remote is already running in background on port 8000, connect GUI directly!
        if is_anydesk_server_running(CONFIG.network.port):
            log_msg(f"[VvcRemote] Active background host detected on port {CONFIG.network.port}. Opening GUI window directly...")
            server_url = f"http://127.0.0.1:{CONFIG.network.port}"
            browser_path = find_app_browser()
            if browser_path:
                try:
                    launch_browser_app(browser_path, server_url)
                    return
                except Exception:
                    pass
            webbrowser.open(server_url)
            return

        # 3. Not running yet: Start backend and launch UI window
        app = DesktopApplication()
        app.run()

    except Exception as exc:
        import traceback
        log_msg(f"[DesktopApp] FATAL EXCEPTION: {exc}\n{traceback.format_exc()}")
        raise


if __name__ == "__main__":
    main()
