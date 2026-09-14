"""Main Entrypoint: AnyDesk-Inspired Remote Desktop Host & Server"""
import sys
import os
import socket
import argparse
import uvicorn
from app.config import CONFIG
from app.core.screen_capture import ScreenCaptureEngine
from app.core.input_injector import Win32InputInjector
from app.core.security import SessionSecurityManager
from app.network.signaling import create_app
from app.network.discovery import PeerDiscovery


def get_local_ip() -> str:
    """Finds the primary local IP address of the machine."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def print_banner(peer_id: str, pin: str, port: int, local_ip: str, res: str, fps: int):
    print("\n" + "=" * 65)
    print("      _           _____            _      _____           ")
    print("     / \\   _ __  |  __ \\  ___  ___| | __ |  __ \\ _ __ ___ ")
    print("    / _ \\ | '_ \\ | |  | |/ _ \\/ __| |/ / | |__) | '__/ _ \\")
    print("   / ___ \\| | | || |__| |  __/\\__ \\   <  |  ___/| | | (_) |")
    print("  /_/   \\_\\_| |_||_____/ \\___||___/_|\\_\\ |_|    |_|  \\___/ ")
    print("          High-Performance Remote Desktop Prototype       ")
    print("=" * 65)
    print(f"  [+] THIS DESK ADDRESS (ID) : \033[92m{peer_id}\033[0m")
    print(f"  [+] ONE-TIME SECURITY PIN  : \033[93m{pin}\033[0m")
    print(f"  [+] MONITOR RESOLUTION     : {res} @ {fps} FPS")
    print("-" * 65)
    print(f"  [>] Local Web Dashboard   : \033[96mhttp://localhost:{port}\033[0m")
    print(f"  [>] Network Access Link    : \033[96mhttp://{local_ip}:{port}\033[0m")
    print("=" * 65)
    print("  [*] Ready for incoming remote connections. Press Ctrl+C to stop.\n")


def main():
    parser = argparse.ArgumentParser(description="AnyDesk-Inspired Remote Desktop Host")
    parser.add_argument("--port", type=int, default=CONFIG.network.port, help="Signaling / Web port (default: 8000)")
    parser.add_argument("--host", type=str, default=CONFIG.network.host, help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--fps", type=int, default=CONFIG.capture.target_fps, help="Target screen capture FPS (default: 30)")
    parser.add_argument("--scale", type=float, default=CONFIG.capture.scale_factor, help="Screen scale factor (default: 1.0)")
    parser.add_argument("--pin", type=str, default=None, help="Custom connection PIN")
    parser.add_argument("--peer-id", type=str, default=None, help="Custom Peer ID")
    args = parser.parse_args()

    # 1. Initialize Screen Capture Engine
    capture_engine = ScreenCaptureEngine(
        target_fps=args.fps,
        scale_factor=args.scale,
        capture_cursor=CONFIG.capture.capture_cursor
    )
    capture_engine.start()

    # 2. Initialize Win32 Input Injector
    input_injector = Win32InputInjector(allow_mouse=True, allow_keyboard=True)

    # 3. Initialize Security Manager
    security_manager = SessionSecurityManager(peer_id=args.peer_id, pin=args.pin)

    # 4. Initialize Peer Discovery Engine
    discovery = PeerDiscovery(peer_id=security_manager.peer_id, port=args.port)
    discovery.start()

    # 5. Construct FastAPI Application
    app = create_app(capture_engine, input_injector, security_manager, discovery=discovery)

    local_ip = get_local_ip()
    res_str = f"{capture_engine.screen_width}x{capture_engine.screen_height}"
    print_banner(
        peer_id=security_manager.peer_id,
        pin=security_manager.pin,
        port=args.port,
        local_ip=local_ip,
        res=res_str,
        fps=args.fps
    )

    # 6. Start Server
    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
    except KeyboardInterrupt:
        print("\n[!] Shutting down host...")
    finally:
        discovery.stop()
        capture_engine.stop()


if __name__ == "__main__":
    main()
