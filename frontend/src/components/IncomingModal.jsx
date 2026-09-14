import React, { useState, useEffect } from 'react';
import { ShieldAlert, Check, X, Mouse, Keyboard, Clock } from 'lucide-react';

export function IncomingModal({
  request,
  onAccept,
  onDecline
}) {
  const [allowMouse, setAllowMouse] = useState(true);
  const [allowKeyboard, setAllowKeyboard] = useState(true);
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    if (!request) return;
    setTimeLeft(60);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDecline(request.request_id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [request, onDecline]);

  if (!request) return null;

  const peerId = request.peer_id || 'Unknown';
  const formatId = (raw) => {
    const d = (raw || '').replace(/\D/g, '');
    if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;
    return raw;
  };

  const progressPercent = Math.max(0, (timeLeft / 60) * 100);

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--crimson)'
          }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
              Incoming Connection Request
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              A remote partner wants to view and control your desktop
            </div>
          </div>
        </div>

        {/* Remote Peer Details */}
        <div style={{
          background: 'rgba(10, 14, 23, 0.7)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Partner Address
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
              {formatId(peerId)}
            </span>
          </div>
          {request.hostname && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-dim)' }}>Hostname</span>
              <span style={{ color: 'var(--text-main)' }}>{request.hostname}</span>
            </div>
          )}
          {request.remote_ip && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-dim)' }}>IP Address</span>
              <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{request.remote_ip}</span>
            </div>
          )}
        </div>

        {/* Permissions Switches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Grant Permissions
          </span>

          <div className="switch-row">
            <div className="switch-label-group">
              <Mouse size={16} className="switch-icon" />
              <span className="switch-title">Mouse Control</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allowMouse}
                onChange={(e) => setAllowMouse(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="switch-row">
            <div className="switch-label-group">
              <Keyboard size={16} className="switch-icon" />
              <span className="switch-title">Keyboard Input</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allowKeyboard}
                onChange={(e) => setAllowKeyboard(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* Timeout countdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} /> Auto-declines in
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: timeLeft <= 10 ? 'var(--crimson)' : 'inherit' }}>
              {timeLeft}s
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(255, 255, 255, 0.08)',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: timeLeft <= 10 ? 'var(--crimson)' : 'var(--emerald)',
              transition: 'width 1s linear, background-color 0.3s ease'
            }} />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <button
            type="button"
            className="btn-action"
            onClick={() => onDecline(request.request_id)}
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: '12px',
              fontSize: '0.92rem',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#f87171'
            }}
          >
            <X size={16} />
            <span>Decline</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => onAccept(request.request_id, allowMouse, allowKeyboard)}
            style={{
              flex: 1.4,
              padding: '12px',
              fontSize: '0.92rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 18px rgba(16, 185, 129, 0.35)'
            }}
          >
            <Check size={18} />
            <span>Accept Connection</span>
          </button>
        </div>
      </div>
    </div>
  );
}
