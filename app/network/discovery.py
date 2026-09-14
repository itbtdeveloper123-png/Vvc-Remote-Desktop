"""Peer Discovery: Localhost Multi-Instance Shared Registry, LAN UDP Beacon & Subnet Probe"""
import os
import sys
import json
import time
import socket
import tempfile
import threading
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, Optional, Any
from concurrent.futures import ThreadPoolExecutor

PEER_REGISTRY_FILE = Path(tempfile.gettempdir()) / "anydesk_pro_local_peers.json"
UDP_DISCOVERY_PORT = 8889


class PeerDiscovery:
    """
    Manages discovery of AnyDesk Pro instances:
    1. Direct IP / URL formatting
    2. Localhost multi-instance shared registry
    3. LAN UDP broadcast beaconing
    4. Localhost fast port probing (8000-8030)
    5. LAN fast subnet probe (parallel thread pool)
    """

    def __init__(self, peer_id: str, port: int):
        self.peer_id = peer_id
        self.norm_id = peer_id.replace(" ", "").replace("-", "")
        self.port = port
        self.local_ip = self._get_local_ip()
        self.running = False
        self.lan_peers: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

        self._reg_thread: Optional[threading.Thread] = None
        self._broadcast_thread: Optional[threading.Thread] = None
        self._listener_thread: Optional[threading.Thread] = None

    def _get_local_ip(self) -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def start(self):
        self.running = True
        # 1. Start local file registry updater thread
        self._reg_thread = threading.Thread(target=self._run_local_file_updater, daemon=True)
        self._reg_thread.start()

        # 2. Start UDP beacon broadcast thread
        self._broadcast_thread = threading.Thread(target=self._run_udp_broadcast, daemon=True)
        self._broadcast_thread.start()

        # 3. Start UDP beacon listener thread
        self._listener_thread = threading.Thread(target=self._run_udp_listener, daemon=True)
        self._listener_thread.start()

    def stop(self):
        self.running = False
        self._cleanup_local_file()

    def _run_local_file_updater(self):
        """Periodically writes this instance's address to the local shared file."""
        while self.running:
            try:
                self._update_local_file()
            except Exception:
                pass
            time.sleep(1.0)

    def _update_local_file(self):
        peers = {}
        if PEER_REGISTRY_FILE.exists():
            try:
                with open(PEER_REGISTRY_FILE, "r", encoding="utf-8") as f:
                    peers = json.load(f)
            except Exception:
                peers = {}

        now = time.time()
        # Clean expired entries (> 5 seconds)
        active_peers = {
            k: v for k, v in peers.items()
            if now - v.get("timestamp", 0) < 5.0
        }

        # Register self
        active_peers[self.norm_id] = {
            "peer_id": self.norm_id,
            "display_id": self.peer_id,
            "port": self.port,
            "url": f"http://{self.local_ip}:{self.port}",
            "local_url": f"http://127.0.0.1:{self.port}",
            "timestamp": now
        }

        # Write back atomically
        tmp_file = PEER_REGISTRY_FILE.with_suffix(".tmp")
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(active_peers, f)
            tmp_file.replace(PEER_REGISTRY_FILE)
        except Exception:
            pass

    def _cleanup_local_file(self):
        if not PEER_REGISTRY_FILE.exists():
            return
        try:
            with open(PEER_REGISTRY_FILE, "r", encoding="utf-8") as f:
                peers = json.load(f)
            peers.pop(self.norm_id, None)
            with open(PEER_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(peers, f)
        except Exception:
            pass

    def _run_udp_broadcast(self):
        """Sends UDP broadcast packets to LAN."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.settimeout(0.5)
        except Exception:
            return

        msg = json.dumps({
            "type": "anydesk_beacon",
            "peer_id": self.norm_id,
            "display_id": self.peer_id,
            "url": f"http://{self.local_ip}:{self.port}",
            "port": self.port
        }).encode("utf-8")

        while self.running:
            try:
                sock.sendto(msg, ("255.255.255.255", UDP_DISCOVERY_PORT))
            except Exception:
                pass
            time.sleep(1.5)
        sock.close()

    def _run_udp_listener(self):
        """Listens for UDP beacons from other LAN peers."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("", UDP_DISCOVERY_PORT))
            sock.settimeout(1.0)
        except Exception:
            return

        while self.running:
            try:
                data, addr = sock.recvfrom(1024)
                payload = json.loads(data.decode("utf-8"))
                if payload.get("type") == "anydesk_beacon":
                    p_id = payload.get("peer_id")
                    if p_id and p_id != self.norm_id:
                        with self._lock:
                            self.lan_peers[p_id] = {
                                "peer_id": p_id,
                                "display_id": payload.get("display_id"),
                                "url": payload.get("url"),
                                "ip": addr[0],
                                "port": payload.get("port"),
                                "timestamp": time.time()
                            }
            except socket.timeout:
                continue
            except Exception:
                pass
        sock.close()

    def _scan_lan_subnet(self, clean_id: str) -> Optional[str]:
        """Probes common LAN IPs on port 8000 using 35 parallel threads to find peer."""
        if not self.local_ip or self.local_ip.startswith("127."):
            return None
        parts = self.local_ip.split(".")
        if len(parts) != 4:
            return None
        prefix = ".".join(parts[:3]) + "."

        def check_host(host_num: int) -> Optional[str]:
            ip = f"{prefix}{host_num}"
            if ip == self.local_ip:
                return None
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.12)
                if s.connect_ex((ip, 8000)) == 0:
                    s.close()
                    req = urllib.request.Request(f"http://{ip}:8000/api/info", headers={"User-Agent": "AnyDeskPro"})
                    with urllib.request.urlopen(req, timeout=0.25) as resp:
                        if resp.status == 200:
                            data = json.loads(resp.read().decode())
                            data_norm_id = data.get("peer_id", "").replace(" ", "").replace("-", "")
                            if data_norm_id == clean_id:
                                return f"http://{ip}:8000"
                else:
                    s.close()
            except Exception:
                pass
            return None

        try:
            with ThreadPoolExecutor(max_workers=35) as executor:
                futures = [executor.submit(check_host, i) for i in range(1, 255)]
                for f in futures:
                    res = f.result()
                    if res:
                        return res
        except Exception:
            pass
        return None

    def resolve(self, target: str) -> Optional[Dict[str, Any]]:
        """
        Resolves a target peer identifier (9-digit ID, IP, or URL) to a reachable HTTP URL.
        """
        target = target.strip()
        if not target:
            return None

        # Case 1: Target is an IP or Hostname or URL (e.g. 192.168.1.5:8000 or https://...)
        if ":" in target or (target.count(".") >= 3 and any(c.isdigit() for c in target)) or target.startswith("http"):
            url = target
            if not url.startswith("http://") and not url.startswith("https://"):
                url = f"http://{url}"
            # If no port specified and not https, default to :8000
            try:
                parsed = urllib.parse.urlparse(url)
                if not parsed.port and not url.startswith("https://"):
                    url = f"{url}:8000"
            except Exception:
                pass
            return {"url": url, "peer_id": None, "type": "direct"}

        clean_id = target.replace(" ", "").replace("-", "")

        # Case 2: Self
        if clean_id == self.norm_id:
            return {"url": f"http://127.0.0.1:{self.port}", "peer_id": self.norm_id, "type": "self"}

        # Case 3: Local file registry (another instance on this machine)
        if PEER_REGISTRY_FILE.exists():
            try:
                with open(PEER_REGISTRY_FILE, "r", encoding="utf-8") as f:
                    local_peers = json.load(f)
                if clean_id in local_peers:
                    peer = local_peers[clean_id]
                    return {
                        "url": peer.get("local_url") or peer.get("url"),
                        "peer_id": clean_id,
                        "type": "local"
                    }
            except Exception:
                pass

        # Case 4: LAN UDP Discovery
        with self._lock:
            now = time.time()
            self.lan_peers = {k: v for k, v in self.lan_peers.items() if now - v.get("timestamp", 0) < 6.0}
            if clean_id in self.lan_peers:
                return {
                    "url": self.lan_peers[clean_id]["url"],
                    "peer_id": clean_id,
                    "type": "lan"
                }

        # Case 5: Fast fallback port check on localhost (8000 - 8030)
        for p in range(8000, 8031):
            if p == self.port:
                continue
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.06)
                if s.connect_ex(("127.0.0.1", p)) == 0:
                    s.close()
                    req = urllib.request.Request(f"http://127.0.0.1:{p}/api/info", headers={"User-Agent": "AnyDeskPro"})
                    with urllib.request.urlopen(req, timeout=0.2) as resp:
                        if resp.status == 200:
                            data = json.loads(resp.read().decode())
                            data_norm_id = data.get("peer_id", "").replace(" ", "").replace("-", "")
                            if data_norm_id == clean_id:
                                return {"url": f"http://127.0.0.1:{p}", "peer_id": clean_id, "type": "local_probe"}
                else:
                    s.close()
            except Exception:
                pass

        # Case 6: Subnet scan for LAN peers if UDP broadcast was blocked
        subnet_url = self._scan_lan_subnet(clean_id)
        if subnet_url:
            with self._lock:
                self.lan_peers[clean_id] = {
                    "peer_id": clean_id,
                    "url": subnet_url,
                    "timestamp": time.time()
                }
            return {"url": subnet_url, "peer_id": clean_id, "type": "lan_probe"}

        return None

    def get_all_peers(self) -> list:
        """Returns list of active discovered peers (local instances and LAN computers)."""
        peers = []
        now = time.time()

        # 1. Read local file registry
        if PEER_REGISTRY_FILE.exists():
            try:
                with open(PEER_REGISTRY_FILE, "r", encoding="utf-8") as f:
                    local_peers = json.load(f)
                for pid, pinfo in local_peers.items():
                    if pid != self.norm_id and (now - pinfo.get("timestamp", 0) < 60.0):
                        peers.append({
                            "peer_id": pinfo.get("peer_id", pid),
                            "url": pinfo.get("local_url") or pinfo.get("url") or f"http://{pinfo.get('ip')}:{pinfo.get('port')}",
                            "type": "Local Instance",
                            "ip": pinfo.get("ip", "127.0.0.1"),
                            "timestamp": pinfo.get("timestamp")
                        })
            except Exception:
                pass

        # 2. LAN UDP peers
        with self._lock:
            for pid, pinfo in self.lan_peers.items():
                if pid != self.norm_id and (now - pinfo.get("timestamp", 0) < 15.0):
                    if not any(p["peer_id"] == pinfo.get("peer_id") for p in peers):
                        peers.append({
                            "peer_id": pinfo.get("peer_id", pid),
                            "url": pinfo.get("url"),
                            "type": "Network (LAN)",
                            "ip": pinfo.get("ip", ""),
                            "timestamp": pinfo.get("timestamp")
                        })

        return peers
