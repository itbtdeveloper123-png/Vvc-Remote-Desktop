import React, { useState } from 'react';
import { BookOpen, X, Search, Plus, Play, Folder, Trash2, Monitor } from 'lucide-react';

export function AddressBookModal({
  isOpen,
  onClose,
  sessions = [],
  onConnect,
  onOpenFiles,
  onAddContact,
  onDeleteContact,
  onToast
}) {
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newId, setNewId] = useState('');
  const [newAlias, setNewAlias] = useState('');

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

  const handleAddSubmit = (e) => {
    e.preventDefault();
    const cleanId = newId.replace(/\D/g, '');
    if (cleanId.length < 6) {
      if (onToast) onToast('Please enter a valid partner address', 'error');
      return;
    }
    if (onAddContact) {
      onAddContact(cleanId, newAlias.trim() || `Computer ${cleanId.slice(0, 4)}`);
    }
    setNewId('');
    setNewAlias('');
    setShowAddForm(false);
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
              <BookOpen size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                Address Book (សៀវភៅកត់ត្រាអាសយដ្ឋាន)
              </h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                Manage frequently accessed computers, nicknames, and partner IDs
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
              placeholder="Search address book..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', fontSize: '0.86rem' }}
            />
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ padding: '8px 14px', fontSize: '0.84rem' }}
          >
            <Plus size={15} />
            <span>Add Computer</span>
          </button>
        </div>

        {/* Add Computer Subform */}
        {showAddForm && (
          <form
            onSubmit={handleAddSubmit}
            style={{
              background: 'rgba(10, 14, 23, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              marginBottom: '12px'
            }}
          >
            <input
              type="text"
              className="input-field"
              placeholder="9-digit Address (e.g. 123 456 789)"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              style={{ flex: 1, fontSize: '0.86rem' }}
            />
            <input
              type="text"
              className="input-field"
              placeholder="Device Nickname / Alias"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              style={{ flex: 1, fontSize: '0.86rem' }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.84rem' }}>
              Save
            </button>
            <button
              type="button"
              className="btn-action"
              onClick={() => setShowAddForm(false)}
              style={{ padding: '8px 12px' }}
            >
              Cancel
            </button>
          </form>
        )}

        {/* Contact Grid */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
          padding: '4px'
        }}>
          {!filtered.length ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 16px', color: 'var(--text-dim)' }}>
              <BookOpen size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>No contacts found in your address book</div>
            </div>
          ) : (
            filtered.map((item) => {
              const remoteId = item.remote_id || item.id;
              return (
                <div
                  key={item.id || remoteId}
                  className="glass-card"
                  style={{
                    padding: '16px',
                    gap: '12px',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(10, 14, 23, 0.65)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: 'var(--crimson)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Monitor size={18} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.alias || `Workstation ${formatId(remoteId)}`}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        {formatId(remoteId)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <button
                      type="button"
                      className="btn-action"
                      onClick={() => {
                        onClose();
                        onOpenFiles({ peerId: remoteId, targetBaseUrl: item.remote_ip ? `http://${item.remote_ip}` : '', alias: item.alias });
                      }}
                      style={{ flex: 1, justifyContent: 'center', padding: '6px 10px', fontSize: '0.78rem' }}
                      title="Browse Remote Files"
                    >
                      <Folder size={13} />
                      <span>Files</span>
                    </button>

                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        onClose();
                        onConnect(remoteId, '', item.remote_ip);
                      }}
                      style={{ flex: 1.2, justifyContent: 'center', padding: '6px 12px', fontSize: '0.78rem' }}
                      title="Connect Screen"
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Connect</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteContact(item.id || remoteId)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: '6px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Delete Contact"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
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
