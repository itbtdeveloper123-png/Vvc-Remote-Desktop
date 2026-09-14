import React, { useState } from 'react';
import { ArrowRight, Globe, Lock, Clock, Wifi, XCircle, Loader2 } from 'lucide-react';
import { RecentSessions } from './RecentSessions.jsx';
import { DiscoveredPeers } from './DiscoveredPeers.jsx';

export function RemoteDeskCard({
  onConnect,
  onCancelConnect,
  connecting = false,
  connectStatus = '',
  sessions = [],
  peers = [],
  onDeleteSession,
  onClearAllHistory,
  onUpdateAlias,
  onRefreshPeers,
  loadingPeers = false
}) {
  const [targetId, setTargetId] = useState('');
  const [pin, setPin] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [activeTab, setActiveTab] = useState('recent'); // 'recent' | 'discovered'

  // Format 9-digit number as "### ### ###"
  const handleIdChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
    let formatted = raw;
    if (raw.length > 6) {
      formatted = `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6, 9)}`;
    } else if (raw.length > 3) {
      formatted = `${raw.slice(0, 3)} ${raw.slice(3)}`;
    }
    setTargetId(formatted);
  };

  const handleQuickConnect = (peerId, ip) => {
    const digits = peerId.replace(/\D/g, '');
    let formatted = digits;
    if (digits.length > 6) {
      formatted = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
    } else if (digits.length > 3) {
      formatted = `${digits.slice(0, 3)} ${digits.slice(3)}`;
    }
    setTargetId(formatted);
    onConnect(digits, pin, ip);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanId = targetId.replace(/\D/g, '');
    if (!cleanId) return;
    onConnect(cleanId, pin);
  };

  const isPendingApproval = connecting && connectStatus.toLowerCase().includes('approval');

  return (
    <div className="glass-card">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-title-icon">
            <Globe size={20} />
          </div>
          <div>
            <h2 className="card-title">Remote Desk</h2>
            <div className="card-subtitle">Connect and control partner desktop screen</div>
          </div>
        </div>
      </div>

      {/* Target Address Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="input-field-group" style={{ flex: 1 }}>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. 958 120 442"
              value={targetId}
              onChange={handleIdChange}
              disabled={connecting}
              autoComplete="off"
            />
          </div>

          {!connecting ? (
            <button
              type="submit"
              className="btn-primary"
              disabled={targetId.replace(/\D/g, '').length < 6}
            >
              <span>Connect</span>
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-action"
              onClick={onCancelConnect}
              style={{
                borderColor: 'var(--crimson)',
                color: '#f87171',
                padding: '0 18px',
                background: 'rgba(239, 68, 68, 0.1)'
              }}
              title="Cancel connection attempt"
            >
              <XCircle size={16} />
              <span>Cancel</span>
            </button>
          )}
        </div>

        {/* Optional PIN disclosure */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={() => setShowPinInput(!showPinInput)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Lock size={12} />
            <span>{showPinInput ? 'Hide PIN (Optional)' : 'Use Remote Security PIN'}</span>
          </button>
        </div>

        {showPinInput && (
          <div className="input-field-group">
            <input
              type="password"
              className="input-field"
              placeholder="Enter Partner PIN (if required)"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={connecting}
              maxLength={12}
              style={{ fontSize: '1rem', letterSpacing: '0.1em' }}
            />
          </div>
        )}

        {/* Status indicator bar during connecting */}
        {connecting && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fff',
            fontSize: '0.84rem'
          }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--crimson)' }} />
            <div style={{ flex: 1 }}>{connectStatus || 'Initiating connection...'}</div>
          </div>
        )}
      </form>

      {/* History & Discovered Sub-Tabs */}
      <div className="tray-nav">
        <button
          type="button"
          className={`tray-tab ${activeTab === 'recent' ? 'active' : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          <Clock size={14} />
          <span>Recent Sessions</span>
          <span className="tray-count">{sessions.length}</span>
        </button>
        <button
          type="button"
          className={`tray-tab ${activeTab === 'discovered' ? 'active' : ''}`}
          onClick={() => setActiveTab('discovered')}
        >
          <Wifi size={14} />
          <span>LAN Discovery</span>
          <span className="tray-count">{peers.length}</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'recent' ? (
          <RecentSessions
            sessions={sessions}
            onConnect={handleQuickConnect}
            onDeleteSession={onDeleteSession}
            onClearAll={onClearAllHistory}
            onUpdateAlias={onUpdateAlias}
          />
        ) : (
          <DiscoveredPeers
            peers={peers}
            onConnect={handleQuickConnect}
            onRefresh={onRefreshPeers}
            loading={loadingPeers}
          />
        )}
      </div>
    </div>
  );
}
