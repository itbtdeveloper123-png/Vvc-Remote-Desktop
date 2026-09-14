"""Tests for Signaling API Connection Request Flow"""
import unittest
from fastapi.testclient import TestClient
from app.core.screen_capture import ScreenCaptureEngine
from app.core.input_injector import Win32InputInjector
from app.core.security import SessionSecurityManager
from app.network.signaling import create_app


class TestSignalingConnectFlow(unittest.TestCase):

    def setUp(self):
        self.capture_engine = ScreenCaptureEngine(target_fps=15, scale_factor=0.5, capture_cursor=False)
        self.input_injector = Win32InputInjector(allow_mouse=True, allow_keyboard=True)
        self.security_manager = SessionSecurityManager(peer_id="555 666 777")
        self.security_manager.auto_accept = False
        self.app = create_app(self.capture_engine, self.input_injector, self.security_manager)
        self.client = TestClient(self.app)

    def test_full_interactive_connect_flow(self):
        # 1. Client initiates connection with the host's 9-digit address
        init_res = self.client.post("/api/connect-request", json={"peer_id": "555 666 777"})
        self.assertEqual(init_res.status_code, 200)
        data = init_res.json()
        self.assertTrue(data["success"])
        request_id = data["request_id"]
        self.assertEqual(data["status"], "pending")

        # 2. Host checks for pending incoming requests
        pending_res = self.client.get("/api/connect-request/pending")
        self.assertEqual(pending_res.status_code, 200)
        pending_data = pending_res.json()
        self.assertEqual(len(pending_data["requests"]), 1)
        self.assertEqual(pending_data["requests"][0]["request_id"], request_id)

        # 3. Client checks status while still pending
        status_res = self.client.get(f"/api/connect-request/status?request_id={request_id}")
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["status"], "pending")

        # 4. Host accepts the connection request with Full Control
        respond_res = self.client.post("/api/connect-request/respond", json={
            "request_id": request_id,
            "action": "accept",
            "allow_mouse": True,
            "allow_keyboard": True
        })
        self.assertEqual(respond_res.status_code, 200)
        self.assertTrue(respond_res.json()["success"])
        self.assertEqual(respond_res.json()["status"], "accepted")
        session_id = respond_res.json()["session_id"]

        # Verify host input injector is Full Control
        self.assertTrue(self.input_injector.allow_mouse)
        self.assertTrue(self.input_injector.allow_keyboard)

        # 5. Client polls status and gets accepted + session_id
        final_status_res = self.client.get(f"/api/connect-request/status?request_id={request_id}")
        self.assertEqual(final_status_res.status_code, 200)
        final_data = final_status_res.json()
        self.assertEqual(final_data["status"], "accepted")
        self.assertEqual(final_data["session_id"], session_id)

    def test_react_static_assets_served(self):
        # Verify React root page
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn('<div id="root"></div>', res.text)
        self.assertIn('assets/index.js', res.text)

        # Verify bundled JS asset
        js_res = self.client.get("/assets/index.js")
        self.assertEqual(js_res.status_code, 200)

        # Verify bundled CSS asset
        css_res = self.client.get("/assets/index.css")
        self.assertEqual(css_res.status_code, 200)

        # Verify icon
        icon_res = self.client.get("/icon.ico")
        self.assertEqual(icon_res.status_code, 200)


class TestSignalingSecurityHardening(unittest.TestCase):

    def setUp(self):
        self.capture_engine = ScreenCaptureEngine(target_fps=15, scale_factor=0.5, capture_cursor=False)
        self.input_injector = Win32InputInjector(allow_mouse=True, allow_keyboard=True)
        self.security_manager = SessionSecurityManager(peer_id="111 222 333", pin="987654")
        self.app = create_app(self.capture_engine, self.input_injector, self.security_manager)
        self.remote_client = TestClient(self.app, client=("198.51.100.25", 50000))
        self.local_client = TestClient(self.app, client=("127.0.0.1", 50000))

    def test_pin_hidden_from_remote_client(self):
        res = self.remote_client.get("/api/info")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsNone(data["pin"])
        self.assertIsNone(data["host_token"])
        self.assertFalse(data["is_host"])

    def test_pin_visible_to_local_host(self):
        res = self.local_client.get("/api/info")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["pin"], "987654")
        self.assertEqual(data["host_token"], self.security_manager.host_token)
        self.assertTrue(data["is_host"])

    def test_remote_client_cannot_respond_or_control_host(self):
        res1 = self.remote_client.post("/api/connect-request/respond", json={"request_id": "fake", "action": "accept"})
        self.assertEqual(res1.status_code, 403)

        res2 = self.remote_client.post("/api/refresh-pin")
        self.assertEqual(res2.status_code, 403)

        res3 = self.remote_client.get("/api/connect-requests")
        self.assertEqual(res3.status_code, 403)

        res4 = self.remote_client.post("/api/permissions", json={"allow_mouse": False})
        self.assertEqual(res4.status_code, 403)

    def test_unauthenticated_file_access_blocked(self):
        res1 = self.remote_client.get("/api/files/drives")
        self.assertEqual(res1.status_code, 401)

        res2 = self.remote_client.get("/api/files/list?path=C:\\")
        self.assertEqual(res2.status_code, 401)

        res3 = self.remote_client.get("/api/files/download?path=C:\\test.txt")
        self.assertEqual(res3.status_code, 401)

    def test_authenticated_file_access_allowed(self):
        session = self.security_manager.create_session("client_test")
        res = self.remote_client.get(f"/api/files/drives?session_id={session.session_id}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("drives", res.json())

    def test_pin_brute_force_lockout(self):
        lock_client = TestClient(self.app, client=("203.0.113.88", 50000))
        for _ in range(5):
            lock_client.post("/api/auth", json={"peer_id": "111 222 333", "pin": "000000"})

        # Subsequent attempts are locked out with HTTP 429
        lock_res = lock_client.post("/api/auth", json={"peer_id": "111 222 333", "pin": "987654"})
        self.assertEqual(lock_res.status_code, 429)

    def test_system_path_protection(self):
        session = self.security_manager.create_session("client_test")
        res = self.remote_client.request(
            "DELETE",
            "/api/files/delete",
            json={"path": "C:\\Windows\\System32", "session_id": session.session_id}
        )
        self.assertEqual(res.status_code, 403)

    def test_connect_request_wrong_peer_id_rejected(self):
        res = self.remote_client.post("/api/connect-request", json={"peer_id": "999 999 999"})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()["success"])


if __name__ == "__main__":
    unittest.main()

