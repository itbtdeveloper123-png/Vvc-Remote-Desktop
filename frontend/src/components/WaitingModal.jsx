import React from 'react';
import { Radio, X } from 'lucide-react';

export function WaitingModal({
  isOpen,
  targetId,
  status = 'Waiting for partner authorization...',
  onCancel
}) {
  if (!isOpen) return null;

  const formatId = (raw) => {
    const d = (raw || '').replace(/\D/g, '');
    if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;
    return raw;
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-card" style={{ maxWidth: '440px', textAlign: 'center', padding: '32px' }}>
        {/* Animated Radar */}
        <div className="radar-container">
          <div className="radar-ring ring-1" />
          <div className="radar-ring ring-2" />
          <div className="radar-center">
            <Radio size={22} />
          </div>
        </div>

        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
          Connecting to Partner
        </h3>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.5rem',
          fontWeight: 800,
          color: 'var(--crimson)',
          letterSpacing: '0.08em',
          marginBottom: '14px'
        }}>
          {formatId(targetId)}
        </div>

        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
          {status}
        </p>

        <button
          type="button"
          className="btn-action"
          onClick={onCancel}
          style={{
            margin: '0 auto',
            padding: '10px 24px',
            borderColor: 'var(--crimson)',
            color: '#f87171',
            background: 'rgba(239, 68, 68, 0.12)',
            fontSize: '0.9rem',
            fontWeight: 600
          }}
        >
          <X size={16} />
          <span>Cancel Request</span>
        </button>
      </div>
    </div>
  );
}
