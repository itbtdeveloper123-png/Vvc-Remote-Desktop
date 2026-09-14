import React from 'react';
import { Wifi, RefreshCw, Monitor, ArrowUpRight } from 'lucide-react';

export function DiscoveredPeers({
  peers = [],
  onConnect,
  onRefresh,
  loading = false
}) {
  const formatId = (raw) => {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 9) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
    }
    return raw;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '4px'
      }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Local Network Discovered ({peers.length})
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
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
          title="Scan local subnet"
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          <span>Scan LAN</span>
        </button>
      </div>

      {!peers.length ? (
        <div style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--text-dim)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px'
        }}>
          <Wifi size={32} style={{ opacity: 0.35 }} />
          <div style={{ fontSize: '0.88rem' }}>No other Vvc Remote devices found on LAN</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', maxWidth: '300px' }}>
            Devices on the same Wi-Fi or subnet with Vvc Remote open will appear here automatically.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '260px',
          overflowY: 'auto',
          paddingRight: '4px'
        }}>
          {peers.map((peer) => {
            const peerId = peer.peer_id || peer.id;
            return (
              <div key={peerId || peer.ip} className="history-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--emerald)',
                    flexShrink: 0
                  }}>
                    <Monitor size={16} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {peer.hostname || 'LAN Device'}
                      </span>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--emerald)',
                        boxShadow: '0 0 6px var(--emerald)'
                      }} />
                    </div>
                    <div style={{
                      fontSize: '0.74rem',
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)',
                      marginTop: 2
                    }}>
                      {formatId(peerId)} • {peer.ip}:{peer.port || 8000}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-action"
                  onClick={() => onConnect(peerId, `${peer.ip}:${peer.port || 8000}`)}
                  style={{ padding: '6px 12px', flexShrink: 0 }}
                  title={`Connect to ${peer.hostname || peer.ip}`}
                >
                  <span>Connect</span>
                  <ArrowUpRight size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
