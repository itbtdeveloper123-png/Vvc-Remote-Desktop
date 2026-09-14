"""Vvc Remote: Standalone Single-File Setup Installer

Self-extracting installer that deploys Vvc Remote to %LOCALAPPDATA%\\Programs\\VvcRemote,
creates Desktop and Start Menu shortcuts, and launches the application automatically.
Requires no administrator privileges.
"""
import sys
import os
import time
import shutil
import zipfile
import secrets
import tempfile
import threading
import subprocess
from pathlib import Path
from typing import Optional

# Setup Constants
APP_DISPLAY_NAME = "Vvc Remote"
APP_EXE_NAME = "VvcRemote.exe"
INSTALL_SUBDIR = Path("Programs") / "VvcRemote"


def get_target_install_dir() -> Path:
    """Returns %LOCALAPPDATA%\\Programs\\VvcRemote."""
    local_app_data = os.environ.get("LOCALAPPDATA", tempfile.gettempdir())
    return Path(local_app_data) / INSTALL_SUBDIR


def get_payload_path() -> Optional[Path]:
    """Locates the bundled vvc_payload.zip archive."""
    # 1. PyInstaller bundled location
    if hasattr(sys, "_MEIPASS"):
        bundled = Path(sys._MEIPASS) / "vvc_payload.zip"
        if bundled.exists():
            return bundled

    # 2. Local development / directory location
    script_dir = Path(__file__).resolve().parent
    dev_payload = script_dir / "dist" / "vvc_payload.zip"
    if dev_payload.exists():
        return dev_payload

    # 3. Direct alongside installer exe
    alongside = Path(sys.executable).parent / "vvc_payload.zip"
    if alongside.exists():
        return alongside

    return None


def create_windows_shortcut(target_exe: Path, shortcut_path: Path, icon_path: Optional[Path] = None):
    """Creates a Windows .lnk shortcut using built-in WScript.Shell without external libraries."""
    try:
        shortcut_path.parent.mkdir(parents=True, exist_ok=True)
        vbs_path = Path(tempfile.gettempdir()) / f"sc_{secrets.token_hex(4)}.vbs"
        icon_clause = f's.IconLocation = "{icon_path},0"' if icon_path and icon_path.exists() else ""
        vbs_content = f'''
Set w = WScript.CreateObject("WScript.Shell")
Set s = w.CreateShortcut("{shortcut_path}")
s.TargetPath = "{target_exe}"
s.WorkingDirectory = "{target_exe.parent}"
{icon_clause}
s.Save
'''
        with open(vbs_path, "w", encoding="utf-8") as f:
            f.write(vbs_content)

        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        subprocess.run(
            ["cscript", "//nologo", str(vbs_path)],
            check=True,
            startupinfo=startupinfo
        )
        try:
            os.remove(vbs_path)
        except Exception:
            pass
    except Exception as e:
        print(f"Warning: Failed to create shortcut at {shortcut_path}: {e}")


def kill_running_instances():
    """Terminates any running VvcRemote or legacy AnyDeskPro processes so existing files can be cleanly replaced."""
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        for exe in [APP_EXE_NAME, "AnyDeskPro.exe"]:
            subprocess.run(
                ["taskkill", "/F", "/IM", exe, "/T"],
                capture_output=True,
                startupinfo=startupinfo
            )
        time.sleep(0.8)
    except Exception as e:
        print(f"Note: taskkill error or no running process: {e}")


def perform_installation(status_callback=None, progress_callback=None) -> bool:
    """Extracts payload, sets up directory, and creates shortcuts."""
    target_dir = get_target_install_dir()
    payload_zip = get_payload_path()

    if not payload_zip or not payload_zip.exists():
        if status_callback:
            status_callback("Error: Installation package payload missing!")
        return False

    # 0. Close running instances of VvcRemote before replacing files
    if status_callback:
        status_callback("Closing running instances of Vvc Remote...")
    kill_running_instances()

    if status_callback:
        status_callback("Preparing installation directory...")
    target_dir.mkdir(parents=True, exist_ok=True)

    # 1. Extract files from payload with retry for locked files
    if status_callback:
        status_callback("Installing Vvc Remote files...")
    
    with zipfile.ZipFile(payload_zip, "r") as zf:
        members = zf.infolist()
        total_files = len(members)
        for idx, member in enumerate(members):
            extracted = False
            for attempt in range(5):
                try:
                    zf.extract(member, target_dir)
                    extracted = True
                    break
                except (PermissionError, OSError):
                    time.sleep(0.3)
                    kill_running_instances()
            if not extracted:
                print(f"Warning: Could not extract {member.filename}")
            if progress_callback and total_files > 0:
                progress_callback(int((idx + 1) / total_files * 80))

    # 2. Setup Shortcuts
    installed_exe = target_dir / APP_EXE_NAME
    if not installed_exe.exists():
        # Check if extracted inside subfolder
        nested = target_dir / "VvcRemote" / APP_EXE_NAME
        if nested.exists():
            installed_exe = nested

    if status_callback:
        status_callback("Creating Desktop shortcut...")
    if progress_callback:
        progress_callback(88)

    user_profile = os.environ.get("USERPROFILE", "")
    if user_profile:
        desktop_lnk = Path(user_profile) / "Desktop" / f"{APP_DISPLAY_NAME}.lnk"
        create_windows_shortcut(installed_exe, desktop_lnk, installed_exe)

    if status_callback:
        status_callback("Creating Start Menu shortcut...")
    if progress_callback:
        progress_callback(94)

    app_data = os.environ.get("APPDATA", "")
    if app_data:
        start_menu_lnk = Path(app_data) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / f"{APP_DISPLAY_NAME}.lnk"
        create_windows_shortcut(installed_exe, start_menu_lnk, installed_exe)

    # 3. Register Start with Windows (Silent) automatically
    try:
        import winreg
        run_key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, run_key, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, "VvcRemote", 0, winreg.REG_SZ, f'"{installed_exe}" --background')
    except Exception as e:
        print(f"Warning: Could not register autostart: {e}")

    # 4. Launch application
    if status_callback:
        status_callback("Launching Vvc Remote...")
    if progress_callback:
        progress_callback(100)

    try:
        subprocess.Popen([str(installed_exe)], cwd=str(installed_exe.parent))
    except Exception as e:
        print(f"Warning: Could not auto-launch {installed_exe}: {e}")

    return True


