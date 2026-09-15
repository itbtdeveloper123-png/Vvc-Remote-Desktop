import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Home, Maximize2, Minimize2, Folder, Sun,
  Radio, Activity, Wifi, XOctagon, KeyRound, LayoutGrid
} from 'lucide-react';
import { RemoteStreamSession } from '../services/webrtc.js';
import { RemoteInputHandler } from '../services/input.js';
import { wakeRemoteScreen } from '../services/api.js';

export function RemoteViewer({
  session, // { id, peerId, targetBaseUrl, sessionId, alias }
  onReturnToDashboard,
  onDisconnect,
  onOpenFileExplorer,
  onToast
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const streamSessionRef = useRef(null);
  const inputHandlerRef = useRef(null);

  const [status, setStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [telemetry, setTelemetry] = useState({
    protocol: 'WebRTC',
    latency: 0,
    fps: 0,
    resolution: '1920x1080'
  });

  // Handle Fullscreen state tracking
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Initialize WebRTC / WebSocket Stream Session
  useEffect(() => {
    if (!session) return;

    const stream = new RemoteStreamSession({
      peerId: session.peerId,
      targetBaseUrl: session.targetBaseUrl || '',
      sessionId: session.sessionId || session.id,
      isRelay: !!session.isRelay || session.targetBaseUrl === 'relay',
      onTelemetry: (stats) => {
        setTelemetry((prev) => ({ ...prev, ...stats }));
      },
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === 'connected') {
          inputHandlerRef.current?.start();
        } else if (newStatus === 'disconnected') {
          inputHandlerRef.current?.stop();
        }
      }
    });

    streamSessionRef.current = stream;
    stream.attachElements(videoRef.current, canvasRef.current);

    // Initialize Input Handler
    const inputHandler = new RemoteInputHandler(containerRef.current, (eventObj) => {
      stream.sendInput(eventObj);
    });
    inputHandlerRef.current = inputHandler;

    // Connect stream
    stream.connect();

    return () => {
      inputHandler.destroy();
      stream.disconnect();
    };
  }, [session]);

  const handleWakeScreen = async () => {
    try {
      await wakeRemoteScreen(session.targetBaseUrl || '', session.sessionId || session.id);
      if (onToast) onToast('Wake signal sent to remote display', 'info');
    } catch (_) {
      if (onToast) onToast('Failed to wake screen', 'error');
    }
  };

  const handleSendCtrlAltDel = () => {
    if (streamSessionRef.current) {
      streamSessionRef.current.sendSpecialKey('ctrl_alt_del');
      if (onToast) onToast('Sent Ctrl+Alt+Del shortcut', 'info');
    }
  };

  const handleSendWinKey = () => {
    if (streamSessionRef.current) {
      streamSessionRef.current.sendSpecialKey('win');
      if (onToast) onToast('Sent Windows Key', 'info');
    }
  };

  const latencyColor = telemetry.latency < 40 ? 'var(--emerald)' : telemetry.latency < 100 ? 'var(--amber)' : 'var(--crimson)';

  return (
    <div
      ref={containerRef}
      className="remote-viewport-container"
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      {/* Video display for WebRTC */}
      <video
        ref={videoRef}
        className="remote-display-element"
        autoPlay
        playsInline
        muted
        style={{ display: telemetry.protocol === 'WebRTC' ? 'block' : 'none' }}
      />

      {/* Canvas display for WebSocket Fallback */}
      <canvas
        ref={canvasRef}
        className="remote-display-element"
        style={{ display: telemetry.protocol.includes('WebSocket') ? 'block' : 'none' }}
      />

      {/* Connecting status overlay */}
      {status === 'connecting' && (
        <div style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          background: 'rgba(10, 14, 23, 0.85)',
          backdropFilter: 'blur(16px)',
          padding: '24px 36px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-card)',
          zIndex: 20
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '3px solid rgba(239, 68, 68, 0.2)',
            borderTopColor: 'var(--crimson)',
            animation: 'spin 0.8s linear infinite'
          }} />
          <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#fff' }}>
            Connecting to {session.alias || session.peerId}...
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            Establishing ultra low-latency WebRTC stream
          </div>
        </div>
      )}

      {/* Disconnected overlay */}
      {status === 'disconnected' && (
        <div style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          background: 'rgba(10, 14, 23, 0.9)',
          backdropFilter: 'blur(16px)',
          padding: '28px 40px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          zIndex: 20
        }}>
          <XOctagon size={42} color="var(--crimson)" />
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
            Session Disconnected
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
            The remote connection was closed by host or network interruption.
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={onReturnToDashboard}
            style={{ marginTop: '8px' }}
          >
            <Home size={16} />
            <span>Return to Dashboard</span>
          </button>
        </div>
      )}

      {/* Floating Telemetry HUD */}
      <div className="floating-hud">
        <div className="hud-item">
          <Radio size={13} color="var(--emerald)" />
          <span>{telemetry.protocol}</span>
        </div>
        <div className="hud-item">
          <Activity size={13} color={latencyColor} />
          <span style={{ color: latencyColor }}>{telemetry.latency} ms</span>
        </div>
        <div className="hud-item">
          <Wifi size={13} color="var(--cyan)" />
          <span>{telemetry.fps} FPS</span>
        </div>
        <div className="hud-item">
          <span>{telemetry.resolution}</span>
        </div>
      </div>

      {/* Floating Action Dock */}
      <div className="floating-dock">
        <button
          type="button"
          className="dock-btn"
          onClick={onReturnToDashboard}
          title="Back to Dashboard"
        >
          <Home size={18} />
        </button>

        <button
          type="button"
          className="dock-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        <div className="dock-separator" />

        <button
          type="button"
          className="dock-btn"
          onClick={() => onOpenFileExplorer(session)}
          title="Remote File Transfer"
        >
          <Folder size={18} />
        </button>

        <button
          type="button"
          className="dock-btn"
          onClick={handleWakeScreen}
          title="Wake Remote Display"
        >
          <Sun size={18} />
        </button>

        <button
          type="button"
          className="dock-btn"
          onClick={handleSendWinKey}
          title="Send Windows Key"
        >
          <LayoutGrid size={18} />
        </button>

        <button
          type="button"
          className="dock-btn"
          onClick={handleSendCtrlAltDel}
          title="Send Ctrl+Alt+Del"
        >
          <KeyRound size={18} />
        </button>

        <div className="dock-separator" />

        <button
          type="button"
          className="dock-btn danger"
          onClick={() => onDisconnect(session.id)}
          title="Disconnect Session"
        >
          <XOctagon size={18} />
        </button>
      </div>
    </div>
  );
}
