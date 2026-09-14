"""Unit tests for Input Injection and Coordinate Normalization"""
import unittest
from app.core.input_injector import Win32InputInjector, JS_CODE_TO_VK
from app.core.desktop_helper import ensure_input_desktop


class TestInput(unittest.TestCase):

    def setUp(self):
        ensure_input_desktop()
        self.injector = Win32InputInjector(allow_mouse=True, allow_keyboard=True)

    def test_key_mappings(self):
        self.assertIn("Enter", JS_CODE_TO_VK)
        self.assertIn("KeyA", JS_CODE_TO_VK)
        self.assertIn("Space", JS_CODE_TO_VK)
        self.assertEqual(JS_CODE_TO_VK["Enter"], 0x0D)
        self.assertEqual(JS_CODE_TO_VK["KeyA"], 0x41)

    def test_mouse_normalization_move(self):
        # Moving within bounds 0.0 to 1.0
        res = self.injector.move_mouse_norm(0.5, 0.5)
        self.assertTrue(res)

        # Clamping out-of-bounds inputs
        res_clamp = self.injector.move_mouse_norm(1.5, -0.5)
        self.assertTrue(res_clamp)

    def test_mouse_wheel(self):
        res = self.injector.mouse_wheel(delta_x=0, delta_y=100)
        self.assertTrue(res)

    def test_permission_gates(self):
        blocked_injector = Win32InputInjector(allow_mouse=False, allow_keyboard=False)
        self.assertFalse(blocked_injector.move_mouse_norm(0.5, 0.5))
        self.assertFalse(blocked_injector.mouse_button("left", "down"))
        self.assertFalse(blocked_injector.key_event("KeyA", "a", "down"))

    def test_dispatch_message(self):
        # Test dispatch of standard client message format
        self.injector.handle_client_message({
            "type": "mousemove",
            "x": 0.25,
            "y": 0.25
        })
        self.injector.handle_client_message({
            "type": "wheel",
            "deltaX": 0,
            "deltaY": 50
        })


if __name__ == "__main__":
    unittest.main()
