import type { RunSummary } from '../db/repo.js';

export type LayoutMode = 'stacked' | 'compact' | 'full';
type RunStatus = RunSummary['status'];

export const STATUS_ICON: Record<RunStatus, string> = {
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '⊘',
};

export const STATUS_COLOR: Record<RunStatus, string> = {
  running: 'cyan',
  done: 'green',
  failed: 'red',
  blocked: 'yellow',
};

export function formatElapsed(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const secs = Math.floor((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m${secs % 60}s`;
}

export function formatTokens(total: number | null): string {
  if (total === null) return '—';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

export function formatClock(iso: string | null): string {
  if (!iso) return '--:--';
  const [, time = '--:--'] = iso.split('T');
  return time.slice(0, 5);
}

export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
}

export function getLayoutMode(width: number): LayoutMode {
  if (width < 80) return 'stacked';
  if (width < 120) return 'compact';
  return 'full';
}
