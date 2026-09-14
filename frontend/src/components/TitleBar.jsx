import React from 'react';
import { Monitor, Home, Plus, X, Radio } from 'lucide-react';

export function TitleBar({
  tabs = [],
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewConnection
}) {
  return (
    <header className="desktop-titlebar">
      {/* Left: Window Controls & Brand */}
      <div className="titlebar-brand">
        <div className="traffic-lights">
          <span className="traffic-dot close" title="Close" />
          <span className="traffic-dot min" title="Minimize" />
          <span className="traffic-dot zoom" title="Maximize" />
        </div>

        <div className="brand-icon-box" style={{ marginLeft: 8 }}>
          <Monitor size={16} />
        </div>
        <div className="brand-name">
          Vvc <span>Remote</span>
        </div>
        <span className="brand-badge">PRO</span>
      </div>

      {/* Center: Multi-Session Tab Bar */}
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-item ${activeTabId === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectTab('dashboard')}
          title="Dashboard / Home"
        >
          <Home size={14} />
          <span>Dashboard</span>
        </button>

        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
            title={`Remote Session: ${tab.title || tab.id}`}
          >
            <Monitor size={14} />
            <span>{tab.title || tab.id}</span>
            <span
              className="tab-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              title="Close Session"
            >
              <X size={12} />
            </span>
          </div>
        ))}

        <button
          type="button"
          className="tab-new-btn"
          onClick={onNewConnection}
          title="New Connection"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Right: Network Status Indicator */}
      <div>
        <div className="status-pill">
          <span className="status-dot" />
          <span>Network Ready</span>
        </div>
      </div>
    </header>
  );
}
