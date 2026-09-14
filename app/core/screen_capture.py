"""High-Performance Screen Capture Engine with Non-Blocking Threading and Cursor Overlay"""
import sys
import time
import threading
import ctypes
from ctypes import wintypes
from typing import Optional, Tuple
import numpy as np
import cv2
import mss

from app.core.desktop_helper import ensure_input_desktop, get_cursor_state, draw_cursor_overlay
from app.config import CONFIG

# Win32 GDI Structures for direct memory DIB capture
class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD),
        ("biWidth", wintypes.LONG),
        ("biHeight", wintypes.LONG),
        ("biPlanes", wintypes.WORD),
        ("biBitCount", wintypes.WORD),
        ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD),
        ("biXPelsPerMeter", wintypes.LONG),
        ("biYPelsPerMeter", wintypes.LONG),
        ("biClrUsed", wintypes.DWORD),
        ("biClrImportant", wintypes.DWORD)
    ]


class ScreenCaptureEngine:
    """
    Asynchronous screen capture engine that captures display frames
    in a dedicated thread to ensure zero lag on the network event loop.
    Uses ultra-fast persistent Win32 DIBSection capture (<1ms) with automatic MSS fallback.
    """

    def __init__(self, monitor_index: int = 1, target_fps: int = 60, capture_cursor: bool = True, scale_factor: float = 1.0):
        self.monitor_index = monitor_index
        self.target_fps = target_fps
        self.interval = 1.0 / max(1, target_fps)
        self.capture_cursor = capture_cursor
        self.scale_factor = scale_factor

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        self._latest_bgr: Optional[np.ndarray] = None
        self._latest_jpeg: Optional[bytes] = None
        self._cached_jpeg_timestamp: float = 0.0
        self._frame_timestamp: float = 0.0
        self._frame_count: int = 0
        self._actual_fps: float = 0.0
        self._last_fps_calc_time = time.time()
        self._fps_counter = 0

        self.screen_width = 1920
        self.screen_height = 1080
        self.monitor_left = 0
        self.monitor_top = 0

        # Initialize monitor info
        self._init_monitor_info()

    def _init_monitor_info(self):
        try:
            ensure_input_desktop()
            if sys.platform == "win32":
                u32 = ctypes.windll.user32
                self.screen_width = u32.GetSystemMetrics(0)
                self.screen_height = u32.GetSystemMetrics(1)
            else:
                with mss.MSS() as sct:
                    mon = sct.monitors[self.monitor_index] if len(sct.monitors) > self.monitor_index else sct.monitors[0]
                    self.screen_width = mon["width"]
                    self.screen_height = mon["height"]
                    self.monitor_left = mon["left"]
                    self.monitor_top = mon["top"]
        except Exception as e:
            print(f"[ScreenCapture] Warning initializing monitor info: {e}")

    def start(self):
        """Starts the capture thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, name="ScreenCaptureWorker", daemon=True)
        self._thread.start()
        print(f"[ScreenCapture] Capture engine started ({self.screen_width}x{self.screen_height} @ target {self.target_fps} FPS)")

    def stop(self):
        """Stops the capture thread."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        print("[ScreenCapture] Capture engine stopped")

    def _capture_loop(self):
        """Dedicated high-speed frame capture loop."""
        ensure_input_desktop()

        if sys.platform == "win32":
            self._capture_loop_gdi_fast()
        else:
            self._capture_loop_mss()

    def _capture_loop_gdi_fast(self):
        """Ultra-low-latency persistent GDI DIBSection capture loop for Windows."""
        u32 = ctypes.windll.user32
        gdi = ctypes.windll.gdi32

        w = u32.GetSystemMetrics(0)
        h = u32.GetSystemMetrics(1)
        self.screen_width = w
        self.screen_height = h

        hdc_screen = u32.GetDC(0)
        hdc_mem = gdi.CreateCompatibleDC(hdc_screen)

        bmi = BITMAPINFOHEADER()
        bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.biWidth = w
        bmi.biHeight = -h  # Negative for top-down orientation
        bmi.biPlanes = 1
        bmi.biBitCount = 32
        bmi.biCompression = 0

        ppv_bits = ctypes.c_void_p()
        hbm = gdi.CreateDIBSection(hdc_screen, ctypes.byref(bmi), 0, ctypes.byref(ppv_bits), None, 0)
        gdi.SelectObject(hdc_mem, hbm)
        SRCCOPY = 0x00CC0020

        buf_size = w * h * 4

        try:
            while self._running:
                loop_start = time.perf_counter()

                try:
                    # Instant BitBlt directly into shared DIB memory buffer (<0.1ms)
                    gdi.BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, 0, 0, SRCCOPY)

                    buf = (ctypes.c_uint8 * buf_size).from_address(ppv_bits.value)
                    raw_bgra = np.frombuffer(buf, dtype=np.uint8).reshape((h, w, 4))
                    bgr = cv2.cvtColor(raw_bgra, cv2.COLOR_BGRA2BGR)

                    # Draw hardware cursor overlay
                    if self.capture_cursor:
                        visible, cur_x, cur_y = get_cursor_state()
                        if visible:
                            draw_cursor_overlay(bgr, cur_x, cur_y, 0, 0)

                    # Scale if configured (default 1.0 = native)
                    if self.scale_factor < 0.99 or self.scale_factor > 1.01:
                        target_w = int(w * self.scale_factor)
                        target_h = int(h * self.scale_factor)
                        bgr = cv2.resize(bgr, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

                    now = time.time()
                    with self._lock:
                        self._latest_bgr = bgr
                        self._frame_timestamp = now
                        self._frame_count += 1
                        self._fps_counter += 1

                    if now - self._last_fps_calc_time >= 1.0:
                        self._actual_fps = self._fps_counter / (now - self._last_fps_calc_time)
                        self._fps_counter = 0
                        self._last_fps_calc_time = now

                except Exception as e:
                    ensure_input_desktop()
                    try:
                        # Re-acquire screen DC for new desktop station (Lock Screen / Winlogon)
                        u32.ReleaseDC(0, hdc_screen)
                        gdi.DeleteDC(hdc_mem)
                        gdi.DeleteObject(hbm)

                        w = u32.GetSystemMetrics(0)
                        h = u32.GetSystemMetrics(1)
                        self.screen_width = w
                        self.screen_height = h
                        buf_size = w * h * 4

                        bmi.biWidth = w
                        bmi.biHeight = -h
                        hdc_screen = u32.GetDC(0)
                        hdc_mem = gdi.CreateCompatibleDC(hdc_screen)
                        hbm = gdi.CreateDIBSection(hdc_screen, ctypes.byref(bmi), 0, ctypes.byref(ppv_bits), None, 0)
                        gdi.SelectObject(hdc_mem, hbm)
                    except Exception:
                        pass
                    time.sleep(0.02)

                # Frame rate limiter for target FPS
                elapsed = time.perf_counter() - loop_start
                sleep_time = self.interval - elapsed
                if sleep_time > 0.001:
                    time.sleep(sleep_time)

        finally:
            u32.ReleaseDC(0, hdc_screen)
            gdi.DeleteDC(hdc_mem)
            gdi.DeleteObject(hbm)

    def _capture_loop_mss(self):
        """Cross-platform MSS fallback capture loop."""
        with mss.MSS() as sct:
            monitors = sct.monitors
            mon = monitors[self.monitor_index] if len(monitors) > self.monitor_index else monitors[0]

            while self._running:
                loop_start = time.perf_counter()
                try:
                    raw = sct.grab(mon)
                    img = np.frombuffer(raw.raw, dtype=np.uint8).reshape((mon["height"], mon["width"], 4))
                    bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

                    if self.capture_cursor:
                        visible, cur_x, cur_y = get_cursor_state()
                        if visible:
                            draw_cursor_overlay(bgr, cur_x, cur_y, mon["left"], mon["top"])

                    now = time.time()
                    with self._lock:
                        self._latest_bgr = bgr
                        self._frame_timestamp = now
                        self._frame_count += 1
                        self._fps_counter += 1

                    if now - self._last_fps_calc_time >= 1.0:
                        self._actual_fps = self._fps_counter / (now - self._last_fps_calc_time)
                        self._fps_counter = 0
                        self._last_fps_calc_time = now

                except Exception:
                    time.sleep(0.02)

                elapsed = time.perf_counter() - loop_start
                sleep_time = self.interval - elapsed
                if sleep_time > 0.001:
                    time.sleep(sleep_time)

    def get_latest_frame_bgr(self) -> Optional[np.ndarray]:
        """Returns the latest captured BGR numpy frame (for WebRTC VideoTrack)."""
        with self._lock:
            return self._latest_bgr.copy() if self._latest_bgr is not None else None

    def get_latest_frame_rgb(self) -> Optional[np.ndarray]:
        """Returns RGB numpy frame."""
        with self._lock:
            if self._latest_bgr is None:
                return None
            return cv2.cvtColor(self._latest_bgr, cv2.COLOR_BGR2RGB)

    def get_latest_frame_jpeg(self) -> Optional[bytes]:
        """Returns on-demand high-quality compressed JPEG bytes (for WebSocket stream)."""
        with self._lock:
            if self._latest_bgr is None:
                return None
            # Return cached JPEG if frame timestamp has not changed
            if self._latest_jpeg is not None and self._cached_jpeg_timestamp == self._frame_timestamp:
                return self._latest_jpeg

            # Encode on-demand with high quality (90) and fast un-optimized Huffman
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), CONFIG.capture.jpeg_quality, int(cv2.IMWRITE_JPEG_OPTIMIZE), 0]
            _, enc_jpg = cv2.imencode(".jpg", self._latest_bgr, encode_param)
            self._latest_jpeg = enc_jpg.tobytes()
            self._cached_jpeg_timestamp = self._frame_timestamp
            return self._latest_jpeg

    def get_stats(self) -> dict:
        """Returns current capture statistics."""
        with self._lock:
            return {
                "width": self.screen_width,
                "height": self.screen_height,
                "target_fps": self.target_fps,
                "actual_fps": round(self._actual_fps, 1),
                "frame_count": self._frame_count,
                "timestamp": self._frame_timestamp
            }
