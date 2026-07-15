import React from 'react';

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

export interface ToastProps {
  tone?: ToastTone;
  children?: React.ReactNode;
}

const BORDER: Record<ToastTone, string> = {
  info: 'var(--accent-info)',
  ok: 'var(--accent-ok)',
  warn: 'var(--accent-warn)',
  danger: 'var(--accent-danger)',
};

export function Toast({ tone = 'info', children }: ToastProps): React.JSX.Element {
  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-dim)',
        borderLeftWidth: 4,
        borderLeftColor: BORDER[tone],
        padding: '10px 14px',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-panel)',
        minWidth: 240,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </div>
  );
}
