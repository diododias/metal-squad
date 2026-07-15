import React from 'react';

export interface ProgressBarProps {
  percent?: number;
  tone?: 'ok' | 'warn' | 'danger' | 'info';
  label?: string;
}

export function ProgressBar({ percent = 0, tone = 'info', label }: ProgressBarProps): React.JSX.Element {
  const p = Math.max(0, Math.min(percent, 999));
  const danger = p >= 100;
  const warn = p >= 80 && p < 100;
  const color = danger ? 'var(--accent-danger)' : warn ? 'var(--accent-warn)' : `var(--accent-${tone})`;

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-dim)',
            marginBottom: 4,
          }}
        >
          <span>{label}</span>
          <span style={{ color: danger ? color : 'var(--text-dim)' }}>
            {Math.round(p)}%{danger ? ' ⚠' : ''}
          </span>
        </div>
      )}
      <div
        style={{
          height: 6,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--bg-panel-alt)',
          overflow: 'hidden',
          border: '1px solid var(--border-dim)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${String(Math.min(p, 100))}%`,
            background: color,
            transition: 'width 0.2s',
            animation: danger ? 'msq-pulse 1.1s ease-in-out infinite' : 'none',
          }}
        />
      </div>
    </div>
  );
}
