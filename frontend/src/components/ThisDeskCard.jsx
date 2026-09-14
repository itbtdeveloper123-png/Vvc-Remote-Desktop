import React, { useState } from 'react';
import { Copy, Check, Eye, EyeOff, RefreshCw, Mouse, Keyboard, Power, ShieldCheck, ShieldAlert } from 'lucide-react';

export function ThisDeskCard({
  hostInfo,
  onRefreshPin,
  onUpdatePermissions,
  onUpdateAutostart,
  onUpdateAutoAccept,
  onToast
}) {
  const [copied, setCopied] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [refreshingPin, setRefreshingPin] = useState(false);

  const peerId = hostInfo?.peer_id || '--- --- ---';
  const pin = hostInfo?.pin || '••••••';
  const allowMouse = hostInfo?.allow_mouse ?? true;
  const allowKeyboard = hostInfo?.allow_keyboard ?? true;
  const autostart = hostInfo?.autostart ?? true;
  const autoAccept = hostInfo?.auto_accept ?? true;

  const handleCopyId = () => {
    navigator.clipboard.writeText(peerId.replace(/\s+/g, ''));
    setCopied(true);
    if (onToast) onToast('Peer ID copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefreshPin = async () => {
    setRefreshingPin(true);
    try {
      await onRefreshPin();
      if (onToast) onToast('New security PIN generated!', 'success');
    } catch (_) {
      if (onToast) onToast('Failed to refresh PIN', 'error');
    } finally {
      setRefreshingPin(false);
    }
  };

  return (
    <div className="glass-card">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-title-icon">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="card-title">This Desk</h2>
            <div className="card-subtitle">Share your address and PIN to grant remote access</div>
          </div>
        </div>
        <div className="status-pill">
          <span className="status-dot" />
          <span>Host Active</span>
        </div>
      </div>

      {/* 9-Digit Peer ID Box */}
      <div className="id-display-box">
        <div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Your Address
          </div>
          <div className="id-number">{peerId}</div>
        </div>
        <button
          type="button"
          className="btn-action"
          onClick={handleCopyId}
          title="Copy 9-digit address"
        >
          {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* PIN Display Box */}
      <div className="pin-display-box">
        <div>
          <div className="pin-label">One-Time Security PIN</div>
          <div className="pin-number">
            {showPin ? pin : '••••••'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn-action"
            onClick={() => setShowPin(!showPin)}
            title={showPin ? 'Hide PIN' : 'Show PIN'}
          >
            {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            className="btn-action"
            onClick={handleRefreshPin}
            disabled={refreshingPin}
            title="Generate new PIN"
          >
            <RefreshCw size={14} style={{ animation: refreshingPin ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Permission Toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="switch-row">
          <div className="switch-label-group">
            <Mouse size={16} className="switch-icon" />
            <span className="switch-title">Allow Mouse Control</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={allowMouse}
              onChange={(e) => onUpdatePermissions(e.target.checked, allowKeyboard)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="switch-row">
          <div className="switch-label-group">
            <Keyboard size={16} className="switch-icon" />
            <span className="switch-title">Allow Keyboard Input</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={allowKeyboard}
              onChange={(e) => onUpdatePermissions(allowMouse, e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="switch-row">
          <div className="switch-label-group">
            <Power size={16} className="switch-icon" />
            <span className="switch-title">Start with Windows (Silent)</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => onUpdateAutostart(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="switch-row">
          <div className="switch-label-group">
            <ShieldAlert size={16} className="switch-icon" />
            <div>
              <span className="switch-title">One-Click Direct Approval</span>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                {autoAccept ? 'Auto-authorizes connections' : 'Prompts host approval modal'}
              </div>
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={autoAccept}
              onChange={(e) => onUpdateAutoAccept(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}
