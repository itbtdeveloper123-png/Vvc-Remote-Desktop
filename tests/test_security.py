"""Unit tests for Session Security, Peer ID, and PIN Authentication"""
import unittest
from app.core.security import SessionSecurityManager, generate_peer_id, generate_pin


class TestSecurity(unittest.TestCase):

    def test_peer_id_generation(self):
        peer_id = generate_peer_id(9)
        # Check formatting "XXX XXX XXX"
        parts = peer_id.split(" ")
        self.assertEqual(len(parts), 3)
        self.assertEqual(len(parts[0]), 3)
        self.assertEqual(len(parts[1]), 3)
        self.assertEqual(len(parts[2]), 3)
        self.assertTrue(all(part.isdigit() for part in parts))

    def test_pin_generation(self):
        pin = generate_pin(6)
        self.assertEqual(len(pin), 6)
        self.assertTrue(pin.isdigit())

    def test_pin_verification(self):
        manager = SessionSecurityManager(pin="123456")
        self.assertTrue(manager.verify_pin("123456"))
        self.assertTrue(manager.verify_pin(" 123456 "))  # Strip whitespace
        self.assertFalse(manager.verify_pin("654321"))
        self.assertFalse(manager.verify_pin(""))
        self.assertFalse(manager.verify_pin(None))

    def test_session_lifecycle(self):
        manager = SessionSecurityManager(peer_id="111 222 333", pin="999999")
        session = manager.create_session(client_id="client_1")
        self.assertIsNotNone(session.session_id)
        self.assertTrue(session.allow_mouse)
        self.assertTrue(session.allow_keyboard)

        # Validate session
        retrieved = manager.validate_session(session.session_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.client_id, "client_1")

        # Update permissions
        manager.update_permissions(session.session_id, allow_mouse=False)
        self.assertFalse(retrieved.allow_mouse)
        self.assertTrue(retrieved.allow_keyboard)

        # End session
        manager.end_session(session.session_id)
        self.assertIsNone(manager.validate_session(session.session_id))

    def test_connect_request_lifecycle_accept(self):
        manager = SessionSecurityManager(peer_id="111 222 333")
        req = manager.create_connect_request(peer_id="999 888 777", client_ip="192.168.1.50")
        self.assertEqual(req.status, "pending")
        self.assertEqual(len(manager.get_pending_requests()), 1)

        # Host accepts with Full Control
        session = manager.respond_to_request(req.request_id, accept=True, allow_mouse=True, allow_keyboard=True)
        self.assertIsNotNone(session)
        self.assertTrue(session.allow_mouse)
        self.assertTrue(session.allow_keyboard)
        self.assertTrue(session.allow_clipboard)

        # Verify request status updated
        updated_req = manager.get_request(req.request_id)
        self.assertEqual(updated_req.status, "accepted")
        self.assertEqual(updated_req.session_id, session.session_id)
        self.assertEqual(len(manager.get_pending_requests()), 0)

    def test_connect_request_lifecycle_reject(self):
        manager = SessionSecurityManager(peer_id="111 222 333")
        req = manager.create_connect_request(peer_id="999 888 777", client_ip="192.168.1.50")
        
        # Host rejects
        session = manager.respond_to_request(req.request_id, accept=False)
        self.assertIsNone(session)

        updated_req = manager.get_request(req.request_id)
        self.assertEqual(updated_req.status, "rejected")
        self.assertIsNone(updated_req.session_id)

    def test_connect_request_cancel(self):
        manager = SessionSecurityManager(peer_id="111 222 333")
        req = manager.create_connect_request(peer_id="999 888 777")
        self.assertTrue(manager.cancel_request(req.request_id))
        self.assertEqual(manager.get_request(req.request_id).status, "cancelled")


if __name__ == "__main__":
    unittest.main()
