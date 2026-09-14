import React, { useState } from 'react';
import { Settings, X, Power, ShieldCheck, Mouse, Keyboard, Sliders, Check, Globe } from 'lucide-react';

export function SettingsModal({
  isOpen,
  onClose,
  hostInfo,
  onUpdatePermissions,
  onUpdateAutostart,
  onUpdateAutoAccept,
  onToast
}) {
  const [fps, setFps] = useState('30');
  const [relayUrl, setRelayUrl] = useState(() => localStorage.getItem('vvc_relay_url') || '');

  if (!isOpen) return null;

  const allowMouse = hostInfo?.allow_mouse ?? true;
  const allowKeyboard = hostInfo?.allow_keyboard ?? true;
  const autostart = hostInfo?.autostart ?? true;
  const autoAccept = hostInfo?.auto_accept ?? true;

  const handleSave = () => {
    localStorage.setItem('vvc_relay_url', relayUrl.trim());
    if (onToast) onToast('Settings saved successfully', 'success');
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--crimson)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Settings size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                Application Settings (ការកំណត់)
              </h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                Configure host access, startup, and streaming preferences
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
          {/* Access & Authorization */}
          <div>
            <div className="nav-section-title" style={{ paddingLeft: 0, paddingBottom: '8px' }}>
              Access & Authorization (ការអនុញ្ញាត)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="switch-row">
                <div className="switch-label-group">
                  <ShieldCheck size={16} className="switch-icon" />
                  <div>
                    <span className="switch-title">Direct Auto-Accept (បើកទទួលស្វ័យប្រវត្តិ)</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Connect unattended without showing manual prompt dialog
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

              <div className="switch-row">
                <div className="switch-label-group">
                  <Power size={16} className="switch-icon" />
                  <div>
                    <span className="switch-title">Start with Windows (Silent Boot)</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Run host background service automatically on system boot
                    </div>
                  </div>
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
            </div>
          </div>

          {/* Default Control Permissions */}
          <div>
            <div className="nav-section-title" style={{ paddingLeft: 0, paddingBottom: '8px' }}>
              Default Host Permissions (សិទ្ធិគ្រប់គ្រង)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="switch-row">
                <div className="switch-label-group">
                  <Mouse size={16} className="switch-icon" />
                  <span className="switch-title">Allow Remote Mouse Control</span>
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
                  <span className="switch-title">Allow Remote Keyboard Input</span>
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
            </div>
          </div>

          {/* Global Signaling & Relay Server */}
          <div>
            <div className="nav-section-title" style={{ paddingLeft: 0, paddingBottom: '8px' }}>
              Global Signaling Server (ម៉ាស៊ីនមេកណ្តាល)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ position: 'relative' }}>
                <Globe size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. https://vvc-remote-relay.onrender.com"
                  value={relayUrl}
                  onChange={(e) => setRelayUrl(e.target.value)}
                  style={{ paddingLeft: '36px', fontSize: '0.86rem' }}
                />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Leave empty for automatic LAN P2P mode, or enter your free Render/Railway server URL for global cross-network access.
              </div>
            </div>
          </div>

          {/* Display & Quality */}
          <div>
            <div className="nav-section-title" style={{ paddingLeft: 0, paddingBottom: '8px' }}>
              Display & Framerate (កម្រិតរូបភាព)
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['15', '30', '60'].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFps(val)}
                  className="btn-action"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '8px',
                    borderColor: fps === val ? 'var(--crimson)' : 'var(--border-subtle)',
                    background: fps === val ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: fps === val ? '#fff' : 'var(--text-muted)'
                  }}
                >
                  <Sliders size={14} />
                  <span>{val} FPS {val === '60' ? '(Pro)' : val === '30' ? '(Balanced)' : '(Low-data)'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" className="btn-action" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} style={{ padding: '8px 20px', fontSize: '0.88rem' }}>
            <Check size={16} />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
