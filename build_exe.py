"""Automated PyInstaller Executable Builder for AnyDesk Pro

Compiles the desktop application into a standalone Windows executable (.exe).
"""
import sys
import os
import shutil
import subprocess
from pathlib import Path

def build():
    root_dir = Path(__file__).resolve().parent
    icon_path = root_dir / "assets" / "icon.ico"
    static_path = root_dir / "app" / "static"
    assets_path = root_dir / "assets"

    print("=" * 60)
    print("       Building Vvc Remote Standalone Windows Executable       ")
    print("=" * 60)

    # PyInstaller arguments
    pyinstaller_args = [
        sys.executable,
        "-m", "PyInstaller",
        "--name=VvcRemote",
        "--onedir",             # onedir is much faster to build and launches instantly without extracting to %TEMP% on every run
        "--windowed",           # Suppress console window for clean native desktop app feel
        f"--icon={icon_path}",
        f"--add-data={static_path};app/static",
        f"--add-data={assets_path};assets",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops.asyncio",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.http.h11_impl",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.protocols.websockets.websockets_impl",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=uvicorn.lifespan.off",
        "--hidden-import=aiortc",
        "--hidden-import=av",
        "--hidden-import=mss",
        "--hidden-import=pynput",
        "--hidden-import=sqlite3",
        "--hidden-import=winreg",
        "--hidden-import=multipart",
        "--hidden-import=app.core.autostart",
        # Exclude brittle .NET / pythonnet CLR dependencies that cause crashes on target machines
        "--exclude-module=webview",
        "--exclude-module=pythonnet",
        "--exclude-module=clr_loader",
        "--exclude-module=clr",
        "--clean",
        "--noconfirm",
        str(root_dir / "desktop_app.py")
    ]

    print("\nExecuting PyInstaller command:")
    print(" ".join(pyinstaller_args))
    print("-" * 60)

    res = subprocess.run(pyinstaller_args, cwd=str(root_dir))
    if res.returncode == 0:
        dist_exe = root_dir / "dist" / "VvcRemote" / "VvcRemote.exe"
        print("\n" + "=" * 60)
        print(" [OK] Build Successful!")
        print(f" [>] Executable Location: {dist_exe}")
        print("=" * 60)
    else:
        print("\n[!] Build failed with exit code:", res.returncode)
        sys.exit(res.returncode)

if __name__ == "__main__":
    build()
