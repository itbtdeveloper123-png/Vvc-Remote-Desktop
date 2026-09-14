import React, { useState } from 'react';
import { FileText, X, Search, Trash2, ArrowUpRight, Clock } from 'lucide-react';

export function LogsModal({
  isOpen,
  onClose,
  sessions = [],
  onConnect,
  onClearLogs,
  onToast
}) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    return (
      (s.remote_id || '').toLowerCase().includes(q) ||
      (s.alias || '').toLowerCase().includes(q) ||
      (s.remote_ip || '').toLowerCase().includes(q)
    );
  });

  const formatId = (raw) => {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 9) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
    }
    return raw;
  };

  const handleClear = () => {
    if (!confirm('Are you sure you want to clear all connection logs?')) return;
    onClearLogs();
    if (onToast) onToast('All session logs cleared', 'info');
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-card large" style={{ display: 'flex', flexDirection: 'column' }}>
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
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                Session Audit Logs (ប្រវត្តិភ្ជាប់)
              </h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                Detailed record of all previous incoming and outgoing remote connections
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

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Filter logs by ID, alias, or IP address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', fontSize: '0.86rem' }}
            />
          </div>

          {sessions.length > 0 && (
            <button
              type="button"
              className="btn-action"
              onClick={handleClear}
              style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              title="Clear all log entries"
            >
              <Trash2 size={14} />
              <span>Clear Logs</span>
            </button>
          )}
        </div>

        {/* Log Table */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(10, 14, 23, 0.5)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)'
        }}>
          {!filtered.length ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-dim)' }}>
              <Clock size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>No connection logs matching your filter</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{
                  position: 'sticky',
                  top: 0,
                  background: 'rgba(15, 21, 33, 0.98)',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-dim)',
                  fontSize: '0.74rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  <th style={{ padding: '10px 14px' }}>Target Address</th>
                  <th style={{ padding: '10px 14px' }}>Device Name / Alias</th>
                  <th style={{ padding: '10px 14px' }}>Remote Host / IP</th>
                  <th style={{ padding: '10px 14px', width: '100px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const remoteId = item.remote_id || item.id;
                  return (
                    <tr
                      key={item.id || remoteId}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
                        {formatId(remoteId)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-main)' }}>
                        {item.alias || 'Remote Desktop'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {item.remote_ip || 'Local / LAN'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => {
                            onClose();
                            onConnect(remoteId, '', item.remote_ip);
                          }}
                          style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                        >
                          <span>Connect</span>
                          <ArrowUpRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px' }}>
          <button type="button" className="btn-action" onClick={onClose} style={{ padding: '8px 20px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
