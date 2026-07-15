import React from 'react';
import { formatDurationMs } from '../../lib/format.js';
import type { SessionStatusSnapshot } from '../../../../core/adapters/types.js';

const LABELS: Record<SessionStatusSnapshot['status'], string> = {
  running: 'Running',
  idle: 'Idle / Waiting',
  interrupted: 'Interrupted',
  failed: 'Failed',
  timed_out: 'Timed out',
  completed: 'Completed',
};

export interface RunStatusIndicatorProps {
  status: SessionStatusSnapshot | null | undefined;
  fallbackStatus?: string;
  spinnerEnabled?: boolean;
}

export function RunStatusIndicator({ status, fallbackStatus, spinnerEnabled = true }: RunStatusIndicatorProps): React.JSX.Element {
  const currentStatus = status?.status;
  const label = currentStatus ? LABELS[currentStatus] : fallbackStatus ?? 'Unknown';
  const elapsedMs = status
    ? status.terminal ? status.elapsedMs : Math.max(status.elapsedMs, Date.now() - Date.parse(status.startedAt))
    : null;
  const idleMs = status?.status === 'idle'
    ? Math.max(status.idleMs ?? 0, Date.now() - Date.parse(status.updatedAt))
    : null;
  const showSpinner = spinnerEnabled && currentStatus === 'running';

  return (
    <div
      role="status"
      aria-live="polite"
      data-status={currentStatus ?? fallbackStatus ?? 'unknown'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: currentStatus === 'failed' || currentStatus === 'timed_out' ? 'var(--accent-danger)' : currentStatus === 'completed' ? 'var(--accent-ok)' : 'var(--text-primary)' }}
    >
      {showSpinner && <span aria-hidden="true" className="msq-status-spinner" />}
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
        {formatDurationMs(elapsedMs)}
        {idleMs != null && ` · idle ${formatDurationMs(idleMs)}`}
      </span>
      {status?.reason && <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>{status.reason}</span>}
    </div>
  );
}
