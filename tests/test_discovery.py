"""Unit tests for PeerDiscovery"""
import time
import unittest
from app.network.discovery import PeerDiscovery


class TestDiscovery(unittest.TestCase):

    def test_direct_url_and_ip_resolution(self):
        discovery = PeerDiscovery(peer_id="111 222 333", port=8000)
        
        # Direct IP
        res_ip = discovery.resolve("192.168.1.50:8000")
        self.assertIsNotNone(res_ip)
        self.assertEqual(res_ip["url"], "http://192.168.1.50:8000")
        self.assertEqual(res_ip["type"], "direct")

        # Direct URL
        res_url = discovery.resolve("https://my-desk.trycloudflare.com")
        self.assertIsNotNone(res_url)
        self.assertEqual(res_url["url"], "https://my-desk.trycloudflare.com")

    def test_self_resolution(self):
        discovery = PeerDiscovery(peer_id="111 222 333", port=8000)
        res = discovery.resolve("111 222 333")
        self.assertIsNotNone(res)
        self.assertEqual(res["url"], "http://127.0.0.1:8000")
        self.assertEqual(res["type"], "self")

    def test_multi_instance_local_resolution(self):
        # Simulate Instance 1 on port 8000
        inst1 = PeerDiscovery(peer_id="111 222 333", port=8000)
        inst1._update_local_file()

        # Simulate Instance 2 on port 8001 looking for Instance 1
        inst2 = PeerDiscovery(peer_id="444 555 666", port=8001)
        res = inst2.resolve("111 222 333")
        
        self.assertIsNotNone(res)
        self.assertEqual(res["peer_id"], "111222333")
        self.assertIn("8000", res["url"])

        # Cleanup
        inst1._cleanup_local_file()


if __name__ == "__main__":
    unittest.main()
