/**
 * High-Performance Dual-Mode Streaming Engine (WebRTC P2P + Binary WebSocket Fallback)
 */

export class RemoteStreamSession {
  constructor({
    peerId,
    targetBaseUrl = '',
    sessionId,
    isRelay = false,
    nativeWidth = 1920,
    nativeHeight = 1080,
    onTelemetry,
    onStatusChange,
    onFrameUpdate
  }) {
    this.peerId = peerId;
    this.targetBaseUrl = targetBaseUrl;
    this.sessionId = sessionId;
    this.isRelay = isRelay || targetBaseUrl === 'relay';
    this.nativeWidth = nativeWidth;
    this.nativeHeight = nativeHeight;

    this.onTelemetry = onTelemetry || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.onFrameUpdate = onFrameUpdate || (() => {});

    this.protocol = 'WebRTC';
    this.isConnected = false;

    // WebRTC references
    this.pc = null;
    this.dataChannel = null;

    // WebSocket fallback references
    this.ws = null;

    // Telemetry stats
    this.rtt = 0;
    this.fps = 0;
    this._frameCount = 0;
    this._lastFpsTime = performance.now();
    this._telemetryInterval = null;

    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;
  }

  attachElements(videoElem, canvasElem) {
    this.videoElement = videoElem;
    this.canvasElement = canvasElem;
    if (this.canvasElement) {
      this.canvasCtx = this.canvasElement.getContext('2d');
    }
  }

  async connect() {
    this.onStatusChange('connecting');
    const baseUrl = this.targetBaseUrl || window.location.origin;

    try {
      // 1. Fetch ICE servers from host or use Google STUN + OpenRelay TURN for WAN NAT Traversal
      let iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelay',
          credential: 'openrelay'
        }
      ];
      if (!this.isRelay && baseUrl && !baseUrl.includes('relay')) {
        try {
          const infoRes = await fetch(`${baseUrl}/api/info`);
          const info = await infoRes.json();
          if (info.ice_servers && info.ice_servers.length > 0) iceServers = info.ice_servers;
        } catch (_) {}
      }

      this.pc = new RTCPeerConnection({ iceServers });

      // 2. DataChannel for input events
      this.dataChannel = this.pc.createDataChannel('input', {
        ordered: false,
        maxRetransmits: 0
      });

      this.dataChannel.onopen = () => {
        this.isConnected = true;
        this.protocol = this.isRelay ? 'WebRTC (Cloud Relay P2P)' : 'WebRTC (Direct LAN)';
        this.onStatusChange('connected');
        this._startTelemetry();
      };

