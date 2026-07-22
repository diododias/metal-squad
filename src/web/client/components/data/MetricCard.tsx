import React from 'react';
import type { PillStatus } from '../core/StatusPill.js';

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  status?: PillStatus;
}

const STATUS_COLOR: Record<PillStatus, string> = {
  running: 'var(--accent-info)',
  done: 'var(--accent-ok)',
  failed: 'var(--accent-danger)',
  blocked: 'var(--accent-warn)',
  aborted: 'var(--text-dim)',
  not_started: 'var(--text-faint)',
};

export function MetricCard({ label, value, status }: MetricCardProps): React.JSX.Element {
  const color = status ? STATUS_COLOR[status] : 'var(--border-dim)';

  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: `1px solid ${status ? color : 'var(--border-dim)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 'var(--text-md)',
          color: status ? color : 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}
