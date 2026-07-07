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

// Prices in USD per 1M tokens
export const PRICING: Record<string, { input: number; output: number }> = {
  'claude': { input: 3, output: 15 },
  'claude-opus': { input: 15, output: 75 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'codex': { input: 5, output: 15 },
  'opencode': { input: 3, output: 15 },
};

export function estimateCost(
  inputTokens: number | null,
  outputTokens: number | null,
  tool: string,
): number | null {
  if (inputTokens === null && outputTokens === null) return null;
  const pricing = PRICING[tool] ?? { input: 3, output: 15 };
  const i = inputTokens ?? 0;
  const o = outputTokens ?? 0;
  return (i * pricing.input + o * pricing.output) / 1_000_000;
}

export function formatCost(cost: number | null): string {
  if (cost === null) return '—';
  if (cost < 0.001) return '<$0.001';
  return `~$${cost.toFixed(3)}`;
}

export function formatTokensIO(
  input: number | null,
  output: number | null,
): string {
  if (input === null && output === null) return '—';
  const i = input !== null ? formatTokens(input) : '?';
  const o = output !== null ? formatTokens(output) : '?';
  return `${i}in/${o}out`;
}
