import React from 'react';

export type PillStatus = 'running' | 'done' | 'failed' | 'blocked' | 'aborted';

export interface StatusPillProps {
  status: PillStatus | (string & {});
  label?: string;
  /** Animated spinner replaces the static icon while running (default on). */
  spinner?: boolean;
}

const ICON: Record<string, string> = { running: '⟳', done: '✓', failed: '✗', blocked: '⊘', aborted: '■' };
const COLOR: Record<string, string> = {
  running: 'var(--accent-info)',
  done: 'var(--accent-ok)',
  failed: 'var(--accent-danger)',
  blocked: 'var(--accent-warn)',
  aborted: 'var(--text-dim)',
};
const BG: Record<string, string> = {
  running: 'var(--accent-info-10)',
  done: 'var(--accent-ok-10)',
  failed: 'var(--accent-danger-10)',
  blocked: 'var(--accent-warn-10)',
  aborted: 'transparent',
};

export function StatusPill({ status, label, spinner = true }: StatusPillProps): React.JSX.Element {
  const color = COLOR[status] ?? 'var(--text-dim)';
  const showSpinner = spinner && status === 'running';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        padding: '3px 9px',
        borderRadius: 'var(--radius-pill)',
        border: `1px solid ${color}`,
        background: BG[status] ?? 'transparent',
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {showSpinner ? <span aria-hidden="true" className="msq-status-spinner" /> : (ICON[status] ?? '·')} {label ?? status}
    </span>
  );
}