      this.dataChannel.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'pong') {
            this.rtt = Math.max(1, Math.round(performance.now() - data.clientTime));
            this._pushTelemetry();
          }
        } catch (_) {}
      };

      this.pc.ontrack = (event) => {
        if (this.videoElement && event.track.kind === 'video') {
          this.videoElement.srcObject = event.streams[0] || new MediaStream([event.track]);
          this.videoElement.play().catch((err) => console.warn('Video play error:', err));
        }
      };

      this.pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE Connection State: ${this.pc.iceConnectionState}`);
        if (this.pc.iceConnectionState === 'failed') {
          console.warn('[WebRTC] ICE Connection failed. Initiating fallback...');
          this._fallbackToWebSocket();
        }
      };

      // 3. Create Offer
      this.pc.addTransceiver('video', { direction: 'recvonly' });
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering (STUN / TURN reflexive candidates)
      await new Promise((resolve) => {
        if (this.pc.iceGatheringState === 'complete') resolve();
        else {
          const check = () => {
            if (this.pc.iceGatheringState === 'complete') {
              this.pc.removeEventListener('icegatheringstatechange', check);
              resolve();
            }
          };
          this.pc.addEventListener('icegatheringstatechange', check);
          setTimeout(resolve, 2000); // 2s gathering ceiling for STUN candidates
        }
      });

      // 4. Negotiate with Host (Direct LAN HTTP or Global Cloud Relay)
      let answer;
      if (this.isRelay) {
        const relayRes = await fetch('/api/relay/webrtc-offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_peer_id: this.peerId,
            sdp: this.pc.localDescription.sdp,
            offer_type: this.pc.localDescription.type,
            session_id: this.sessionId
          })
        });
        if (!relayRes.ok) throw new Error('WebRTC Cloud Relay negotiation failed');
        answer = await relayRes.json();
      } else {
        const offerRes = await fetch(`${baseUrl}/api/webrtc/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sdp: this.pc.localDescription.sdp,
            type: this.pc.localDescription.type,
            session_id: this.sessionId
          })
        });
        if (!offerRes.ok) throw new Error('WebRTC signaling negotiation failed');
        answer = await offerRes.json();
      }

      if (!answer || !answer.sdp) {
        throw new Error(answer?.message || 'Invalid SDP answer received from host');
      }
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));

    } catch (err) {
      console.warn('[WebRTC] Failed to initialize:', err);
      if (this.isRelay) {
        this.onStatusChange('disconnected');
      } else {
        this._fallbackToWebSocket();
      }
    }
  }

  _fallbackToWebSocket() {
    if (this.ws) return;
    if (this.isRelay) {
      this.onStatusChange('disconnected');
      return;
    }
    this.protocol = 'WebSocket (Fallback)';
    const baseUrl = this.targetBaseUrl || window.location.origin;
    const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws/stream?session_id=${encodeURIComponent(this.sessionId)}`;

    console.log(`[Stream] Connecting fallback WebSocket: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.isConnected = true;
      this.onStatusChange('connected');
      this._startTelemetry();
    };

    this.ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pong') {
            this.rtt = Math.max(1, Math.round(performance.now() - msg.clientTime));
            this._pushTelemetry();
          } else if (msg.type === 'init') {
            this.nativeWidth = msg.width || this.nativeWidth;
            this.nativeHeight = msg.height || this.nativeHeight;
          }
        } catch (_) {}
      } else if (e.data instanceof ArrayBuffer) {
        // Binary JPEG frame packet: [0x01] + [jpeg bytes]
        const view = new Uint8Array(e.data);
        if (view[0] === 0x01 && this.canvasCtx) {
          const blob = new Blob([view.subarray(1)], { type: 'image/jpeg' });
          createImageBitmap(blob).then((bmp) => {
            if (this.canvasElement) {
              if (this.canvasElement.width !== bmp.width || this.canvasElement.height !== bmp.height) {
                this.canvasElement.width = bmp.width;
                this.canvasElement.height = bmp.height;
              }
              this.canvasCtx.drawImage(bmp, 0, 0);
              this._frameCount++;
            }
          }).catch(() => {});
        }
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.onStatusChange('disconnected');
    };
  }

  sendInput(eventObj) {
    const payload = JSON.stringify(eventObj);
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(payload);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    }
  }

  sendSpecialKey(keyName) {
    this.sendInput({
      type: 'special_key',
      key: keyName
    });
  }

  _startTelemetry() {
    if (this._telemetryInterval) clearInterval(this._telemetryInterval);
    this._telemetryInterval = setInterval(() => {
      const now = performance.now();
      const deltaSec = (now - this._lastFpsTime) / 1000;
      if (deltaSec >= 1) {
        this.fps = Math.round(this._frameCount / deltaSec);
        this._frameCount = 0;
        this._lastFpsTime = now;
      }

      // Ping
      const pingMsg = JSON.stringify({ type: 'ping', time: performance.now() });
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(pingMsg);
      } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pingMsg);
      }

      this._pushTelemetry();
    }, 1000);
  }

  _pushTelemetry() {
    this.onTelemetry({
      protocol: this.protocol,
      latency: this.rtt,
      fps: this.fps,
      resolution: `${this.nativeWidth}x${this.nativeHeight}`
    });
  }

  disconnect() {
    if (this._telemetryInterval) {
      clearInterval(this._telemetryInterval);
      this._telemetryInterval = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch (_) {}
      this.pc = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.onStatusChange('disconnected');
  }
}
