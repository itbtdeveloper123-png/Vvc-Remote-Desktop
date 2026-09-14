"""Unit tests for Desktop Attachment and Screen Capture Pipeline"""
import unittest
import time
import numpy as np
from app.core.desktop_helper import ensure_input_desktop, get_cursor_state, draw_cursor_overlay
from app.core.screen_capture import ScreenCaptureEngine


class TestCapture(unittest.TestCase):

    def test_desktop_attachment(self):
        ok = ensure_input_desktop()
        self.assertTrue(ok, "Failed to attach calling thread to Win32 Input Desktop")

    def test_cursor_query(self):
        ensure_input_desktop()
        visible, x, y = get_cursor_state()
        self.assertIsInstance(visible, bool)
        self.assertIsInstance(x, int)
        self.assertIsInstance(y, int)

    def test_cursor_overlay_drawing(self):
        # Create a blank RGB test frame (480x640x3)
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        rendered = draw_cursor_overlay(dummy_frame, 100, 100)
        self.assertEqual(rendered.shape, (480, 640, 3))
        # Verify non-zero pixels where cursor was drawn
        self.assertGreater(np.sum(rendered), 0)

    def test_screen_capture_engine(self):
        engine = ScreenCaptureEngine(target_fps=20, capture_cursor=True)
        engine.start()
        time.sleep(0.5)  # Wait for a couple capture cycles

        rgb = engine.get_latest_frame_rgb()
        jpeg = engine.get_latest_frame_jpeg()
        stats = engine.get_stats()

        engine.stop()

        self.assertIsNotNone(rgb, "ScreenCaptureEngine did not produce an RGB frame")
        self.assertIsNotNone(jpeg, "ScreenCaptureEngine did not produce a JPEG buffer")
        self.assertEqual(len(rgb.shape), 3)
        self.assertEqual(rgb.shape[2], 3)
        self.assertGreater(len(jpeg), 1000)
        self.assertGreater(stats["frame_count"], 0)


if __name__ == "__main__":
    unittest.main()