def run_silent():
    """Performs installation silently without any GUI."""
    perform_installation()
    sys.exit(0)


def run_gui():
    """Runs modern Dark Theme installer window."""
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title(f"{APP_DISPLAY_NAME} Setup")
    root.geometry("460x280")
    root.resizable(False, False)
    root.configure(bg="#0f172a")

    # Center window on screen
    root.update_idletasks()
    width = root.winfo_width()
    height = root.winfo_height()
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f"{width}x{height}+{x}+{y}")

    # Styles
    style = ttk.Style()
    style.theme_use("clam")
    style.configure(
        "Modern.Horizontal.TProgressbar",
        troughcolor="#1e293b",
        background="#ef4444",
        thickness=8,
        borderwidth=0
    )

    # Title & Branding
    title_frame = tk.Frame(root, bg="#0f172a")
    title_frame.pack(pady=(28, 6), padx=25, fill="x")

    title_label = tk.Label(
        title_frame,
        text=APP_DISPLAY_NAME,
        font=("Segoe UI", 18, "bold"),
        fg="#f8fafc",
        bg="#0f172a"
    )
    title_label.pack(anchor="w")

    subtitle_label = tk.Label(
        title_frame,
        text="High-Performance Remote Desktop System",
        font=("Segoe UI", 10),
        fg="#94a3b8",
        bg="#0f172a"
    )
    subtitle_label.pack(anchor="w", pady=(2, 0))

    # Divider
    divider = tk.Frame(root, height=1, bg="#334155")
    divider.pack(fill="x", padx=25, pady=(12, 20))

    # Status text
    status_label = tk.Label(
        root,
        text="Initializing setup...",
        font=("Segoe UI", 10),
        fg="#e2e8f0",
        bg="#0f172a"
    )
    status_label.pack(anchor="w", padx=25, pady=(0, 10))

    # Progress bar
    progress_bar = ttk.Progressbar(
        root,
        style="Modern.Horizontal.TProgressbar",
        orient="horizontal",
        length=410,
        mode="determinate"
    )
    progress_bar.pack(padx=25, pady=(0, 16))

    # Info tag
    info_label = tk.Label(
        root,
        text="Installing to user profile (no administrator privileges required)...",
        font=("Segoe UI", 8),
        fg="#64748b",
        bg="#0f172a"
    )
    info_label.pack(anchor="w", padx=25)

    def update_status(text: str):
        def _update():
            status_label.config(text=text)
        root.after(0, _update)

    def update_progress(val: int):
        def _update():
            progress_bar["value"] = val
        root.after(0, _update)

    def installer_worker():
        time.sleep(0.4)
        try:
            success = perform_installation(status_callback=update_status, progress_callback=update_progress)
            if success:
                update_status("Installation complete! Launching Vvc Remote...")
                time.sleep(1.2)
                root.after(0, root.destroy)
            else:
                update_status("Installation encountered an issue. Retrying...")
                time.sleep(1.0)
                # Retry once after forcing process cleanup
                kill_running_instances()
                success_retry = perform_installation(status_callback=update_status, progress_callback=update_progress)
                if success_retry:
                    update_status("Installation complete! Launching Vvc Remote...")
                    time.sleep(1.2)
                    root.after(0, root.destroy)
                else:
                    update_status("Please close any running VvcRemote windows and try again.")
        except Exception as e:
            update_status(f"Installation error: {e}")

    # Start installation thread
    threading.Thread(target=installer_worker, daemon=True).start()

    root.mainloop()


def main():
    args = [a.lower() for a in sys.argv[1:]]
    if "/s" in args or "--silent" in args or "-s" in args:
        run_silent()
    else:
        run_gui()


if __name__ == "__main__":
    main()
