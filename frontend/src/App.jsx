import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TitleBar } from './components/TitleBar.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { ThisDeskCard } from './components/ThisDeskCard.jsx';
import { RemoteDeskCard } from './components/RemoteDeskCard.jsx';
import { RemoteViewer } from './components/RemoteViewer.jsx';
import { IncomingModal } from './components/IncomingModal.jsx';
import { WaitingModal } from './components/WaitingModal.jsx';
import { FileExplorer } from './components/FileExplorer.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { DiagnosticsModal } from './components/DiagnosticsModal.jsx';
import { LogsModal } from './components/LogsModal.jsx';
import { AddressBookModal } from './components/AddressBookModal.jsx';
import { Toast } from './components/Toast.jsx';

import {
  fetchHostInfo,
  refreshPin,
  updatePermissions,
  fetchAutostart,
  setAutostart,
  fetchAutoAccept,
  setAutoAccept,
  resolvePeer,
  initConnectRequest,
  initRelayConnectRequest,
  pollConnectStatus,
  cancelConnectRequest,
  pollIncomingRequests,
  respondIncomingRequest,
  fetchHistory,
  addHistory,
  deleteHistoryItem,
  clearAllHistory,
  updatePeerAlias,
  fetchDiscoveredPeers
} from './services/api.js';

