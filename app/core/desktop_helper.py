"""Win32 Desktop Station, Desktop Switching, and Hardware Cursor Overlay Helper"""
import sys
import ctypes
from ctypes import wintypes
from typing import Optional, Tuple
import numpy as np
import cv2

# Windows Constants
DF_ALLOWOTHERACCOUNTHOOK = 0x0001
DESKTOP_CREATEMENU = 0x0004
DESKTOP_CREATEWINDOW = 0x0002
DESKTOP_ENUMERATE = 0x0040
DESKTOP_HOOKCONTROL = 0x0020
DESKTOP_JOURNALPLAYBACK = 0x0010
DESKTOP_JOURNALRECORD = 0x0008
DESKTOP_READOBJECTS = 0x0001
DESKTOP_SWITCHDESKTOP = 0x0100
DESKTOP_WRITEOBJECTS = 0x0080
GENERIC_ALL = 0x10000000
DESKTOP_ALL_ACCESS = 0x01FF

CURSOR_SHOWING = 0x00000001
CURSOR_SUPPRESSED = 0x00000002


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class CURSORINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("flags", wintypes.DWORD),
        ("hCursor", wintypes.HANDLE),
        ("ptScreenPos", POINT)
    ]


def ensure_input_desktop() -> bool:
    """
    Attaches the current calling thread to the active Win32 Input Desktop.
    This resolves BitBlt 'Access Denied' and SendInput permission errors
    when running as background tasks or service contexts.
    """
    if sys.platform != "win32":
        return True
    try:
        user32 = ctypes.windll.user32
        hdesk = user32.OpenInputDesktop(0, False, DESKTOP_ALL_ACCESS)
        if hdesk:
            result = user32.SetThreadDesktop(hdesk)
            user32.CloseDesktop(hdesk)
            return bool(result)
        return False
    except Exception as e:
        print(f"[DesktopHelper] Warning: ensure_input_desktop failed: {e}")
        return False


def get_cursor_state() -> Tuple[bool, int, int]:
    """
    Queries current cursor position and visibility.
    Returns: (is_visible, x, y)
    """
    if sys.platform != "win32":
        return False, 0, 0

    try:
        user32 = ctypes.windll.user32
        ci = CURSORINFO()
        ci.cbSize = ctypes.sizeof(CURSORINFO)
        if user32.GetCursorInfo(ctypes.byref(ci)):
            is_visible = bool(ci.flags & CURSOR_SHOWING)
            return is_visible, ci.ptScreenPos.x, ci.ptScreenPos.y
        else:
            # Fallback to GetCursorPos
            pt = POINT()
            if user32.GetCursorPos(ctypes.byref(pt)):
                return True, pt.x, pt.y
    except Exception:
        pass
    return False, 0, 0


# Standard cursor arrow polygon points relative to cursor hotspot (0, 0)
_CURSOR_POLY = np.array([
    [0, 0],
    [0, 17],
    [4, 13],
    [8, 20],
    [11, 19],
    [7, 11],
    [13, 11]
], dtype=np.int32)

_CURSOR_BORDER_POLY = np.array([
    [-1, -1],
    [-1, 19],
    [4, 15],
    [7, 22],
    [13, 20],
    [8, 11],
    [15, 11]
], dtype=np.int32)


def draw_cursor_overlay(frame: np.ndarray, cursor_x: int, cursor_y: int, monitor_left: int = 0, monitor_top: int = 0) -> np.ndarray:
    """
    Draws a sharp AnyDesk-style arrow cursor onto the RGB/BGR frame at the given coordinates.
    """
    local_x = cursor_x - monitor_left
    local_y = cursor_y - monitor_top
    h, w = frame.shape[:2]

    # Don't draw if outside the captured frame
    if local_x < 0 or local_x >= w or local_y < 0 or local_y >= h:
        return frame

    # Shift polygon points to cursor position
    pts_fill = _CURSOR_POLY + [local_x, local_y]
    pts_border = _CURSOR_BORDER_POLY + [local_x, local_y]

    # Draw dark shadow / border first for visibility on bright backgrounds
    cv2.polylines(frame, [pts_border], isClosed=True, color=(0, 0, 0), thickness=2, lineType=cv2.LINE_AA)
    # Fill cursor body with white
    cv2.fillPoly(frame, [pts_fill], color=(255, 255, 255), lineType=cv2.LINE_AA)
    # Outline interior
    cv2.polylines(frame, [pts_fill], isClosed=True, color=(30, 30, 30), thickness=1, lineType=cv2.LINE_AA)

    return frame
