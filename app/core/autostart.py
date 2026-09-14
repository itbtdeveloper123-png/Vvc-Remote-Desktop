"""Windows Auto-Startup Manager

Manages the Windows Registry 'Run' key (HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run)
to enable or disable launching Vvc Remote silently in the background on system boot.
"""
import sys
import os
import winreg
from pathlib import Path
from typing import Tuple

APP_REG_NAME = "VvcRemote"
REG_SUBKEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def get_executable_command() -> str:
    """
    Returns the appropriate execution command string for auto-startup.
    If compiled as a PyInstaller standalone executable, points to AnyDeskPro.exe --background.
    Otherwise points to pythonw.exe desktop_app.py --background.
    """
    if getattr(sys, "frozen", False):
        # PyInstaller executable
        exe_path = sys.executable
        return f'"{exe_path}" --background'
    else:
        # Development / script mode
        root_dir = Path(__file__).resolve().parent.parent.parent
        script_path = root_dir / "desktop_app.py"
        # Use pythonw if available to avoid opening console window
        python_exe = sys.executable.replace("python.exe", "pythonw.exe")
        if not os.path.exists(python_exe):
            python_exe = sys.executable
        return f'"{python_exe}" "{script_path}" --background'


def is_autostart_enabled() -> bool:
    """
    Checks whether AnyDeskPro is registered in Windows Startup.
    """
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_SUBKEY, 0, winreg.KEY_READ) as key:
            value, reg_type = winreg.QueryValueEx(key, APP_REG_NAME)
            return bool(value)
    except FileNotFoundError:
        return False
    except OSError:
        return False


def set_autostart(enable: bool) -> Tuple[bool, str]:
    """
    Enables or disables auto-startup for AnyDesk Pro.
    Returns (success, message).
    """
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_SUBKEY, 0, winreg.KEY_SET_VALUE | winreg.KEY_READ) as key:
            if enable:
                cmd = get_executable_command()
                winreg.SetValueEx(key, APP_REG_NAME, 0, winreg.REG_SZ, cmd)
                return True, f"Auto-startup enabled: {cmd}"
            else:
                try:
                    winreg.DeleteValue(key, APP_REG_NAME)
                    return True, "Auto-startup disabled"
                except FileNotFoundError:
                    return True, "Auto-startup was already disabled"
    except OSError as err:
        return False, f"Registry access error: {err}"
