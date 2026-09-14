"""Win32 Input Simulation Engine via SendInput (Mouse, Keyboard, Wheel, Unicode)"""
import sys
import ctypes
from ctypes import wintypes
from typing import Dict, Any, Optional

from app.core.desktop_helper import ensure_input_desktop

# Win32 Constants
INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
INPUT_HARDWARE = 2

# Mouse flags
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000
MOUSEEVENTF_ABSOLUTE = 0x8000
MOUSEEVENTF_VIRTUALDESK = 0x4000
WHEEL_DELTA = 120

# Keyboard flags
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_SCANCODE = 0x0008

# Win32 Structures for 64-bit alignment
class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]

class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]

class _INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]

class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [
        ("type", wintypes.DWORD),
        ("u", _INPUT_UNION),
    ]


# Mapping JS event codes / keys to Win32 Virtual Key Codes
JS_CODE_TO_VK: Dict[str, int] = {
    # Control keys
    "Backspace": 0x08,
    "Tab": 0x09,
    "Enter": 0x0D,
    "NumpadEnter": 0x0D,
    "ShiftLeft": 0x10,
    "ShiftRight": 0x10,
    "ControlLeft": 0x11,
    "ControlRight": 0x11,
    "AltLeft": 0x12,
    "AltRight": 0x12,
    "Pause": 0x13,
    "CapsLock": 0x14,
    "Escape": 0x1B,
    "Space": 0x20,
    "PageUp": 0x21,
    "PageDown": 0x22,
    "End": 0x23,
    "Home": 0x24,
    "ArrowLeft": 0x25,
    "ArrowUp": 0x26,
    "ArrowRight": 0x27,
    "ArrowDown": 0x28,
    "PrintScreen": 0x2C,
    "Insert": 0x2D,
    "Delete": 0x2E,
    "MetaLeft": 0x5B,  # Windows key left
    "MetaRight": 0x5C, # Windows key right
    "ContextMenu": 0x5D,
    # Function keys
    "F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73,
    "F5": 0x74, "F6": 0x75, "F7": 0x76, "F8": 0x77,
    "F9": 0x78, "F10": 0x79, "F11": 0x7A, "F12": 0x7B,
    # Standard alphanumeric keys
    "Digit0": 0x30, "Digit1": 0x31, "Digit2": 0x32, "Digit3": 0x33, "Digit4": 0x34,
    "Digit5": 0x35, "Digit6": 0x36, "Digit7": 0x37, "Digit8": 0x38, "Digit9": 0x39,
    "KeyA": 0x41, "KeyB": 0x42, "KeyC": 0x43, "KeyD": 0x44, "KeyE": 0x45,
    "KeyF": 0x46, "KeyG": 0x47, "KeyH": 0x48, "KeyI": 0x49, "KeyJ": 0x4A,
    "KeyK": 0x4B, "KeyL": 0x4C, "KeyM": 0x4D, "KeyN": 0x4E, "KeyO": 0x4F,
    "KeyP": 0x50, "KeyQ": 0x51, "KeyR": 0x52, "KeyS": 0x53, "KeyT": 0x54,
    "KeyU": 0x55, "KeyV": 0x56, "KeyW": 0x57, "KeyX": 0x58, "KeyY": 0x59, "KeyZ": 0x5A,
    # Punctuation
    "Semicolon": 0xBA,
    "Equal": 0xBB,
    "Comma": 0xBC,
    "Minus": 0xBD,
    "Period": 0xBE,
    "Slash": 0xBF,
    "Backquote": 0xC0,
    "BracketLeft": 0xDB,
    "Backslash": 0xDC,
    "BracketRight": 0xDD,
    "Quote": 0xDE,
}


