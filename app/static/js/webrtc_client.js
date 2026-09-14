/**
 * AnyDesk-Style Multi-Session WebRTC & WebSocket Client
 * High-performance remote desktop connection manager supporting concurrent devices,
 * tab switching, and Windows lock screen wake & unlock.
 */

class RemotePeerSession {
  constructor(peerId, targetBaseUrl, sessionId, nativeW, nativeH, manager) {
    this.peerId = peerId;
    this.targetBaseUrl = targetBaseUrl;
    this.sessionId = sessionId;
    this.nativeW = nativeW || 1920;
    this.nativeH = nativeH || 1080;
    this.manager = manager;

    this.pc = null;
    this.dataChannel = null;
    this.ws = null;
    this.stream = null;
    this.currentProtocol = 'WebRTC';
    this.isConnected = false;
    this.pingInterval = null;

    // Telemetry
    this.fpsCount = 0;
    this.lastFpsTime = performance.now();
    this.rtt = 0;
    this.fps = 60;
  }

  async connectWebRTC() {
    this.currentProtocol = 'WebRTC';
    const baseUrl = this.targetBaseUrl || window.location.origin;

    try {
      const infoRes = await fetch(`${baseUrl}/api/info`);
      const info = await infoRes.json();
      const iceServers = info.ice_servers || [{ urls: 'stun:stun.l.google.com:19302' }];

      this.pc = new RTCPeerConnection({ iceServers });

      // Create low-latency DataChannel for input events
      this.dataChannel = this.pc.createDataChannel('input', {
        ordered: false,
        maxRetransmits: 0
      });

      this.dataChannel.onopen = () => {
        console.log(`[WebRTC:${this.peerId}] DataChannel open`);
        this.isConnected = true;
        this.startTelemetry();
      };

      this.dataChannel.onmessage = (e) => {
        this.handleChannelMessage(e.data);
      };

      // Receive remote desktop track with text sharpness hint
      this.pc.ontrack = (event) => {
        console.log(`[WebRTC:${this.peerId}] Remote track received:`, event.track.kind);
        if (event.track && event.track.kind === 'video') {
          if ('contentHint' in event.track) {
            event.track.contentHint = 'text';
          }
        }
        this.stream = event.streams[0];
        // If this session is currently active, attach to video element immediately
        if (this.manager.activePeerId === this.peerId) {
          this.manager.attachStreamToVideo(this.stream, this.nativeW, this.nativeH);
        }
      };

      const transceiver = this.pc.addTransceiver('video', { direction: 'recvonly' });
      if (transceiver.receiver && transceiver.receiver.track && 'contentHint' in transceiver.receiver.track) {
        transceiver.receiver.track.contentHint = 'text';
      }

      const offer = await this.pc.createOffer();
      let offerSdp = offer.sdp;
      if (offerSdp.includes('m=video') && !offerSdp.includes('b=AS:')) {
        offerSdp = offerSdp.replace(/m=video[^\r\n]*\r\n/, '$&b=AS:16000\r\nb=TIAS:16000000\r\n');
      }
      offerSdp = offerSdp.split('\r\n').map(line => {
        if (line.startsWith('a=fmtp:') && !line.includes('x-google-min-bitrate')) {
          return line + ';x-google-min-bitrate=3000;x-google-start-bitrate=8000;x-google-max-bitrate=20000';
        }
        return line;
      }).join('\r\n');

      await this.pc.setLocalDescription({ type: offer.type, sdp: offerSdp });

      // Wait for ICE gathering
      if (this.pc.iceGatheringState !== 'complete') {
        await new Promise((resolve) => {
          const checkState = () => {
            if (this.pc && this.pc.iceGatheringState === 'complete') {
              this.pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          this.pc.addEventListener('icegatheringstatechange', checkState);
          setTimeout(resolve, 500);
        });
      }

      const offerRes = await fetch(`${baseUrl}/api/webrtc/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: this.pc.localDescription.sdp,
          type: this.pc.localDescription.type,
          session_id: this.sessionId
        })
      });

      if (!offerRes.ok) {
        throw new Error('Signaling server rejected SDP offer');
      }

      const answer = await offerRes.json();
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));

      // 2.0s Watchdog: If WebRTC stays blank, switch to WebSocket
      const watchdog = setTimeout(() => {
        if (this.currentProtocol === 'WebRTC' && (!this.stream || this.manager.videoElem.videoWidth === 0)) {
          console.warn(`[Watchdog:${this.peerId}] WebRTC delayed. Switching to high-speed WebSocket stream.`);
          this.fallbackToWebSocket();
        }
      }, 2000);

      this.pc.addEventListener('connectionstatechange', () => {
        if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
          clearTimeout(watchdog);
          this.fallbackToWebSocket();
        }
      });

    } catch (err) {
      console.warn(`[WebRTC:${this.peerId}] Connection error, using WebSocket fallback:`, err);
      this.fallbackToWebSocket();
    }
  }

  fallbackToWebSocket() {
    this.currentProtocol = 'WebSocket (Fallback)';
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    const baseUrl = this.targetBaseUrl || window.location.origin;
    const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws/stream?session_id=${encodeURIComponent(this.sessionId)}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.isConnected = true;
      this.startTelemetry();
      if (this.manager.activePeerId === this.peerId) {
        this.manager.setupWebSocketCanvas(this.nativeW, this.nativeH);
      }
    };

    this.ws.onmessage = (e) => {
      this.fpsCount++;
      if (this.manager.activePeerId === this.peerId) {
        const blob = new Blob([e.data], { type: 'image/jpeg' });
        createImageBitmap(blob).then(bmp => {
          this.manager.canvasCtx.drawImage(bmp, 0, 0, this.nativeW, this.nativeH);
          bmp.close();
        }).catch(() => {});
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
    };
  }

  sendInput(msg) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(msg));
        return true;
      } catch (e) {}
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        return true;
      } catch (e) {}
    }
    return false;
  }

  handleChannelMessage(raw) {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'pong') {
        this.rtt = performance.now() - data.clientTime;
        if (this.manager.activePeerId === this.peerId) {
          UI.updateHUD({ latency: this.rtt });
        }
      }
    } catch (e) {}
  }

  startTelemetry() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendInput({ type: 'ping', time: performance.now() });
        const now = performance.now();
        const dt = (now - this.lastFpsTime) / 1000;
        this.fps = Math.round(this.fpsCount / dt) || 60;
        this.fpsCount = 0;
        this.lastFpsTime = now;

        if (this.manager.activePeerId === this.peerId) {
          UI.updateHUD({ fps: this.fps });
        }
      }
    }, 1000);
  }

  disconnect() {
    this.isConnected = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}


class MultiSessionManager {
  constructor() {
    this.sessions = new Map(); // remoteId -> RemotePeerSession
    this.activePeerId = null;
    this.currentRequestId = null;
    this.statusPollInterval = null;

    this.videoElem = document.getElementById('remote-video');
    this.canvasElem = document.getElementById('remote-canvas');
    this.canvasCtx = this.canvasElem ? this.canvasElem.getContext('2d') : null;
    this.inputHandler = null;

    this._initInputHandlers();
  }

  _initInputHandlers() {
    if (this.videoElem) {
      this.inputHandler = new RemoteInputHandler(this.videoElem, (msg) => this.sendInput(msg));
      this.inputHandler.start();
    }
  }

  getActiveSession() {
    return this.activePeerId ? this.sessions.get(this.activePeerId) : null;
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  async initiateConnection(remoteId) {
    const cleanId = remoteId.trim();
    if (!cleanId) return;

    // Check if already connected to this device
    if (this.sessions.has(cleanId)) {
      UI.showToast(`Already connected to ${cleanId}. Switching to tab.`, 'info');
      this.switchSession(cleanId);
      return;
    }

    let targetBaseUrl = window.location.origin;

    // Show client waiting modal with option to cancel
    UI.showWaitingModal(cleanId, async () => {
      if (this.currentRequestId && targetBaseUrl) {
        await fetch(`${targetBaseUrl}/api/connect-request/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: this.currentRequestId })
        }).catch(() => {});
        this.currentRequestId = null;
      }
      if (this.statusPollInterval) {
        clearInterval(this.statusPollInterval);
        this.statusPollInterval = null;
      }
      UI.showToast('Connection request cancelled', 'info');
    });

    try {
      // 1. Resolve remote peer location (Localhost multi-instance, LAN UDP, or Direct IP)
      try {
        const resolveRes = await fetch(`/api/resolve-peer?target=${encodeURIComponent(cleanId)}`);
        if (resolveRes.ok) {
          const resolveData = await resolveRes.json();
          if (resolveData.success && resolveData.url) {
            targetBaseUrl = resolveData.url.replace(/\/+$/, '');
            console.log(`[PeerDiscovery] Target '${cleanId}' resolved to ${targetBaseUrl}`);
          } else {
            UI.closeWaitingModal();
            UI.showToast(resolveData.message || 'Remote desk not found on network', 'error');
            return;
          }
        }
      } catch (resErr) {
        console.warn('Resolution fallback to local origin:', resErr);
      }

      // 2. Identify who we are
      const myId = UI.elements.hostPeerId ? UI.elements.hostPeerId.innerText : 'Remote User';

      // 3. Send connection request to target host
      const res = await fetch(`${targetBaseUrl}/api/connect-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer_id: myId, target_id: cleanId })
      });

      const data = await res.json();
      if (!data.success) {
        UI.closeWaitingModal();
        UI.showToast(data.message || 'Remote desk rejected connection', 'error');
        return;
      }

      const requestId = data.request_id;
      this.currentRequestId = requestId;

      // 4. Poll target host for authorization
      if (this.statusPollInterval) clearInterval(this.statusPollInterval);
      this.statusPollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${targetBaseUrl}/api/connect-request/status?request_id=${encodeURIComponent(requestId)}`);
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();
          if (statusData.status === 'accepted') {
            clearInterval(this.statusPollInterval);
            this.statusPollInterval = null;
            this.currentRequestId = null;
            UI.closeWaitingModal();
            UI.showToast(`Connected to ${cleanId}! Full Control enabled.`, 'success');

            const width = statusData.width || 1920;
            const height = statusData.height || 1080;

            // Create and store session
            const session = new RemotePeerSession(cleanId, targetBaseUrl, statusData.session_id, width, height, this);
            this.sessions.set(cleanId, session);

            // Record session in SQLite connection history
            try {
              fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  remote_id: cleanId,
                  remote_ip: targetBaseUrl || '',
                  direction: 'outgoing',
                  status: 'connected'
                })
              }).then(() => UI.fetchHistory()).catch(e => console.warn('History save error:', e));
            } catch (e) {}

            // Switch to new session tab & connect WebRTC
            this.switchSession(cleanId);
            await session.connectWebRTC();

          } else if (statusData.status === 'rejected') {
            clearInterval(this.statusPollInterval);
            this.statusPollInterval = null;
            this.currentRequestId = null;
            UI.closeWaitingModal();
            UI.showToast(statusData.message || 'Connection declined by remote computer.', 'error');

          } else if (statusData.status === 'expired') {
            clearInterval(this.statusPollInterval);
            this.statusPollInterval = null;
            this.currentRequestId = null;
            UI.closeWaitingModal();
            UI.showToast('Connection request timed out without response.', 'error');
          }
        } catch (pollErr) {
          console.warn('Status poll error:', pollErr);
        }
      }, 700);

    } catch (err) {
      UI.closeWaitingModal();
      UI.showToast(`Connection error: ${err.message}`, 'error');
    }
  }

  switchSession(peerId) {
    if (peerId === 'dashboard' || !peerId) {
      this.activePeerId = null;
      UI.showDashboardView();
      UI.renderSessionTabs(null);
      UI.renderActiveSessionDock(this.getAllSessions());
      return;
    }

    const session = this.sessions.get(peerId);
    if (!session) return;

    this.activePeerId = peerId;
    UI.openSessionViewport(peerId);
    UI.renderSessionTabs(peerId);

    // Attach stream or canvas
    if (session.currentProtocol.startsWith('WebSocket')) {
      this.setupWebSocketCanvas(session.nativeW, session.nativeH);
    } else {
      if (session.stream) {
        this.attachStreamToVideo(session.stream, session.nativeW, session.nativeH);
      }
    }

    // Update HUD telemetry
    UI.updateHUD({
      protocol: session.currentProtocol,
      latency: session.rtt,
      fps: session.fps,
      resolution: `${session.nativeW}x${session.nativeH}`
    });
  }

  attachStreamToVideo(stream, nativeW, nativeH) {
    if (!this.videoElem) return;
    this.videoElem.style.display = 'block';
    if (this.canvasElem) this.canvasElem.style.display = 'none';

    this.videoElem.srcObject = stream;
    this.videoElem.muted = true;
    this.videoElem.playsInline = true;
    this.videoElem.play().catch(() => {});

    if (this.inputHandler) {
      this.inputHandler.setNativeResolution(nativeW, nativeH);
    }
  }

  setupWebSocketCanvas(nativeW, nativeH) {
    if (!this.canvasElem) return;
    if (this.videoElem) this.videoElem.style.display = 'none';
    this.canvasElem.style.display = 'block';
    this.canvasElem.width = nativeW;
    this.canvasElem.height = nativeH;

    if (this.inputHandler) {
      this.inputHandler.stop();
      this.inputHandler = new RemoteInputHandler(this.canvasElem, (msg) => this.sendInput(msg));
      this.inputHandler.setNativeResolution(nativeW, nativeH);
      this.inputHandler.start();
    }
  }

  closeSession(peerId) {
    const session = this.sessions.get(peerId);
    if (session) {
      session.disconnect();
      this.sessions.delete(peerId);
      UI.showToast(`Session with ${peerId} ended`, 'info');
    }

    // If closed session was active, switch to next available session or dashboard
    if (this.activePeerId === peerId) {
      const remaining = Array.from(this.sessions.keys());
      if (remaining.length > 0) {
        this.switchSession(remaining[0]);
      } else {
        this.switchSession('dashboard');
      }
    } else {
      UI.renderSessionTabs(this.activePeerId);
      UI.renderActiveSessionDock(this.getAllSessions());
    }
  }

  disconnect() {
    if (this.activePeerId) {
      this.closeSession(this.activePeerId);
    } else {
      for (const peerId of this.sessions.keys()) {
        this.closeSession(peerId);
      }
    }
  }

  sendInput(msg) {
    const session = this.getActiveSession();
    if (session) {
      return session.sendInput(msg);
    }
    return false;
  }

  sendSpecialKey(seq) {
    if (seq === 'CAD') {
      this.sendInput({ type: 'keydown', code: 'ControlLeft', key: 'Control' });
      this.sendInput({ type: 'keydown', code: 'AltLeft', key: 'Alt' });
      this.sendInput({ type: 'keydown', code: 'Delete', key: 'Delete' });
      setTimeout(() => {
        this.sendInput({ type: 'keyup', code: 'Delete', key: 'Delete' });
        this.sendInput({ type: 'keyup', code: 'AltLeft', key: 'Alt' });
        this.sendInput({ type: 'keyup', code: 'ControlLeft', key: 'Control' });
      }, 100);
    } else if (seq === 'WIN') {
      this.sendInput({ type: 'keydown', code: 'MetaLeft', key: 'Meta' });
      setTimeout(() => {
        this.sendInput({ type: 'keyup', code: 'MetaLeft', key: 'Meta' });
      }, 80);
    }
  }

  async unlockRemoteScreen() {
    const session = this.getActiveSession();
    if (!session) {
      UI.showToast('No active session to unlock', 'info');
      return;
    }

    UI.showToast('Sending wake & unlock sequence to remote computer...', 'info');

    // 1. Send host wake API request
    try {
      const baseUrl = session.targetBaseUrl || window.location.origin;
      await fetch(`${baseUrl}/api/screen/wake`, { method: 'POST' }).catch(() => {});
    } catch (e) {}

    // 2. Dismiss lock screen cover image via Space then Enter
    session.sendInput({ type: 'keydown', code: 'Space', key: ' ' });
    setTimeout(() => {
      session.sendInput({ type: 'keyup', code: 'Space', key: ' ' });

      setTimeout(() => {
        session.sendInput({ type: 'keydown', code: 'Enter', key: 'Enter' });
        setTimeout(() => {
          session.sendInput({ type: 'keyup', code: 'Enter', key: 'Enter' });

          // Focus display so user can type password immediately
          if (this.videoElem && this.videoElem.style.display !== 'none') {
            this.videoElem.focus();
          } else if (this.canvasElem) {
            this.canvasElem.focus();
          }
          UI.showToast('Screen unlocked! Ready for password or PIN entry.', 'success');
        }, 80);
      }, 120);
    }, 80);
  }
}

window.RemoteSession = new MultiSessionManager();

// Connect button submit listener
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('connect-form');
  const input = document.getElementById('remote-id-input');

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawId = input.value.trim();
      if (!rawId) return;
      window.RemoteSession.initiateConnection(rawId);
    });
  }
});
