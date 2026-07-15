import React from 'react';
import type { ToastTone } from './Toast.js';

export interface NotificationListItem {
  id: string;
  tone: ToastTone;
  event?: string;
  time?: string;
  message: string;
}

export interface NotificationListProps {
  notifications: NotificationListItem[];
  emptyLabel?: string;
}

const BORDER: Record<ToastTone, string> = {
  info: 'var(--accent-info)',
  ok: 'var(--accent-ok)',
  warn: 'var(--accent-warn)',
  danger: 'var(--accent-danger)',
};

export function NotificationList({ notifications, emptyLabel = 'No notifications yet' }: NotificationListProps): React.JSX.Element {
  if (notifications.length === 0) {
    return (
      <div style={{ color: 'var(--text-faint)', textAlign: 'center', padding: '28px 10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notifications.map((n) => (
        <div
          key={n.id}
          style={{
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-dim)',
            borderLeft: `3px solid ${BORDER[n.tone]}`,
            borderRadius: 'var(--radius-sm)',
            padding: '9px 12px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 'var(--text-2xs)', color: BORDER[n.tone], textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
              {n.event ?? n.tone}
            </span>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', flexShrink: 0 }}>{n.time}</span>
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{n.message}</div>
        </div>
      ))}
    </div>
  );
}
