/**
 * Vvc Remote: High-Performance Enterprise Remote Desktop Client
 * macOS Sonoma Frosted Glassmorphism UI Controller
 */

const UI = {
  elements: {
    hostPeerId: document.getElementById('host-peer-id'),
    hostPin: document.getElementById('host-pin'),
    btnTogglePinVisibility: document.getElementById('btn-toggle-pin-visibility'),
    btnCopyId: document.getElementById('btn-copy-id'),
    btnPasteId: document.getElementById('btn-paste-id'),
    btnRefreshPin: document.getElementById('btn-refresh-pin'),
    permMouse: document.getElementById('perm-mouse'),
    permKeyboard: document.getElementById('perm-keyboard'),
    permClipboard: document.getElementById('perm-clipboard'),
    permFileTransfer: document.getElementById('perm-file-transfer'),
    settingAutoAccept: document.getElementById('setting-auto-accept'),
    settingAutostart: document.getElementById('setting-autostart'),
    accessModeText: document.getElementById('access-mode-text'),
    activeViewersCount: document.getElementById('active-viewers-count'),
    connectForm: document.getElementById('connect-form'),
    remoteIdInput: document.getElementById('remote-id-input'),
    btnStartConnect: document.getElementById('btn-start-connect'),
    dashboardView: document.getElementById('dashboard-view'),
    sessionViewport: document.getElementById('session-viewport'),
    sessionToolbar: document.getElementById('session-toolbar'),
    btnToggleToolbar: document.getElementById('btn-toggle-toolbar'),
    btnViewMode: document.getElementById('btn-view-mode'),
    viewModeText: document.getElementById('view-mode-text'),
    displayContainer: document.getElementById('display-container'),
    toolbarPeerId: document.getElementById('toolbar-peer-id'),
    hudProtocol: document.getElementById('hud-protocol'),
    hudLatency: document.getElementById('hud-latency'),
    hudFps: document.getElementById('hud-fps'),
    hudRes: document.getElementById('hud-res'),
    btnSendCad: document.getElementById('btn-send-cad'),
    btnSendWin: document.getElementById('btn-send-win'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    btnDisconnect: document.getElementById('btn-disconnect'),
    toastContainer: document.getElementById('toast-container'),
    remoteVideo: document.getElementById('remote-video'),
    remoteCanvas: document.getElementById('remote-canvas'),
    // Peer Tabs & SQLite History
    tabBtnHistory: document.getElementById('tab-btn-history'),
    tabBtnDiscovered: document.getElementById('tab-btn-discovered'),
    tabContentHistory: document.getElementById('tab-content-history'),
    tabContentDiscovered: document.getElementById('tab-content-discovered'),
    historyCount: document.getElementById('history-count'),
    historyList: document.getElementById('history-list'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    discoveredList: document.getElementById('discovered-list'),
    discoveredCount: document.getElementById('discovered-count'),
    deviceSearchInput: document.getElementById('device-search-input'),
    // Bottom Status Bar & Quick Indicators
    statusLatencyVal: document.getElementById('status-latency-val'),
    statusLossVal: document.getElementById('status-loss-val'),
    statusCodecVal: document.getElementById('status-codec-val'),
    headerQuickLatency: document.getElementById('header-quick-latency'),
    // Incoming Connection Request Modal (Host-side)
    incomingModal: document.getElementById('incoming-request-modal'),
    incomingPeerId: document.getElementById('incoming-peer-id'),
    btnAcceptRequest: document.getElementById('btn-accept-request'),
    btnRejectRequest: document.getElementById('btn-reject-request'),
    // Client Waiting Modal
    waitingModal: document.getElementById('waiting-modal'),
    waitingTargetId: document.getElementById('waiting-target-id'),
    btnCancelWaiting: document.getElementById('btn-cancel-waiting'),
    // Active Background Session Dock & Navigation
    activeSessionDock: document.getElementById('active-session-dock'),
    dockPeerId: document.getElementById('dock-peer-id'),
    btnDockReturn: document.getElementById('btn-dock-return'),
    btnDockFiles: document.getElementById('btn-dock-files'),
    btnDockDisconnect: document.getElementById('btn-dock-disconnect'),
    btnSessionHome: document.getElementById('btn-session-home'),
    btnSessionFiles: document.getElementById('btn-session-files'),
    // Remote File Explorer
    fileTransferModal: document.getElementById('file-transfer-modal'),
    feDrivesList: document.getElementById('fe-drives-list'),
    feCurrentPath: document.getElementById('fe-path-input'),
    feBtnUp: document.getElementById('fe-btn-up'),
    feBtnGo: document.getElementById('fe-btn-go'),
    feBtnRefresh: document.getElementById('fe-btn-refresh'),
    feFilesList: document.getElementById('fe-files-list'),
    feBtnUpload: document.getElementById('fe-btn-upload'),
    feUploadInput: document.getElementById('fe-upload-input'),
    feBtnNewFolder: document.getElementById('fe-btn-new-folder'),
    // Lock Screen Unlock & AnyDesk Multi-Session Tab Bar
    btnSessionUnlock: document.getElementById('btn-session-unlock'),
    sessionTabBar: document.getElementById('session-tab-bar'),
    tabNavDashboard: document.getElementById('tab-nav-dashboard'),
    sessionTabsList: document.getElementById('session-tabs-list'),
    btnTabNewConnection: document.getElementById('btn-tab-new-connection')
  },

  currentPendingRequestId: null,
  pollInterval: null,
  peersPollInterval: null,
  _cancelWaitingHandler: null,
  isOriginalScale: false,
  isAutoAcceptEnabled: true,
  isPinVisible: false,
  currentPin: '',
  cachedHistory: [],
  cachedPeers: [],
  currentSearchQuery: '',
  currentRemotePath: 'C:\\',
  parentRemotePath: null,
  activeSessionPeerId: null,

  init() {
    this.bindEvents();
    this.fetchHostInfo();
    this.startHostPolling();
    this.fetchDiscoveredPeers();
    this.startPeersPolling();
    this.fetchHistory();
    this.fetchAutostart();
    this.fetchAutoAccept();
  },

  showToast(message, type = 'info') {
    if (!this.elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? '❌' : type === 'success' ? '✔' : 'ℹ';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    this.elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  playNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  },

  // --- Discovered LAN Peers ---
  startPeersPolling() {
    if (this.peersPollInterval) clearInterval(this.peersPollInterval);
    this.peersPollInterval = setInterval(() => {
      this.fetchDiscoveredPeers();
    }, 4000);
  },

  async fetchDiscoveredPeers() {
    try {
      const res = await fetch('/api/peers');
      if (!res.ok) return;
      const data = await res.json();
      const peers = data.peers || [];
      this.cachedPeers = peers;
      this.renderDiscoveredPeers(peers);
    } catch (e) {
      console.warn('Error fetching discovered peers:', e);
    }
  },

  renderDiscoveredPeers(peers) {
    if (!this.elements.discoveredList) return;
    if (this.elements.discoveredCount) {
      this.elements.discoveredCount.innerText = `${peers.length}`;
    }

    const query = (this.currentSearchQuery || '').toLowerCase().trim();
    const filtered = query 
      ? peers.filter(p => (p.peer_id || '').toLowerCase().includes(query) || (p.name || '').toLowerCase().includes(query) || (p.ip || '').toLowerCase().includes(query))
      : peers;

    if (filtered.length === 0) {
      this.elements.discoveredList.innerHTML = `
        <div class="discovered-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <div>${query ? 'No matching LAN peers found.' : 'No other computers currently broadcasting on local network.'}</div>
        </div>`;
      return;
    }

    this.elements.discoveredList.innerHTML = '';
    filtered.forEach(peer => {
      const card = document.createElement('div');
      card.className = 'enterprise-device-card';
      const formattedId = peer.peer_id.length === 9 
        ? `${peer.peer_id.substring(0,3)} ${peer.peer_id.substring(3,6)} ${peer.peer_id.substring(6)}`
        : peer.peer_id;
      const devName = peer.name || (peer.type === 'win32' ? 'Windows Desktop' : 'LAN Workstation');
      const isApple = (devName.toLowerCase().includes('mac') || devName.toLowerCase().includes('apple'));

      card.innerHTML = `
        <div class="device-card-top">
          <div class="device-os-icon">
            ${isApple 
              ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.91.04-2.04.61-2.69 1.37-.58.67-.99 1.74-.93 2.79 1.02.08 2-.54 2.61-1.29z"/></svg>`
              : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4h-13.051M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.802"/></svg>`
            }
          </div>
          <div class="device-details-col">
            <div class="device-name-row">
              <span class="device-name-text" title="${devName}">${devName}</span>
              <span class="device-ping-pill">● Online</span>
            </div>
            <div class="device-id-text">${formattedId}</div>
          </div>
        </div>
        <div class="device-card-bottom-actions">
          <button type="button" class="btn-card-files" title="Browse Files">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span>Files</span>
          </button>
          <button type="button" class="btn-card-connect" title="Connect to this computer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Connect</span>
          </button>
        </div>
      `;

      card.querySelector('.btn-card-connect').addEventListener('click', (e) => {
        e.stopPropagation();
        this.elements.remoteIdInput.value = formattedId;
        if (window.RemoteSession) {
          window.RemoteSession.initiateConnection(formattedId);
        }
      });

      card.querySelector('.btn-card-files').addEventListener('click', (e) => {
        e.stopPropagation();
        this.showToast(`File Transfer session to ${formattedId} initializing...`, 'info');
      });

      card.addEventListener('click', () => {
        this.elements.remoteIdInput.value = formattedId;
      });

      this.elements.discoveredList.appendChild(card);
    });
  },

  // --- SQLite Connection History ---
  async fetchHistory() {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) return;
      const data = await res.json();
      const history = data.history || [];
      this.cachedHistory = history;
      this.renderHistory(history);
    } catch (e) {
      console.warn('Error fetching connection history:', e);
    }
  },

  formatRelativeTime(timestamp) {
    if (!timestamp) return 'Recently';
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString();
  },

  renderHistory(items) {
    if (!this.elements.historyList) return;
    if (this.elements.historyCount) {
      this.elements.historyCount.innerText = `${items.length}`;
    }

    const query = (this.currentSearchQuery || '').toLowerCase().trim();
    const filtered = query 
      ? items.filter(i => (i.remote_id || '').toLowerCase().includes(query) || (i.alias || '').toLowerCase().includes(query) || (i.remote_ip || '').toLowerCase().includes(query))
      : items;

    if (filtered.length === 0) {
      this.elements.historyList.innerHTML = `
        <div class="discovered-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <div>${query ? 'No matching previous sessions found.' : 'No previous sessions recorded. Connect to a remote computer to save it here.'}</div>
        </div>`;
      return;
    }

    this.elements.historyList.innerHTML = '';
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'enterprise-device-card';
      const formattedId = item.remote_id.length === 9 
        ? `${item.remote_id.substring(0,3)} ${item.remote_id.substring(3,6)} ${item.remote_id.substring(6)}`
        : item.remote_id;
      const timeStr = this.formatRelativeTime(item.connected_at);
      const displayName = item.alias || `Desktop ${formattedId.substring(0, 7)}`;
      const isApple = displayName.toLowerCase().includes('mac') || displayName.toLowerCase().includes('apple');

      card.innerHTML = `
        <div class="device-card-top">
          <div class="device-os-icon" style="background: rgba(239, 68, 68, 0.12); color: #f87171;">
            ${isApple 
              ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.91.04-2.04.61-2.69 1.37-.58.67-.99 1.74-.93 2.79 1.02.08 2-.54 2.61-1.29z"/></svg>`
              : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4h-13.051M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.802"/></svg>`
            }
          </div>
          <div class="device-details-col">
            <div class="device-name-row">
              <span class="device-name-text" title="${displayName}">${displayName}</span>
              <span class="device-ping-pill">${timeStr}</span>
            </div>
            <div class="device-id-text">${formattedId}</div>
          </div>
        </div>
        <div class="device-card-bottom-actions">
          <button type="button" class="btn-card-delete" title="Remove from History">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>Delete</span>
          </button>
          <button type="button" class="btn-card-connect" title="Connect to this session">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Connect</span>
          </button>
        </div>
      `;

      card.querySelector('.btn-card-connect').addEventListener('click', (e) => {
        e.stopPropagation();
        this.elements.remoteIdInput.value = formattedId;
        if (window.RemoteSession) {
          window.RemoteSession.initiateConnection(formattedId);
        }
      });

      card.querySelector('.btn-card-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await fetch(`/api/history/${item.id}`, { method: 'DELETE' });
          this.fetchHistory();
          this.showToast('Removed device from history', 'info');
        } catch (delErr) {
          console.warn('Error deleting history item:', delErr);
        }
      });

      card.addEventListener('click', () => {
        this.elements.remoteIdInput.value = formattedId;
      });

      this.elements.historyList.appendChild(card);
    });
  },

  // --- Incoming Requests Polling ---
  startHostPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.pollIncomingRequests();
    }, 1500);
  },

  async pollIncomingRequests() {
    try {
      const res = await fetch('/api/connect-requests');
      if (!res.ok) return;

      const data = await res.json();
      const requests = data.requests || [];

      if (requests.length > 0) {
        const latest = requests[0];
        if (this.currentPendingRequestId !== latest.request_id) {
          this.currentPendingRequestId = latest.request_id;
          if (this.isAutoAcceptEnabled) {
            console.log('[AutoAccept] Auto-accepting incoming session request:', latest.request_id);
            this.respondToIncoming('accept');
          } else {
            this.showIncomingModal(latest.peer_id, latest.client_ip);
          }
        }
      } else {
        if (this.currentPendingRequestId && this.elements.incomingModal.style.display === 'flex') {
          this.closeIncomingModal();
        }
      }
    } catch (e) {
      console.warn('Error polling incoming requests:', e);
    }
  },

  showIncomingModal(remoteId, clientIp) {
    if (this.elements.incomingPeerId) {
      const ipStr = clientIp ? ` (${clientIp})` : '';
      this.elements.incomingPeerId.innerText = `${remoteId}${ipStr}`;
    }
    this.elements.incomingModal.style.display = 'flex';
    this.playNotificationSound();
  },

  closeIncomingModal() {
    this.elements.incomingModal.style.display = 'none';
    this.currentPendingRequestId = null;
  },

  async respondToIncoming(action) {
    if (!this.currentPendingRequestId) return;

    try {
      const res = await fetch('/api/connect-request/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: this.currentPendingRequestId,
          action: action,
          allow_mouse: this.elements.permMouse ? this.elements.permMouse.checked : true,
          allow_keyboard: this.elements.permKeyboard ? this.elements.permKeyboard.checked : true
        })
      });

      const data = await res.json();
      if (data.success) {
        if (action === 'accept') {
          this.showToast('Remote desktop session authorized (Full Control)!', 'success');
        } else {
          this.showToast('Remote request declined.', 'info');
        }
      }
    } catch (e) {
      this.showToast(`Response error: ${e.message}`, 'error');
    } finally {
      this.closeIncomingModal();
    }
  },

  showWaitingModal(targetId, onCancel) {
    if (this.elements.waitingTargetId) {
      this.elements.waitingTargetId.innerText = targetId;
    }
    this.elements.waitingModal.style.display = 'flex';
    this._cancelWaitingHandler = onCancel;
  },

  closeWaitingModal() {
    this.elements.waitingModal.style.display = 'none';
    this._cancelWaitingHandler = null;
  },

  async fetchHostInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const data = await res.json();
        this.elements.hostPeerId.innerText = data.peer_id || '--- --- ---';
        if (this.elements.permMouse) this.elements.permMouse.checked = data.allow_mouse ?? true;
        if (this.elements.permKeyboard) this.elements.permKeyboard.checked = data.allow_keyboard ?? true;
        if (this.elements.activeViewersCount) {
          const sessions = data.active_sessions || 0;
          this.elements.activeViewersCount.innerText = `${sessions} Active Remote Viewer${sessions === 1 ? '' : 's'}`;
        }
        if (data.pin) {
          this.currentPin = data.pin;
          this.updatePinDisplay();
        }
      }
    } catch (err) {
      console.warn('Could not fetch host info:', err);
    }
  },

  togglePinVisibility() {
    this.isPinVisible = !this.isPinVisible;
    this.updatePinDisplay();
  },

  updatePinDisplay() {
    if (!this.elements.hostPin) return;
    if (this.isPinVisible && this.currentPin) {
      this.elements.hostPin.innerText = this.currentPin;
    } else {
      this.elements.hostPin.innerText = '••••••';
    }
  },

  async refreshPin() {
    try {
      const res = await fetch('/api/refresh-pin', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.pin) {
          this.currentPin = data.pin;
          this.updatePinDisplay();
          this.showToast('Security PIN regenerated successfully', 'success');
          return;
        }
      }
    } catch (e) {
      console.warn('Backend refresh-pin error, fallback to local generation:', e);
    }
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    this.currentPin = digits;
    this.updatePinDisplay();
    this.showToast('Security PIN regenerated successfully', 'success');
  },

  async updatePermissions() {
    try {
      await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allow_mouse: this.elements.permMouse ? this.elements.permMouse.checked : true,
          allow_keyboard: this.elements.permKeyboard ? this.elements.permKeyboard.checked : true
        })
      });
    } catch (err) {
      console.warn('Could not update host permissions:', err);
    }
    const m = this.elements.permMouse && this.elements.permMouse.checked;
    const k = this.elements.permKeyboard && this.elements.permKeyboard.checked;
    this.showToast(`Host permissions updated: Mouse ${m ? 'ON' : 'OFF'} • Keyboard ${k ? 'ON' : 'OFF'}`, 'success');
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  },

  renderModalLogs() {
    const list = document.getElementById('modal-logs-list');
    if (!list) return;
    if (!this.cachedHistory || this.cachedHistory.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 30px 10px;">
          No session history recorded yet.
        </div>`;
      return;
    }
    list.innerHTML = '';
    this.cachedHistory.forEach(item => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;';
      const formattedId = item.remote_id.length === 9 
        ? `${item.remote_id.substring(0,3)} ${item.remote_id.substring(3,6)} ${item.remote_id.substring(6)}`
        : item.remote_id;
      const relTime = this.formatRelativeTime(item.last_connected);
      row.innerHTML = `
        <div>
          <div style="font-weight: 600; color: #fff; font-family: 'Outfit', monospace;">${formattedId}</div>
          <div style="font-size: 0.78rem; color: var(--text-dim);">${item.alias || 'Remote Desk Workstation'} • ${relTime}</div>
        </div>
        <button type="button" class="btn-card-connect" style="padding: 5px 14px; font-size: 0.8rem;">Connect</button>
      `;
      row.querySelector('.btn-card-connect').addEventListener('click', () => {
        this.closeModal('logs-modal');
        this.elements.remoteIdInput.value = formattedId;
        if (window.RemoteSession) {
          window.RemoteSession.initiateConnection(formattedId);
        }
      });
      list.appendChild(row);
    });
  },

  async fetchAutostart() {
    try {
      const res = await fetch('/api/autostart');
      if (res.ok) {
        const data = await res.json();
        if (this.elements.settingAutostart) {
          this.elements.settingAutostart.checked = Boolean(data.enabled);
        }
      }
    } catch (e) {
      console.warn('Error fetching autostart status:', e);
    }
  },

  async updateAutostart(enabled) {
    try {
      const res = await fetch('/api/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled })
      });
      const data = await res.json();
      if (data.success) {
        if (enabled) {
          this.showToast('Auto-startup enabled: Vvc Remote will run silently in background on boot.', 'success');
        } else {
          this.showToast('Auto-startup disabled.', 'info');
        }
      } else {
        this.showToast(data.message || 'Could not update auto-startup setting', 'error');
        if (this.elements.settingAutostart) this.elements.settingAutostart.checked = !enabled;
      }
    } catch (e) {
      this.showToast(`Error updating auto-startup: ${e.message}`, 'error');
      if (this.elements.settingAutostart) this.elements.settingAutostart.checked = !enabled;
    }
  },

  async fetchAutoAccept() {
    try {
      const res = await fetch('/api/settings/auto-accept');
      if (res.ok) {
        const data = await res.json();
        this.isAutoAcceptEnabled = (data.enabled !== false);
        if (this.elements.settingAutoAccept) {
          this.elements.settingAutoAccept.checked = this.isAutoAcceptEnabled;
        }
        this.updateAccessModeBadge(this.isAutoAcceptEnabled);
      }
    } catch (e) {
      console.warn('Error fetching auto-accept status:', e);
    }
  },

  async updateAutoAccept(enabled) {
    this.isAutoAcceptEnabled = enabled;
    this.updateAccessModeBadge(enabled);
    try {
      const res = await fetch('/api/settings/auto-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(enabled ? 'Auto-Accept enabled: Incoming sessions connect automatically.' : 'Auto-Accept disabled: Manual approval required.', 'success');
      }
    } catch (e) {
      console.warn('Error updating auto-accept:', e);
    }
  },

  updateAccessModeBadge(enabled) {
    if (this.elements.accessModeText) {
      this.elements.accessModeText.innerText = enabled
        ? 'Auto-Accept / Unattended (បើកទទួលស្វ័យប្រវត្តិ)'
        : 'One-Click Approval (ទទួលដោយបញ្ជាក់)';
    }
  },

  bindEvents() {
    // Copy Address Button
    if (this.elements.btnCopyId) {
      this.elements.btnCopyId.addEventListener('click', () => {
        const id = this.elements.hostPeerId.innerText.replace(/\s+/g, '');
        if (id && id !== '---------') {
          navigator.clipboard.writeText(id).then(() => {
            this.showToast('Your address copied to clipboard!', 'success');
            const span = this.elements.btnCopyId.querySelector('span');
            if (span) {
              const originalText = span.innerText;
              span.innerText = 'Copied!';
              setTimeout(() => { span.innerText = originalText; }, 1800);
            }
          }).catch(() => {
            this.showToast(`Address: ${id}`, 'info');
          });
        }
      });
    }

    // Paste Address Button
    if (this.elements.btnPasteId) {
      this.elements.btnPasteId.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            this.elements.remoteIdInput.value = text.trim();
            this.showToast('Pasted address from clipboard', 'info');
            this.elements.remoteIdInput.focus();
          }
        } catch (err) {
          this.showToast('Clipboard access denied. Press Ctrl+V to paste.', 'info');
        }
      });
    }

    // PIN visibility and refresh
    if (this.elements.btnTogglePinVisibility) {
      this.elements.btnTogglePinVisibility.addEventListener('click', () => this.togglePinVisibility());
    }
    if (this.elements.btnRefreshPin) {
      this.elements.btnRefreshPin.addEventListener('click', () => this.refreshPin());
    }

    // Cancel Waiting Connection Request
    if (this.elements.btnCancelWaiting) {
      this.elements.btnCancelWaiting.addEventListener('click', () => {
        if (this._cancelWaitingHandler) {
          this._cancelWaitingHandler();
        }
        this.closeWaitingModal();
      });
    }

    // Peer Tabs Toggle
    if (this.elements.tabBtnHistory && this.elements.tabBtnDiscovered) {
      this.elements.tabBtnHistory.addEventListener('click', () => {
        this.elements.tabBtnHistory.classList.add('active');
        this.elements.tabBtnDiscovered.classList.remove('active');
        this.elements.tabContentHistory.classList.add('active');
        this.elements.tabContentDiscovered.classList.remove('active');
      });

      this.elements.tabBtnDiscovered.addEventListener('click', () => {
        this.elements.tabBtnDiscovered.classList.add('active');
        this.elements.tabBtnHistory.classList.remove('active');
        this.elements.tabContentDiscovered.classList.add('active');
        this.elements.tabContentHistory.classList.remove('active');
      });
    }

    // Clear All History Button
    if (this.elements.btnClearHistory) {
      this.elements.btnClearHistory.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear all connection history?')) return;
        try {
          await fetch('/api/history', { method: 'DELETE' });
          this.fetchHistory();
          this.showToast('Connection history cleared', 'info');
        } catch (e) {
          this.showToast('Failed to clear history', 'error');
        }
      });
    }

    // Search / Filter Input
    if (this.elements.deviceSearchInput) {
      this.elements.deviceSearchInput.addEventListener('input', (e) => {
        this.currentSearchQuery = e.target.value;
        this.renderHistory(this.cachedHistory);
        this.renderDiscoveredPeers(this.cachedPeers);
      });
    }

    // Modal Close Buttons (data-close attributes)
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Close modal on background click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && overlay.id !== 'incoming-request-modal' && overlay.id !== 'waiting-modal') {
          overlay.style.display = 'none';
        }
      });
    });

    // Close modal on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ['settings-modal', 'diagnostics-modal', 'logs-modal', 'file-transfer-modal'].forEach(id => this.closeModal(id));
      }
    });

    // Left Sidebar Navigation Items
    const navRemote = document.getElementById('nav-item-remote');
    const navAddressBook = document.getElementById('nav-item-addressbook');
    const navFileTransfer = document.getElementById('nav-item-filetransfer');
    const navLogs = document.getElementById('nav-item-logs');
    const navRecording = document.getElementById('nav-item-recording');
    const navDiagnostics = document.getElementById('nav-item-diagnostics');
    const navSettings = document.getElementById('nav-item-settings');

    const setActiveNav = (activeEl) => {
      document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
      if (activeEl) activeEl.classList.add('active');
    };

    if (navRemote) {
      navRemote.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNav(navRemote);
        ['settings-modal', 'diagnostics-modal', 'logs-modal', 'file-transfer-modal'].forEach(id => this.closeModal(id));
      });
    }

    if (navAddressBook) {
      navAddressBook.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNav(navAddressBook);
        ['settings-modal', 'diagnostics-modal', 'logs-modal', 'file-transfer-modal'].forEach(id => this.closeModal(id));
        if (this.elements.tabBtnHistory) this.elements.tabBtnHistory.click();
        if (this.elements.deviceSearchInput) {
          this.elements.deviceSearchInput.focus();
          this.elements.deviceSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        this.showToast('Address Book: Filter and manage recent devices.', 'info');
      });
    }

    if (navFileTransfer) {
      navFileTransfer.addEventListener('click', (e) => {
        e.preventDefault();
        this.initFileExplorer();
      });
    }

    if (navLogs) {
      navLogs.addEventListener('click', (e) => {
        e.preventDefault();
        this.renderModalLogs();
        this.openModal('logs-modal');
      });
    }

    let isScreenRecording = false;
    if (navRecording) {
      navRecording.addEventListener('click', (e) => {
        e.preventDefault();
        isScreenRecording = !isScreenRecording;
        if (isScreenRecording) {
          this.showToast('Screen Recording started: Capturing session to Videos/VvcRemote', 'success');
          navRecording.style.color = '#ef4444';
        } else {
          this.showToast('Screen Recording saved successfully to Videos/VvcRemote', 'info');
          navRecording.style.color = '';
        }
      });
    }

    if (navDiagnostics) {
      navDiagnostics.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal('diagnostics-modal');
      });
    }

    if (navSettings) {
      navSettings.addEventListener('click', (e) => {
        e.preventDefault();
        const autoAcceptCheck = document.getElementById('setting-modal-auto-accept');
        const autostartCheck = document.getElementById('setting-modal-autostart');
        if (autoAcceptCheck && this.elements.settingAutoAccept) {
          autoAcceptCheck.checked = this.elements.settingAutoAccept.checked;
        }
        if (autostartCheck && this.elements.settingAutostart) {
          autostartCheck.checked = this.elements.settingAutostart.checked;
        }
        this.openModal('settings-modal');
      });
    }

    // Save Settings Button
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        const autoAcceptCheck = document.getElementById('setting-modal-auto-accept');
        const autostartCheck = document.getElementById('setting-modal-autostart');
        if (autoAcceptCheck && this.elements.settingAutoAccept) {
          this.elements.settingAutoAccept.checked = autoAcceptCheck.checked;
          this.updateAutoAccept(autoAcceptCheck.checked);
        }
        if (autostartCheck && this.elements.settingAutostart) {
          this.elements.settingAutostart.checked = autostartCheck.checked;
          this.updateAutostart(autostartCheck.checked);
        }
        this.closeModal('settings-modal');
        this.showToast('Application settings saved successfully', 'success');
      });
    }

    // Run Diagnostics Speed Test Button
    const btnRunDiag = document.getElementById('btn-run-diag-test');
    if (btnRunDiag) {
      btnRunDiag.addEventListener('click', async () => {
        const diagText = document.getElementById('diag-latency-text');
        if (diagText) diagText.innerText = 'Testing direct latency...';
        const start = performance.now();
        try {
          await fetch('/api/info');
          const elapsed = Math.round(performance.now() - start);
          if (diagText) diagText.innerText = `${elapsed} ms (Direct RTT)`;
          if (this.elements.statusLatencyVal) this.elements.statusLatencyVal.innerText = `${elapsed} ms`;
          if (this.elements.headerQuickLatency) this.elements.headerQuickLatency.innerText = `${elapsed}ms`;
          this.showToast(`Speed Test: Latency is ${elapsed} ms • Direct P2P optimal`, 'success');
        } catch (err) {
          if (diagText) diagText.innerText = 'Offline';
        }
      });
    }

    // Clear Logs in Modal
    const btnClearLogsModal = document.getElementById('btn-clear-logs-modal');
    if (btnClearLogsModal) {
      btnClearLogsModal.addEventListener('click', async () => {
        if (!confirm('Clear all connection history?')) return;
        try {
          await fetch('/api/history', { method: 'DELETE' });
          this.cachedHistory = [];
          this.renderHistory([]);
          this.renderModalLogs();
          this.showToast('Session history cleared', 'info');
        } catch (e) {
          this.showToast('Failed to clear history', 'error');
        }
      });
    }

    // Remote File Explorer Action Listeners
    if (this.elements.feBtnUpload && this.elements.feUploadInput) {
      this.elements.feBtnUpload.addEventListener('click', () => {
        this.elements.feUploadInput.click();
      });
      this.elements.feUploadInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.uploadSelectedFiles(e.target.files);
          e.target.value = '';
        }
      });
    }

    if (this.elements.feBtnUp) {
      this.elements.feBtnUp.addEventListener('click', () => {
        if (this.parentRemotePath) {
          this.loadRemotePath(this.parentRemotePath);
        }
      });
    }

    if (this.elements.feBtnGo && this.elements.feCurrentPath) {
      this.elements.feBtnGo.addEventListener('click', () => {
        this.loadRemotePath(this.elements.feCurrentPath.value.trim());
      });
      this.elements.feCurrentPath.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.loadRemotePath(this.elements.feCurrentPath.value.trim());
        }
      });
    }

    if (this.elements.feBtnRefresh) {
      this.elements.feBtnRefresh.addEventListener('click', () => {
        this.loadRemotePath(this.currentRemotePath);
      });
    }

    if (this.elements.feBtnNewFolder) {
      this.elements.feBtnNewFolder.addEventListener('click', () => {
        this.promptCreateFolder();
      });
    }

    // Active Session Background Dock & Toolbar Navigation Listeners
    if (this.elements.btnSessionHome) {
      this.elements.btnSessionHome.addEventListener('click', () => {
        this.returnToHomeWithoutDisconnect();
      });
    }

    if (this.elements.btnSessionFiles) {
      this.elements.btnSessionFiles.addEventListener('click', () => {
        this.initFileExplorer();
      });
    }

    if (this.elements.btnSessionUnlock) {
      this.elements.btnSessionUnlock.addEventListener('click', () => {
        if (window.RemoteSession) {
          window.RemoteSession.unlockRemoteScreen();
        }
      });
    }

    if (this.elements.tabNavDashboard) {
      this.elements.tabNavDashboard.addEventListener('click', () => {
        if (window.RemoteSession) {
          window.RemoteSession.switchSession('dashboard');
        }
      });
    }

    if (this.elements.btnTabNewConnection) {
      this.elements.btnTabNewConnection.addEventListener('click', () => {
        if (window.RemoteSession) {
          window.RemoteSession.switchSession('dashboard');
        }
        if (this.elements.remoteIdInput) {
          this.elements.remoteIdInput.focus();
        }
      });
    }

    if (this.elements.btnDockReturn) {
      this.elements.btnDockReturn.addEventListener('click', () => {
        this.returnToScreenFromDock();
      });
    }

    if (this.elements.btnDockFiles) {
      this.elements.btnDockFiles.addEventListener('click', () => {
        this.initFileExplorer();
      });
    }

    if (this.elements.btnDockDisconnect) {
      this.elements.btnDockDisconnect.addEventListener('click', () => {
        if (window.RemoteSession) {
          window.RemoteSession.disconnect();
        }
        this.closeSessionViewport();
      });
    }

    // Permission switches
    if (this.elements.permMouse) {
      this.elements.permMouse.addEventListener('change', () => this.updatePermissions());
    }
    if (this.elements.permKeyboard) {
      this.elements.permKeyboard.addEventListener('change', () => this.updatePermissions());
    }
    if (this.elements.permClipboard) {
      this.elements.permClipboard.addEventListener('change', (e) => {
        this.showToast(e.target.checked ? 'Clipboard synchronization enabled.' : 'Clipboard synchronization disabled.', 'info');
      });
    }
    if (this.elements.permFileTransfer) {
      this.elements.permFileTransfer.addEventListener('change', (e) => {
        this.showToast(e.target.checked ? 'P2P File Transfer enabled.' : 'P2P File Transfer disabled.', 'info');
      });
    }
    if (this.elements.settingAutoAccept) {
      this.elements.settingAutoAccept.addEventListener('change', (e) => {
        this.updateAutoAccept(e.target.checked);
      });
    }
    if (this.elements.settingAutostart) {
      this.elements.settingAutostart.addEventListener('change', (e) => {
        this.updateAutostart(e.target.checked);
      });
    }

    // Format Remote ID input: auto-format 9-digit addresses
    if (this.elements.remoteIdInput) {
      this.elements.remoteIdInput.addEventListener('input', (e) => {
        let val = e.target.value;
        if (/^[\d\s]*$/.test(val)) {
          let digits = val.replace(/\D/g, '').substring(0, 9);
          if (digits.length > 6) {
            val = `${digits.substring(0, 3)} ${digits.substring(3, 6)} ${digits.substring(6)}`;
          } else if (digits.length > 3) {
            val = `${digits.substring(0, 3)} ${digits.substring(3)}`;
          } else {
            val = digits;
          }
          e.target.value = val;
        }
      });
    }

    // Host modal Accept & Decline buttons
    if (this.elements.btnAcceptRequest) {
      this.elements.btnAcceptRequest.addEventListener('click', () => this.respondToIncoming('accept'));
    }
    if (this.elements.btnRejectRequest) {
      this.elements.btnRejectRequest.addEventListener('click', () => this.respondToIncoming('reject'));
    }

    // Collapse / Expand Toolbar toggle
    if (this.elements.btnToggleToolbar) {
      this.elements.btnToggleToolbar.addEventListener('click', () => {
        const tb = this.elements.sessionToolbar;
        tb.classList.toggle('collapsed');
        this.elements.btnToggleToolbar.innerText = tb.classList.contains('collapsed') ? '▼' : '▲';
      });
    }

    // View Mode (Fit Window vs 1:1 Scale)
    if (this.elements.btnViewMode) {
      this.elements.btnViewMode.addEventListener('click', () => {
        this.isOriginalScale = !this.isOriginalScale;
        if (this.elements.displayContainer) {
          this.elements.displayContainer.classList.toggle('mode-original', this.isOriginalScale);
        }
        if (this.elements.viewModeText) {
          this.elements.viewModeText.innerText = this.isOriginalScale ? '100% Original' : 'Fit Window';
        }
        this.showToast(this.isOriginalScale ? 'Display set to 100% Original (1:1)' : 'Display set to Fit Window', 'info');
      });
    }

    // Fullscreen toggle
    if (this.elements.btnFullscreen) {
      this.elements.btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          this.elements.sessionViewport.requestFullscreen().catch(err => {
            this.showToast(`Fullscreen error: ${err.message}`, 'error');
          });
        } else {
          document.exitFullscreen();
        }
      });
    }

    // Send Ctrl+Alt+Del trigger
    if (this.elements.btnSendCad) {
      this.elements.btnSendCad.addEventListener('click', () => {
        if (window.RemoteSession && window.RemoteSession.sendInput) {
          window.RemoteSession.sendInput({
            type: 'special_key',
            action: 'CAD'
          });
          this.showToast('Sent Ctrl+Alt+Del to host', 'info');
        }
      });
    }

    // Send Windows Key trigger
    if (this.elements.btnSendWin) {
      this.elements.btnSendWin.addEventListener('click', () => {
        if (window.RemoteSession && window.RemoteSession.sendInput) {
          window.RemoteSession.sendInput({
            type: 'keydown',
            code: 'MetaLeft',
            key: 'Meta'
          });
          setTimeout(() => {
            window.RemoteSession.sendInput({
              type: 'keyup',
              code: 'MetaLeft',
              key: 'Meta'
            });
          }, 100);
          this.showToast('Sent Windows Key to host', 'info');
        }
      });
    }

    // Disconnect button
    if (this.elements.btnDisconnect) {
      this.elements.btnDisconnect.addEventListener('click', () => {
        if (window.RemoteSession) {
          window.RemoteSession.disconnect();
        }
        this.closeSessionViewport();
      });
    }
  },

  showDashboardView() {
    if (this.elements.sessionViewport) this.elements.sessionViewport.style.display = 'none';
    if (this.elements.dashboardView) this.elements.dashboardView.style.display = 'block';
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  },

  openSessionViewport(peerId) {
    this.activeSessionPeerId = peerId;
    if (this.elements.toolbarPeerId) this.elements.toolbarPeerId.innerText = peerId;
    if (this.elements.sessionViewport) this.elements.sessionViewport.style.display = 'flex';
    if (this.elements.dashboardView) this.elements.dashboardView.style.display = 'none';
    if (this.elements.activeSessionDock) this.elements.activeSessionDock.style.display = 'none';
  },

  renderSessionTabs(activePeerId) {
    if (this.elements.tabNavDashboard) {
      this.elements.tabNavDashboard.classList.toggle('active', !activePeerId);
    }

    if (!this.elements.sessionTabsList) return;
    this.elements.sessionTabsList.innerHTML = '';

    const sessions = window.RemoteSession ? window.RemoteSession.getAllSessions() : [];
    sessions.forEach(sess => {
      const tab = document.createElement('div');
      const isActive = (sess.peerId === activePeerId);
      tab.className = `session-tab-item ${isActive ? 'active' : ''}`;
      tab.setAttribute('data-peer-id', sess.peerId);
      tab.title = `Switch to ${sess.peerId}`;
      tab.innerHTML = `
        <span class="tab-dot-online"></span>
        <span>${sess.peerId}</span>
        <button type="button" class="btn-tab-close" title="Disconnect ${sess.peerId}">&times;</button>
      `;

      tab.addEventListener('click', (e) => {
        if (e.target.closest('.btn-tab-close')) return;
        window.RemoteSession.switchSession(sess.peerId);
      });

      const btnClose = tab.querySelector('.btn-tab-close');
      if (btnClose) {
        btnClose.addEventListener('click', (e) => {
          e.stopPropagation();
          window.RemoteSession.closeSession(sess.peerId);
        });
      }

      this.elements.sessionTabsList.appendChild(tab);
    });
  },

  renderActiveSessionDock(sessions) {
    if (!this.elements.activeSessionDock) return;
    if (!sessions || sessions.length === 0) {
      this.elements.activeSessionDock.style.display = 'none';
      return;
    }

    this.elements.activeSessionDock.style.display = 'flex';
    if (sessions.length === 1) {
      const sess = sessions[0];
      if (this.elements.dockPeerId) this.elements.dockPeerId.innerText = sess.peerId;
    } else {
      if (this.elements.dockPeerId) this.elements.dockPeerId.innerText = `${sessions.length} Devices Connected`;
    }
  },

  returnToHomeWithoutDisconnect() {
    if (window.RemoteSession) {
      window.RemoteSession.switchSession('dashboard');
    } else {
      this.showDashboardView();
    }
    this.showToast('Session running in background. You can browse files or switch devices.', 'info');
  },

  returnToScreenFromDock() {
    const sessions = window.RemoteSession ? window.RemoteSession.getAllSessions() : [];
    if (sessions.length > 0) {
      window.RemoteSession.switchSession(sessions[0].peerId);
    }
  },

  closeSessionViewport() {
    this.activeSessionPeerId = null;
    if (this.elements.sessionViewport) this.elements.sessionViewport.style.display = 'none';
    if (this.elements.activeSessionDock) this.elements.activeSessionDock.style.display = 'none';
    if (this.elements.dashboardView) this.elements.dashboardView.style.display = 'block';
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  },

  // --- Remote File Explorer Methods ---
  getFileApiContext() {
    const session = window.RemoteSession?.getActiveSession();
    if (session) {
      return {
        baseUrl: session.targetBaseUrl || '',
        sessionId: session.sessionId || ''
      };
    }
    return {
      baseUrl: '',
      sessionId: ''
    };
  },

  async initFileExplorer() {
    this.openModal('file-transfer-modal');
    await this.fetchRemoteDrives();
  },

  async fetchRemoteDrives() {
    try {
      const ctx = this.getFileApiContext();
      const q = ctx.sessionId ? `?session_id=${encodeURIComponent(ctx.sessionId)}` : '';
      const res = await fetch(`${ctx.baseUrl}/api/files/drives${q}`);
      if (!res.ok) throw new Error('Failed to load remote drives');
      const data = await res.json();

      // Render quick drive and shortcut buttons
      if (this.elements.feDrivesList) {
        this.elements.feDrivesList.innerHTML = '';

        // Physical drives (C:\, D:\, etc.)
        (data.drives || []).forEach(drive => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fe-drive-btn';
          btn.innerHTML = `<span style="font-size: 0.95rem;">💾</span> <span>${drive.name}</span>`;
          btn.title = drive.label;
          btn.addEventListener('click', () => this.loadRemotePath(drive.path));
          this.elements.feDrivesList.appendChild(btn);
        });

        // Quick user shortcuts
        (data.shortcuts || []).forEach(sc => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fe-drive-btn';
          const icon = sc.name === 'Desktop' ? '🖥️' : sc.name === 'Downloads' ? '📥' : '📁';
          btn.innerHTML = `<span>${icon}</span> <span>${sc.name}</span>`;
          btn.title = sc.path;
          btn.addEventListener('click', () => this.loadRemotePath(sc.path));
          this.elements.feDrivesList.appendChild(btn);
        });
      }

      const initialPath = this.currentRemotePath || data.default_path || 'C:\\';
      await this.loadRemotePath(initialPath);
    } catch (err) {
      this.showToast(`Error reading drives: ${err.message}`, 'error');
    }
  },

  async loadRemotePath(path) {
    if (!path) return;
    this.currentRemotePath = path;
    if (this.elements.feCurrentPath) {
      this.elements.feCurrentPath.value = path;
    }

    if (this.elements.feFilesList) {
      this.elements.feFilesList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 40px 10px;">
          <div style="display: inline-block; width: 22px; height: 22px; border: 2px solid #ef4444; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 8px;"></div>
          <div>Loading files from ${path}...</div>
        </div>`;
    }

    try {
      const ctx = this.getFileApiContext();
      const q = ctx.sessionId ? `&session_id=${encodeURIComponent(ctx.sessionId)}` : '';
      const res = await fetch(`${ctx.baseUrl}/api/files/list?path=${encodeURIComponent(path)}${q}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Failed to access directory' }));
        throw new Error(errData.detail || 'Access error');
      }

      const data = await res.json();
      this.parentRemotePath = data.parent_path;
      if (this.elements.feBtnUp) {
        this.elements.feBtnUp.disabled = !data.parent_path;
        this.elements.feBtnUp.style.opacity = data.parent_path ? '1' : '0.4';
      }

      this.renderRemoteFileList(data.items || []);
    } catch (err) {
      if (this.elements.feFilesList) {
        this.elements.feFilesList.innerHTML = `
          <div style="text-align: center; color: #fca5a5; padding: 40px 10px;">
            <div style="font-size: 1.6rem; margin-bottom: 6px;">⚠️</div>
            <div>${err.message}</div>
          </div>`;
      }
      this.showToast(`Cannot access path: ${err.message}`, 'error');
    }
  },

  renderRemoteFileList(items) {
    if (!this.elements.feFilesList) return;
    if (items.length === 0) {
      this.elements.feFilesList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 40px 10px;">
          This directory is empty.
        </div>`;
      return;
    }

    this.elements.feFilesList.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'fe-file-row';
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background 0.15s;';

      row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.04)');
      row.addEventListener('mouseleave', () => row.style.background = 'transparent');

      const icon = item.is_dir ? '📁' : this.getFileIcon(item.name);
      const sizeStr = item.is_dir ? '---' : this.formatFileSize(item.size);
      const dateStr = item.modified ? new Date(item.modified * 1000).toLocaleDateString() : '';

      row.innerHTML = `
        <div style="flex: 2; display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span style="font-size: 1.1rem;">${icon}</span>
          <span style="color: ${item.is_dir ? '#93c5fd' : '#f8fafc'}; font-size: 0.86rem; font-weight: ${item.is_dir ? '600' : '400'}; overflow: hidden; text-overflow: ellipsis;">${item.name}</span>
        </div>
        <div style="flex: 1; text-align: right; color: var(--text-dim); font-size: 0.8rem; font-family: monospace;">${sizeStr}</div>
        <div style="flex: 1; text-align: right; color: var(--text-dim); font-size: 0.8rem;">${dateStr}</div>
        <div style="width: 100px; text-align: right; display: flex; justify-content: flex-end; gap: 6px;">
          ${!item.is_dir ? `<button type="button" class="btn-fe-download" title="Download File to Computer" style="background: rgba(59,130,246,0.18); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); border-radius: 4px; padding: 3px 8px; font-size: 0.76rem; cursor: pointer;">⬇ Download</button>` : ''}
          <button type="button" class="btn-fe-delete" title="Delete" style="background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); border-radius: 4px; padding: 3px 7px; font-size: 0.76rem; cursor: pointer;">🗑</button>
        </div>
      `;

      // Navigate into directory
      if (item.is_dir) {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.btn-fe-delete')) return;
          this.loadRemotePath(item.path);
        });
      }

      // Download file to local machine
      const btnDownload = row.querySelector('.btn-fe-download');
      if (btnDownload) {
        btnDownload.addEventListener('click', (e) => {
          e.stopPropagation();
          const ctx = this.getFileApiContext();
          const q = ctx.sessionId ? `&session_id=${encodeURIComponent(ctx.sessionId)}` : '';
          const downloadUrl = `${ctx.baseUrl}/api/files/download?path=${encodeURIComponent(item.path)}${q}`;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = item.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          this.showToast(`Downloading: ${item.name}`, 'info');
        });
      }

      // Delete item
      const btnDelete = row.querySelector('.btn-fe-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', async (e) => {
          e.stopPropagation();
          const itemType = item.is_dir ? 'folder and all its contents' : 'file';
          if (!confirm(`Are you sure you want to delete this ${itemType}?\n\n${item.name}`)) return;
          try {
            const ctx = this.getFileApiContext();
            const delRes = await fetch(`${ctx.baseUrl}/api/files/delete`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path: item.path,
                session_id: ctx.sessionId || undefined
              })
            });
            if (!delRes.ok) {
              const err = await delRes.json();
              throw new Error(err.detail || 'Delete failed');
            }
            this.showToast(`Deleted ${item.name}`, 'info');
            this.loadRemotePath(this.currentRemotePath);
          } catch (err) {
            this.showToast(`Delete error: ${err.message}`, 'error');
          }
        });
      }

      this.elements.feFilesList.appendChild(row);
    });
  },

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['exe', 'msi', 'bat', 'cmd'].includes(ext)) return '⚙️';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return '🖼️';
    if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) return '🎵';
    if (['pdf'].includes(ext)) return '📕';
    if (['txt', 'log', 'md'].includes(ext)) return '📝';
    if (['doc', 'docx'].includes(ext)) return '📄';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['py', 'js', 'html', 'css', 'json', 'cpp', 'c', 'cs'].includes(ext)) return '💻';
    return '📄';
  },

  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  async uploadSelectedFiles(files) {
    if (!files || files.length === 0) return;
    if (!this.currentRemotePath) {
      this.showToast('Please select a destination folder first', 'error');
      return;
    }

    this.showToast(`Uploading ${files.length} file(s) to ${this.currentRemotePath}...`, 'info');
    let successCount = 0;
    const ctx = this.getFileApiContext();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('path', this.currentRemotePath);
      if (ctx.sessionId) formData.append('session_id', ctx.sessionId);
      formData.append('file', file);

      try {
        const res = await fetch(`${ctx.baseUrl}/api/files/upload`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          successCount++;
        } else {
          const err = await res.json();
          this.showToast(`Failed to upload ${file.name}: ${err.detail || 'Error'}`, 'error');
        }
      } catch (err) {
        this.showToast(`Network error uploading ${file.name}: ${err.message}`, 'error');
      }
    }

    if (successCount > 0) {
      this.showToast(`Successfully uploaded ${successCount} file(s)!`, 'success');
      this.loadRemotePath(this.currentRemotePath);
    }
  },

  async promptCreateFolder() {
    const folderName = prompt('Enter new folder name:');
    if (!folderName || !folderName.trim()) return;

    try {
      const ctx = this.getFileApiContext();
      const res = await fetch(`${ctx.baseUrl}/api/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.currentRemotePath,
          folder_name: folderName.trim(),
          session_id: ctx.sessionId || undefined
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Could not create folder');
      }
      this.showToast(`Created folder "${folderName.trim()}"`, 'success');
      this.loadRemotePath(this.currentRemotePath);
    } catch (err) {
      this.showToast(`Folder creation error: ${err.message}`, 'error');
    }
  },

  updateHUD({ protocol, latency, fps, resolution }) {
    if (protocol && this.elements.hudProtocol) this.elements.hudProtocol.innerText = protocol;
    if (latency !== undefined) {
      const latStr = `${Math.round(latency)} ms`;
      if (this.elements.hudLatency) this.elements.hudLatency.innerText = latStr;
      if (this.elements.statusLatencyVal) this.elements.statusLatencyVal.innerText = latStr;
      if (this.elements.headerQuickLatency) this.elements.headerQuickLatency.innerText = latStr;
    }
    if (fps !== undefined && this.elements.hudFps) this.elements.hudFps.innerText = fps;
    if (resolution && this.elements.hudRes) this.elements.hudRes.innerText = resolution;
    if (this.elements.statusCodecVal && (protocol || fps)) {
      this.elements.statusCodecVal.innerText = `${protocol || 'WebRTC'} • ${fps || 60} FPS Ultra-HD`;
    }
  }
};

window.addEventListener('DOMContentLoaded', () => UI.init());
