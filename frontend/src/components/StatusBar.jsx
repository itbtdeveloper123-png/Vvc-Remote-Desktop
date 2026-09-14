import React from 'react';
import { ShieldCheck, Wifi, Eye } from 'lucide-react';

export function StatusBar({
  hostInfo,
  latency = 3,
  packetLoss = '0.0%'
}) {
  const activeViewers = hostInfo?.active_sessions || 0;

  return (
    <footer className="app-status-bar">
      {/* Left Telemetry & Host Stats */}
      <div className="status-bar-left">
        <div className="status-stat-item">
          <span className="stat-dot-green" />
          <span className="stat-label">Host:</span>
          <span className="stat-val">Ready</span>
        </div>

        <div className="status-stat-divider" />

        <div className="status-stat-item">
          <Wifi size={12} color="var(--emerald)" />
          <span className="stat-label">Direct Ping:</span>
          <span className="stat-val">{latency} ms</span>
        </div>

        <div className="status-stat-divider" />

        <div className="status-stat-item">
          <span className="stat-label">Packet Loss:</span>
          <span className="stat-val">{packetLoss}</span>
        </div>

        <div className="status-stat-divider" />

        <div className="status-stat-item">
          <span className="stat-label">Stream Engine:</span>
          <span className="stat-val">H.264 / WebRTC Direct P2P</span>
        </div>

        <div className="status-stat-divider" />

        <div className="status-stat-item">
          <Eye size={12} color={activeViewers > 0 ? 'var(--emerald)' : 'var(--text-dim)'} />
          <span className="stat-label">Remote Viewers:</span>
          <span className="stat-val">{activeViewers}</span>
        </div>
      </div>

      {/* Right Security & Version Tags */}
      <div className="status-bar-right">
        <div className="status-stat-item">
          <ShieldCheck size={12} color="#38bdf8" />
          <span className="stat-label">Encryption:</span>
          <span className="stat-val" style={{ color: '#38bdf8' }}>TLS 1.3 / AES-256</span>
        </div>

        <div className="status-stat-divider" />

        <div className="status-stat-item">
          <span className="stat-build-tag">Vvc Remote PRO v1.2</span>
        </div>
      </div>
    </footer>
  );
}
