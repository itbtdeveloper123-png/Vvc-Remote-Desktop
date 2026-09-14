import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export function Toast({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map((t) => {
        let Icon = Info;
        let typeClass = 'info';

        if (t.type === 'success') {
          Icon = CheckCircle2;
          typeClass = 'success';
        } else if (t.type === 'error') {
          Icon = AlertTriangle;
          typeClass = 'error';
        }

        return (
          <div key={t.id} className={`toast ${typeClass}`}>
            <Icon size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, wordBreak: 'break-word' }}>{t.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 2
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
