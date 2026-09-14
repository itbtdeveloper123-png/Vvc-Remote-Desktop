import React, { useState } from 'react';
import { Activity, X, RefreshCw, CheckCircle2, Wifi, Monitor, Cpu, Radio } from 'lucide-react';

export function DiagnosticsModal({
  isOpen,
  onClose,
  hostInfo,
  onToast
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  if (!isOpen) return null;

  const handleRunTest = async () => {
    setTesting(true);
    setTestResult(null);

    const start = performance.now();
    try {
      const res = await fetch('/api/info');
      const elapsed = Math.round(performance.now() - start);

      setTestResult({
        latency: elapsed,
        status: elapsed < 30 ? 'Optimal (Excellent)' : elapsed < 80 ? 'Good' : 'Acceptable',
        color: elapsed < 30 ? 'var(--emerald)' : elapsed < 80 ? 'var(--cyan)' : 'var(--amber)'
      });
      if (onToast) onToast(`Speed Test complete: ${elapsed} ms RTT`, 'success');
    } catch (e) {
      setTestResult({
        latency: 0,
        status: 'Failed / Host Offline',
        color: 'var(--crimson)'
      });
    } finally {
      setTesting(false);
    }
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
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Activity size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                Diagnostics & Speed Test
              </h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                Inspect connection health, latency, and hardware acceleration
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

        {/* Speed Test Banner */}
        <div style={{
          background: 'rgba(10, 14, 23, 0.7)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Local Signaling & P2P Stream Latency
          </div>

          <div style={{
            fontSize: '2.2rem',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: testResult ? testResult.color : '#fff'
          }}>
            {testResult ? `${testResult.latency} ms` : '-- ms'}
          </div>

          {testResult && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
              fontWeight: 600,
              color: testResult.color,
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '3px 12px',
              borderRadius: '20px'
            }}>
              <CheckCircle2 size={14} />
              <span>{testResult.status}</span>
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={handleRunTest}
            disabled={testing}
            style={{ padding: '8px 24px', fontSize: '0.86rem', marginTop: 4 }}
          >
            <RefreshCw size={15} style={{ animation: testing ? 'spin 0.8s linear infinite' : 'none' }} />
            <span>{testing ? 'Testing Network...' : 'Run Speed Test'}</span>
          </button>
        </div>

        {/* Hardware & Stream Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              <Monitor size={14} /> Native Display
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {hostInfo?.width || 1920} × {hostInfo?.height || 1080}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              <Radio size={14} /> Frame Rate
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {hostInfo?.target_fps || 30} FPS (Target)
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              <Wifi size={14} /> Local Interface
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {hostInfo?.local_ip || '127.0.0.1'}:8000
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              <Cpu size={14} /> Video Codec
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--emerald)', marginTop: 4 }}>
              H.264 / AV1 WebRTC
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '6px' }}>
          <button type="button" className="btn-action" onClick={onClose} style={{ padding: '8px 20px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
