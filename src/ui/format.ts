import type { RunSummary } from '../db/repo.js';

export { PRICING, estimateCost } from '../core/budget/pricing.js';

export type LayoutMode = 'stacked' | 'compact' | 'full';
type RunStatus = RunSummary['status'];

export const STATUS_ICON: Record<RunStatus, string> = {
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '⊘',
  aborted: '■',
};

export const STATUS_COLOR: Record<RunStatus, string> = {
  running: 'cyan',
  done: 'green',
  failed: 'red',
  blocked: 'yellow',
  aborted: 'magenta',
};

export function formatElapsed(startedAt: string, endedAt: string | null): string {
  const start = parseTimestampMs(startedAt);
  if (start === null) return '—';
  const end = endedAt ? parseTimestampMs(endedAt) : Date.now();
  const secs = Math.max(0, Math.floor(((end ?? Date.now()) - start) / 1000));
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
  const ms = parseTimestampMs(iso);
  if (ms === null) return '--:--';
  return new Date(ms).toISOString().slice(11, 16);
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

export function formatCost(cost: number | null): string {
  if (cost === null) return '—';
  if (cost < 0.001) return '<$0.001';
  return `~$${cost.toFixed(3)}`;
}

export function formatTokensIO(
  input: number | null,
  cachedInput: number | null,
  output: number | null,
): string {
  if (input === null && cachedInput === null && output === null) return '—';
  const parts = [
    `${input !== null ? formatTokens(input) : '?'} in`,
  ];
  if ((cachedInput ?? 0) > 0) {
    parts.push(`${formatTokens(cachedInput ?? 0)} cache`);
  }
  parts.push(`${output !== null ? formatTokens(output) : '?'}out`);
  return parts.join('/');
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
