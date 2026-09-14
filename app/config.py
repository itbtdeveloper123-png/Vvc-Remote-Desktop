"""Vvc Remote: High-Performance Remote Desktop System Configuration"""
import os
from dataclasses import dataclass, field
from typing import List

@dataclass
class NetworkConfig:
    host: str = "0.0.0.0"
    port: int = 8000
    central_relay_url: str = os.getenv("VVC_RELAY_URL", "")
    ice_servers: List[dict] = field(default_factory=lambda: [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
        {"urls": "stun:stun.cloudflare.com:3478"}
    ])

@dataclass
class CaptureConfig:
    target_fps: int = 60
    jpeg_quality: int = 90
    scale_factor: float = 1.0  # 1.0 = native resolution, 0.75 = downscaled for speed
    capture_cursor: bool = True

@dataclass
class SecurityConfig:
    peer_id_length: int = 9
    pin_length: int = 6
    session_timeout_seconds: int = 3600

@dataclass
class AppConfig:
    network: NetworkConfig = field(default_factory=NetworkConfig)
    capture: CaptureConfig = field(default_factory=CaptureConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)

CONFIG = AppConfig()