class Win32InputInjector:
    """
    Simulates mouse movements, clicks, scrolling, and keystrokes
    using Windows native user32.SendInput.
    """

    def __init__(self, allow_mouse: bool = True, allow_keyboard: bool = True):
        self.allow_mouse = allow_mouse
        self.allow_keyboard = allow_keyboard
        self._user32 = ctypes.windll.user32 if sys.platform == "win32" else None
        self._screen_w = self._user32.GetSystemMetrics(0) if self._user32 else 1920
        self._screen_h = self._user32.GetSystemMetrics(1) if self._user32 else 1080
        ensure_input_desktop()

    def _send_input(self, inp: INPUT) -> bool:
        if not self._user32:
            return False
        res = self._user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        if res != 1:
            # Re-attach desktop on failure and retry once
            ensure_input_desktop()
            res = self._user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        return res == 1

    def move_mouse_norm(self, norm_x: float, norm_y: float) -> bool:
        """
        Moves mouse to normalized coordinates (0.0 to 1.0).
        Uses direct SetCursorPos for immediate hardware positioning (<0.01ms),
        combined with SendInput for full OS window manager dragging / message processing.
        """
        if not self.allow_mouse or not self._user32:
            return False

        clamped_x = max(0.0, min(1.0, float(norm_x)))
        clamped_y = max(0.0, min(1.0, float(norm_y)))

        # 1. Instant direct cursor position
        px = int(clamped_x * (self._screen_w - 1))
        py = int(clamped_y * (self._screen_h - 1))
        self._user32.SetCursorPos(px, py)

        # 2. OS Input message for window drag/selection
        abs_x = int(clamped_x * 65535)
        abs_y = int(clamped_y * 65535)

        inp = INPUT()
        inp.type = INPUT_MOUSE
        inp.mi.dx = abs_x
        inp.mi.dy = abs_y
        inp.mi.mouseData = 0
        inp.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK
        inp.mi.time = 0
        inp.mi.dwExtraInfo = 0

        return self._send_input(inp)

    def mouse_button(self, button: str, action: str, norm_x: Optional[float] = None, norm_y: Optional[float] = None) -> bool:
        """
        Simulates mouse button down or up.
        button: 'left', 'right', 'middle'
        action: 'down', 'up'
        """
        if not self.allow_mouse or not self._user32:
            return False

        # Move cursor to target position if specified
        if norm_x is not None and norm_y is not None:
            self.move_mouse_norm(norm_x, norm_y)

        flag = 0
        btn = button.lower()
        act = action.lower()

        if btn == "left":
            flag = MOUSEEVENTF_LEFTDOWN if act == "down" else MOUSEEVENTF_LEFTUP
        elif btn == "right":
            flag = MOUSEEVENTF_RIGHTDOWN if act == "down" else MOUSEEVENTF_RIGHTUP
        elif btn == "middle":
            flag = MOUSEEVENTF_MIDDLEDOWN if act == "down" else MOUSEEVENTF_MIDDLEUP
        else:
            return False

        inp = INPUT()
        inp.type = INPUT_MOUSE
        inp.mi.dx = 0
        inp.mi.dy = 0
        inp.mi.mouseData = 0
        inp.mi.dwFlags = flag
        inp.mi.time = 0
        inp.mi.dwExtraInfo = 0

        return self._send_input(inp)

    def mouse_wheel(self, delta_x: float = 0, delta_y: float = 0) -> bool:
        """
        Simulates mouse wheel scroll.
        Positive delta_y scrolls up; negative scrolls down.
        """
        if not self.allow_mouse or not self._user32:
            return False

        if delta_y != 0:
            # Normalize wheel ticks: typical browser deltaY is ~100
            ticks = -int(delta_y / 100 * WHEEL_DELTA) if abs(delta_y) >= 50 else (-WHEEL_DELTA if delta_y > 0 else WHEEL_DELTA)
            inp = INPUT()
            inp.type = INPUT_MOUSE
            inp.mi.dx = 0
            inp.mi.dy = 0
            inp.mi.mouseData = ticks & 0xFFFFFFFF
            inp.mi.dwFlags = MOUSEEVENTF_WHEEL
            inp.mi.time = 0
            inp.mi.dwExtraInfo = 0
            self._send_input(inp)

        if delta_x != 0:
            ticks = int(delta_x / 100 * WHEEL_DELTA)
            inp = INPUT()
            inp.type = INPUT_MOUSE
            inp.mi.dx = 0
            inp.mi.dy = 0
            inp.mi.mouseData = ticks & 0xFFFFFFFF
            inp.mi.dwFlags = MOUSEEVENTF_HWHEEL
            inp.mi.time = 0
            inp.mi.dwExtraInfo = 0
            self._send_input(inp)

        return True

    def key_event(self, code: str, key: str, action: str) -> bool:
        """
        Simulates keyboard keydown or keyup event.
        action: 'down' or 'up'
        """
        if not self.allow_keyboard or not self._user32:
            return False

        is_up = (action.lower() == "up")
        flags = KEYEVENTF_KEYUP if is_up else 0

        # Try mapping from JS code
        vk = JS_CODE_TO_VK.get(code, 0)

        # Fallback to key lookup or VkKeyScanW
        if vk == 0 and len(key) == 1:
            scan_res = self._user32.VkKeyScanW(ord(key))
            if scan_res != -1:
                vk = scan_res & 0xFF

        # If we have a virtual key code, send it
        if vk != 0:
            scan = self._user32.MapVirtualKeyW(vk, 0)
            inp = INPUT()
            inp.type = INPUT_KEYBOARD
            inp.ki.wVk = vk
            inp.ki.wScan = scan
            inp.ki.dwFlags = flags
            inp.ki.time = 0
            inp.ki.dwExtraInfo = 0
            return self._send_input(inp)

        # Fallback: Unicode injection if single character
        if len(key) == 1:
            inp = INPUT()
            inp.type = INPUT_KEYBOARD
            inp.ki.wVk = 0
            inp.ki.wScan = ord(key)
            inp.ki.dwFlags = KEYEVENTF_UNICODE | (KEYEVENTF_KEYUP if is_up else 0)
            inp.ki.time = 0
            inp.ki.dwExtraInfo = 0
            return self._send_input(inp)

        return False

    def handle_client_message(self, data: Dict[str, Any]):
        """
        Dispatches incoming remote input event dictionary from client DataChannel or WebSocket.
        """
        msg_type = data.get("type")

        if msg_type == "mousemove":
            self.move_mouse_norm(data.get("x", 0.0), data.get("y", 0.0))

        elif msg_type in ("mousedown", "mouseup"):
            action = "down" if msg_type == "mousedown" else "up"
            btn_map = {0: "left", 1: "middle", 2: "right"}
            btn = btn_map.get(data.get("button", 0), "left")
            self.mouse_button(btn, action, data.get("x"), data.get("y"))

        elif msg_type == "wheel":
            self.mouse_wheel(data.get("deltaX", 0), data.get("deltaY", 0))

        elif msg_type in ("keydown", "keyup"):
            action = "down" if msg_type == "keydown" else "up"
            self.key_event(data.get("code", ""), data.get("key", ""), action)
