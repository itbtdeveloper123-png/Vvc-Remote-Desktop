import React, { useState } from 'react';
import { Monitor, Play, Trash2, Edit3, Check, Clock, AlertCircle } from 'lucide-react';

export function RecentSessions({
  sessions = [],
  onConnect,
  onDeleteSession,
  onClearAll,
  onUpdateAlias
}) {
  const [editingId, setEditingId] = useState(null);
  const [aliasInput, setAliasInput] = useState('');

  const formatId = (raw) => {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 9) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
    }
    return raw;
  };

  const handleStartEdit = (session) => {
    setEditingId(session.remote_id || session.id);
    setAliasInput(session.alias || '');
  };

  const handleSaveAlias = (remoteId) => {
    if (onUpdateAlias) {
      onUpdateAlias(remoteId, aliasInput.trim());
    }
    setEditingId(null);
  };

  if (!sessions.length) {
    return (
      <div style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--text-dim)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px'
      }}>
        <Clock size={32} style={{ opacity: 0.35 }} />
        <div style={{ fontSize: '0.88rem' }}>No recent sessions recorded yet</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', maxWidth: '300px' }}>
          Connect to a remote computer above to establish your history.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '4px'
      }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Recent Connections ({sessions.length})
        </span>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 4
            }}
            title="Clear all recent sessions"
          >
            <Trash2 size={12} />
            <span>Clear All</span>
          </button>
        )}
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxHeight: '260px',
        overflowY: 'auto',
        paddingRight: '4px'
      }}>
        {sessions.map((item) => {
          const remoteId = item.remote_id || item.id;
          const isEditing = editingId === remoteId;

          return (
            <div key={item.id || remoteId} className="history-item">
              {/* Left: Device Icon & Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  flexShrink: 0
                }}>
                  <Monitor size={16} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveAlias(remoteId);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        placeholder="Device Alias"
                        autoFocus
                        style={{
                          background: 'rgba(10, 14, 23, 0.9)',
                          border: '1px solid var(--crimson)',
                          borderRadius: 4,
                          padding: '2px 6px',
                          color: '#fff',
                          fontSize: '0.82rem',
                          outline: 'none',
                          width: '130px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveAlias(remoteId)}
                        style={{
                          background: 'var(--crimson)',
                          border: 'none',
                          borderRadius: 4,
                          padding: '3px 6px',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {item.alias || formatId(remoteId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          padding: 2
                        }}
                        title="Edit Alias"
                      >
                        <Edit3 size={11} />
                      </button>
                    </div>
                  )}

                  <div style={{
                    fontSize: '0.74rem',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 2
                  }}>
                    {formatId(remoteId)} {item.remote_ip ? `• ${item.remote_ip}` : ''}
                  </div>
                </div>
              </div>

              {/* Right: Quick Connect & Delete Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => onConnect(remoteId, item.remote_ip)}
                  style={{ padding: '6px 12px' }}
                  title="Reconnect"
                >
                  <Play size={13} fill="currentColor" color="var(--crimson)" />
                  <span>Connect</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSession(item.id || remoteId)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Remove from history"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
