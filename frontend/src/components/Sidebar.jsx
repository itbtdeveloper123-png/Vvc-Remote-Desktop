import React from 'react';
import {
  Monitor, BookOpen, Folder, FileText, Video,
  Activity, Settings, Laptop
} from 'lucide-react';

export function Sidebar({
  activeNav = 'remote',
  onSelectNav,
  hostInfo,
  isRecording = false,
  onToggleRecording
}) {
  const hostname = hostInfo?.hostname || 'Windows PC';
  const localIp = hostInfo?.local_ip || '127.0.0.1';

  return (
    <aside className="app-sidebar">
      {/* Top Navigation Links */}
      <div className="sidebar-nav">
        <div className="nav-section-title">Main Navigation</div>

        <button
          type="button"
          className={`sidebar-item ${activeNav === 'remote' ? 'active' : ''}`}
          onClick={() => onSelectNav('remote')}
        >
          <Monitor size={17} />
          <span>Remote Desk</span>
          {activeNav === 'remote' && <span className="nav-active-pill" />}
        </button>

        <button
          type="button"
          className={`sidebar-item ${activeNav === 'addressbook' ? 'active' : ''}`}
          onClick={() => onSelectNav('addressbook')}
        >
          <BookOpen size={17} />
          <span>Address Book</span>
          {activeNav === 'addressbook' && <span className="nav-active-pill" />}
        </button>

        <button
          type="button"
          className={`sidebar-item ${activeNav === 'files' ? 'active' : ''}`}
          onClick={() => onSelectNav('files')}
        >
          <Folder size={17} />
          <span>File Transfer</span>
        </button>

        <div className="nav-section-title" style={{ marginTop: '12px' }}>Tools & System</div>

        <button
          type="button"
          className={`sidebar-item ${activeNav === 'logs' ? 'active' : ''}`}
          onClick={() => onSelectNav('logs')}
        >
          <FileText size={17} />
          <span>Session Logs</span>
        </button>

        <button
          type="button"
          className={`sidebar-item ${isRecording ? 'active' : ''}`}
          onClick={onToggleRecording}
          style={isRecording ? { borderColor: 'var(--crimson)', color: '#f87171' } : {}}
        >
          <Video size={17} style={isRecording ? { color: 'var(--crimson)', animation: 'pulse 1s infinite' } : {}} />
          <span>{isRecording ? 'Recording (REC)' : 'Screen Record'}</span>
          {isRecording && <span className="nav-active-pill" />}
        </button>

        <button
          type="button"
          className={`sidebar-item ${activeNav === 'diagnostics' ? 'active' : ''}`}
          onClick={() => onSelectNav('diagnostics')}
        >
          <Activity size={17} />
          <span>Diagnostics</span>
        </button>

        <button
          type="button"
          className={`sidebar-item ${activeNav === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectNav('settings')}
        >
          <Settings size={17} />
          <span>Settings</span>
        </button>
      </div>

      {/* Bottom Host Mini Profile */}
      <div className="sidebar-host-profile">
        <div className="host-avatar">
          <Laptop size={16} />
          <span className="avatar-online-dot" />
        </div>
        <div className="host-profile-details">
          <div className="profile-name" title={hostname}>{hostname}</div>
          <div className="profile-meta">{localIp}</div>
        </div>
      </div>
    </aside>
  );
}