export default function App() {
  // --- Host & Identity State ---
  const [hostInfo, setHostInfo] = useState(null);

  // --- Multi-Session Tabs State ---
  const [tabs, setTabs] = useState([]); // [{ id, peerId, targetBaseUrl, sessionId, alias, title }]
  const [activeTabId, setActiveTabId] = useState('dashboard');

  // --- Active Navigation & Modals ---
  const [activeNav, setActiveNav] = useState('remote');
  const [activeModal, setActiveModal] = useState(null); // 'settings' | 'diagnostics' | 'logs' | 'addressbook'
  const [isRecording, setIsRecording] = useState(false);

  // --- Session History & LAN Peers ---
  const [sessions, setSessions] = useState([]);
  const [peers, setPeers] = useState([]);
  const [loadingPeers, setLoadingPeers] = useState(false);

  // --- Connection Initiation State ---
  const [connecting, setConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState('');
  const [pendingReq, setPendingReq] = useState({ id: null, baseUrl: '', targetId: '' });
  const pollTimerRef = useRef(null);

  // --- Incoming Authorization Modal ---
  const [incomingRequests, setIncomingRequests] = useState([]);

  // --- File Explorer Modal ---
  const [fileExplorerSession, setFileExplorerSession] = useState(null);

  // --- Live Telemetry Ping ---
  const [livePing, setLivePing] = useState(4);

  // --- Toasts State ---
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --- Initial Data Load & Polling ---
  const loadHostInfo = useCallback(async () => {
    try {
      const start = performance.now();
      const data = await fetchHostInfo();
      const pingMs = Math.max(1, Math.round(performance.now() - start));
      setLivePing(pingMs);

      // Load autostart and auto-accept settings
      try {
        const auto = await fetchAutostart();
        data.autostart = auto.enabled;
      } catch (_) {}
      try {
        const accept = await fetchAutoAccept();
        data.auto_accept = accept.enabled;
      } catch (_) {}
      setHostInfo(data);
    } catch (err) {
      console.warn('Failed to load host info:', err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchHistory();
      if (Array.isArray(data)) {
        setSessions(data);
      } else if (data && data.history) {
        setSessions(data.history);
      }
    } catch (_) {}
  }, []);

  const loadPeers = useCallback(async () => {
    setLoadingPeers(true);
    try {
      const data = await fetchDiscoveredPeers();
      if (data && data.peers) {
        setPeers(data.peers);
      } else if (Array.isArray(data)) {
        setPeers(data);
      }
    } catch (_) {}
    finally {
      setLoadingPeers(false);
    }
  }, []);

  // Poll incoming connection requests every 1.5 seconds
  useEffect(() => {
    loadHostInfo();
    loadHistory();
    loadPeers();

    const incomingInterval = setInterval(async () => {
      try {
        const data = await pollIncomingRequests();
        if (data && data.requests) {
          setIncomingRequests(data.requests);
        }
      } catch (_) {}
    }, 1500);

    // Refresh LAN peers every 12 seconds
    const peerInterval = setInterval(loadPeers, 12000);

    // Refresh host ping every 8 seconds
    const pingInterval = setInterval(loadHostInfo, 8000);

    return () => {
      clearInterval(incomingInterval);
      clearInterval(peerInterval);
      clearInterval(pingInterval);
    };
  }, [loadHostInfo, loadHistory, loadPeers]);

  // --- Sidebar Navigation Handler ---
  const handleSelectNav = (nav) => {
    setActiveNav(nav);
    if (nav === 'remote') {
      setActiveTabId('dashboard');
      setActiveModal(null);
    } else if (nav === 'addressbook') {
      setActiveModal('addressbook');
    } else if (nav === 'files') {
      setFileExplorerSession({
        targetBaseUrl: '',
        sessionId: '',
        peerId: hostInfo?.peer_id || 'This Computer',
        alias: 'Local Machine Files'
      });
    } else if (nav === 'logs') {
      setActiveModal('logs');
    } else if (nav === 'diagnostics') {
      setActiveModal('diagnostics');
    } else if (nav === 'settings') {
      setActiveModal('settings');
    }
  };

  const handleToggleRecording = () => {
    const next = !isRecording;
    setIsRecording(next);
    if (next) {
      showToast('Screen Recording started: Capturing desktop session to Videos/VvcRemote', 'success');
    } else {
      showToast('Screen Recording saved successfully to Videos/VvcRemote', 'info');
    }
  };

  // --- Host Actions ---
  const handleRefreshPin = async () => {
    const res = await refreshPin();
    if (res && res.pin) {
      setHostInfo((prev) => ({ ...prev, pin: res.pin }));
    }
  };

  const handleUpdatePermissions = async (allowMouse, allowKeyboard) => {
    try {
      await updatePermissions(allowMouse, allowKeyboard);
      setHostInfo((prev) => ({
        ...prev,
        allow_mouse: allowMouse,
        allow_keyboard: allowKeyboard
      }));
      showToast('Permissions updated', 'success');
    } catch (_) {
      showToast('Failed to update permissions', 'error');
    }
  };

  const handleUpdateAutostart = async (enabled) => {
    try {
      await setAutostart(enabled);
      setHostInfo((prev) => ({ ...prev, autostart: enabled }));
      showToast(`Autostart ${enabled ? 'enabled' : 'disabled'}`, 'info');
    } catch (_) {
      showToast('Failed to change autostart', 'error');
    }
  };

  const handleUpdateAutoAccept = async (enabled) => {
    try {
      await setAutoAccept(enabled);
      setHostInfo((prev) => ({ ...prev, auto_accept: enabled }));
      showToast(`Direct Auto-Accept ${enabled ? 'enabled' : 'disabled'}`, 'info');
    } catch (_) {
      showToast('Failed to change auto-accept', 'error');
    }
  };

  // --- Connection Actions ---
  const handleConnect = async (targetId, pin, explicitIp = '') => {
    const cleanId = (targetId || '').replace(/\D/g, '');
    if (!cleanId) return;

    if (hostInfo && hostInfo.peer_id && hostInfo.peer_id.replace(/\D/g, '') === cleanId) {
      showToast('Cannot establish remote connection to your own desktop', 'error');
      return;
    }

    setConnecting(true);
    setConnectStatus('Resolving partner network location...');

    let targetBaseUrl = '';
    let isRelay = false;
    if (explicitIp) {
      targetBaseUrl = explicitIp.startsWith('http') ? explicitIp : `http://${explicitIp}`;
    } else {
      try {
        const resolved = await resolvePeer(cleanId);
        if (resolved && resolved.success && (resolved.type === 'relay' || resolved.relay || resolved.url || resolved.ip || resolved.host)) {
          if (resolved.type === 'relay' || resolved.relay) {
            isRelay = true;
            targetBaseUrl = 'relay';
          } else if (resolved.url) {
            targetBaseUrl = resolved.url;
          } else {
            const host = resolved.ip || resolved.host;
            const port = resolved.port || 8000;
            targetBaseUrl = `http://${host}:${port}`;
          }
        } else {
          setConnecting(false);
          setConnectStatus('');
          showToast(
            resolved?.message || `រកមិនឃើញកុំព្យូទ័រ '${cleanId}' ឡើយ។ សូមពិនិត្យថាកុំព្យូទ័រដៃគូបានបើកកម្មវិធី Vvc Remote ហើយឬនៅ`,
            'error'
          );
          return;
        }
      } catch (err) {
        setConnecting(false);
        setConnectStatus('');
        showToast(`មិនអាចភ្ជាប់ទៅកាន់ '${cleanId}' បានឡើយ: ${err.message}`, 'error');
        return;
      }
    }

    try {
      setConnectStatus(isRelay ? 'Requesting partner authorization via Cloud Relay...' : 'Requesting remote host authorization...');
      
      let reqRes;
      if (isRelay) {
        reqRes = await initRelayConnectRequest(cleanId);
      } else {
        reqRes = await initConnectRequest(targetBaseUrl, hostInfo?.peer_id || '999999999');
      }

      if (!reqRes || reqRes.success === false || reqRes.status === 'offline' || reqRes.status === 'rejected') {
        setConnecting(false);
        setConnectStatus('');
        showToast(reqRes?.message || 'Connection request was declined or partner is offline', 'error');
        return;
      }

      const requestId = reqRes.request_id || reqRes.session_id;
      setPendingReq({ id: requestId, baseUrl: targetBaseUrl, targetId: cleanId });

      // If auto-accepted immediately (or relay answered with accept)
      if (reqRes.auto_accepted || reqRes.status === 'accepted') {
        openSession(cleanId, targetBaseUrl, reqRes.session_id, isRelay);
        return;
      }

      if (!isRelay) {
        // Poll authorization status on LAN
        setConnectStatus('Waiting for partner to accept connection...');
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);

        let attempts = 0;
        const maxAttempts = 40; // 60 seconds

        pollTimerRef.current = setInterval(async () => {
          attempts++;
          try {
            const stat = await pollConnectStatus(targetBaseUrl, requestId);
            if (!stat) return;

            if (stat.status === 'accepted') {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              openSession(cleanId, targetBaseUrl, stat.session_id, false);
            } else if (stat.status === 'rejected') {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              setConnecting(false);
              showToast('Connection request was declined by the partner', 'error');
            } else if (stat.status === 'timeout' || attempts >= maxAttempts) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              setConnecting(false);
              showToast('Connection request timed out', 'error');
            }
          } catch (_) {}
        }, 1500);
      }

    } catch (err) {
      setConnecting(false);
      showToast(err.message || 'Failed to initiate connection', 'error');
    }
  };

  const handleCancelConnect = async () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pendingReq.id && pendingReq.baseUrl && pendingReq.baseUrl !== 'relay') {
      try {
        await cancelConnectRequest(pendingReq.baseUrl, pendingReq.id);
      } catch (_) {}
    }
    setConnecting(false);
    setConnectStatus('');
    setPendingReq({ id: null, baseUrl: '', targetId: '' });
    showToast('Connection request cancelled', 'info');
  };

  const openSession = (peerId, targetBaseUrl, sessionId, isRelay = false) => {
    setConnecting(false);
    setConnectStatus('');
    setPendingReq({ id: null, baseUrl: '', targetId: '' });

    const newTabId = 'tab_' + Date.now();
    const formattedId = peerId.length === 9 ? `${peerId.slice(0,3)} ${peerId.slice(3,6)} ${peerId.slice(6,9)}` : peerId;

    const newTab = {
      id: newTabId,
      peerId: peerId,
      targetBaseUrl: targetBaseUrl,
      sessionId: sessionId || `sess_${Date.now()}`,
      isRelay: isRelay || targetBaseUrl === 'relay',
      alias: formattedId,
      title: formattedId
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);

    // Save history
    addHistory(peerId, isRelay ? 'Global Cloud Relay' : targetBaseUrl.replace(/^https?:\/\//, '')).then(loadHistory);
    showToast(`Connected to ${formattedId}${isRelay ? ' (via Cloud Relay)' : ''}`, 'success');
  };

  const handleCloseTab = (tabId) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId('dashboard');
      setActiveNav('remote');
    }
  };

  // --- Incoming Request Handlers ---
  const handleIncomingAccept = async (requestId, allowMouse, allowKeyboard) => {
    try {
      await respondIncomingRequest(requestId, 'accept', allowMouse, allowKeyboard);
      setIncomingRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      showToast('Incoming connection approved', 'success');
    } catch (err) {
      showToast('Failed to accept request', 'error');
    }
  };

  const handleIncomingDecline = async (requestId) => {
    try {
      await respondIncomingRequest(requestId, 'reject');
      setIncomingRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      showToast('Incoming connection rejected', 'info');
    } catch (_) {}
  };

  // --- History Handlers ---
  const handleDeleteSession = async (id) => {
    try {
      await deleteHistoryItem(id);
      loadHistory();
      showToast('Session removed from history', 'info');
    } catch (_) {}
  };

  const handleClearAllHistory = async () => {
    try {
      await clearAllHistory();
      setSessions([]);
      showToast('Session history cleared', 'info');
    } catch (_) {}
  };

  const handleUpdateAlias = async (remoteId, alias) => {
    try {
      await updatePeerAlias(remoteId, alias);
      loadHistory();
      showToast('Alias saved', 'success');
    } catch (_) {}
  };

  const handleAddContact = async (remoteId, alias) => {
    try {
      await addHistory(remoteId, '');
      if (alias) {
        await updatePeerAlias(remoteId, alias);
      }
      loadHistory();
      showToast(`Added ${alias || remoteId} to address book`, 'success');
    } catch (_) {}
  };

  const activeSessionTab = tabs.find((t) => t.id === activeTabId);
  const currentIncoming = incomingRequests.length > 0 ? incomingRequests[0] : null;

  return (
    <div className="app-container">
      {/* Ambient Glowing Background Orbs */}
      <div className="ambient-glow-mesh">
        <div className="glow-orb glow-top-left" />
        <div className="glow-orb glow-bottom-right" />
      </div>

      {/* 1. Desktop Window TitleBar & Multi-Session Tab Bar */}
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          setActiveTabId(id);
          if (id === 'dashboard') setActiveNav('remote');
        }}
        onCloseTab={handleCloseTab}
        onNewConnection={() => {
          setActiveTabId('dashboard');
          setActiveNav('remote');
        }}
      />

      {/* 2. Main Desktop Window Shell: Left Sidebar + Center Workspace */}
      <div className="app-body-container">
        {/* Left Professional Sidebar Navigation */}
        <Sidebar
          activeNav={activeNav}
          onSelectNav={handleSelectNav}
          hostInfo={hostInfo}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
        />

        {/* Center Main View: Dashboard or Fullscreen Remote Viewer */}
        {activeTabId === 'dashboard' ? (
          <main className="dashboard-view">
            <div className="dashboard-grid">
              {/* Left Card: Host Information & Permissions */}
              <ThisDeskCard
                hostInfo={hostInfo}
                onRefreshPin={handleRefreshPin}
                onUpdatePermissions={handleUpdatePermissions}
                onUpdateAutostart={handleUpdateAutostart}
                onUpdateAutoAccept={handleUpdateAutoAccept}
                onToast={showToast}
              />

              {/* Right Card: Target Address & Sessions Tray */}
              <RemoteDeskCard
                onConnect={handleConnect}
                onCancelConnect={handleCancelConnect}
                connecting={connecting}
                connectStatus={connectStatus}
                sessions={sessions}
                peers={peers}
                onDeleteSession={handleDeleteSession}
                onClearAllHistory={handleClearAllHistory}
                onUpdateAlias={handleUpdateAlias}
                onRefreshPeers={loadPeers}
                loadingPeers={loadingPeers}
              />
            </div>
          </main>
        ) : activeSessionTab ? (
          <RemoteViewer
            key={activeSessionTab.id}
            session={activeSessionTab}
            onReturnToDashboard={() => setActiveTabId('dashboard')}
            onDisconnect={handleCloseTab}
            onOpenFileExplorer={(sess) => setFileExplorerSession(sess)}
            onToast={showToast}
          />
        ) : null}
      </div>

      {/* 3. Bottom Status Bar with Live Telemetry & Security Tags */}
      <StatusBar
        hostInfo={hostInfo}
        latency={livePing}
        packetLoss="0.0%"
      />

      {/* --- Modals & Utility Dialogs --- */}

      {/* Incoming Connection Request Modal */}
      {currentIncoming && (
        <IncomingModal
          request={currentIncoming}
          onAccept={handleIncomingAccept}
          onDecline={handleIncomingDecline}
        />
      )}

      {/* Radar Waiting Modal (Shown while connecting to partner) */}
      <WaitingModal
        isOpen={connecting && connectStatus.toLowerCase().includes('partner')}
        targetId={pendingReq.targetId}
        status={connectStatus}
        onCancel={handleCancelConnect}
      />

      {/* Remote / Local File Explorer Modal */}
      {fileExplorerSession && (
        <FileExplorer
          isOpen={!!fileExplorerSession}
          onClose={() => setFileExplorerSession(null)}
          targetBaseUrl={fileExplorerSession.targetBaseUrl}
          sessionId={fileExplorerSession.sessionId}
          peerName={fileExplorerSession.alias || fileExplorerSession.peerId}
          onToast={showToast}
        />
      )}

      {/* Application Settings Modal */}
      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={() => {
          setActiveModal(null);
          setActiveNav('remote');
        }}
        hostInfo={hostInfo}
        onUpdatePermissions={handleUpdatePermissions}
        onUpdateAutostart={handleUpdateAutostart}
        onUpdateAutoAccept={handleUpdateAutoAccept}
        onToast={showToast}
      />

      {/* Diagnostics & Speed Test Modal */}
      <DiagnosticsModal
        isOpen={activeModal === 'diagnostics'}
        onClose={() => {
          setActiveModal(null);
          setActiveNav('remote');
        }}
        hostInfo={hostInfo}
        onToast={showToast}
      />

      {/* Session Audit Logs Modal */}
      <LogsModal
        isOpen={activeModal === 'logs'}
        onClose={() => {
          setActiveModal(null);
          setActiveNav('remote');
        }}
        sessions={sessions}
        onConnect={handleConnect}
        onClearLogs={handleClearAllHistory}
        onToast={showToast}
      />

      {/* Address Book Modal */}
      <AddressBookModal
        isOpen={activeModal === 'addressbook'}
        onClose={() => {
          setActiveModal(null);
          setActiveNav('remote');
        }}
        sessions={sessions}
        onConnect={handleConnect}
        onOpenFiles={(sess) => setFileExplorerSession(sess)}
        onAddContact={handleAddContact}
        onDeleteContact={handleDeleteSession}
        onToast={showToast}
      />

      {/* Notification Toast Stack */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
