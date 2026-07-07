import type { RunSummary } from '../db/repo.js';

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

// Prices in USD per 1M tokens.
// Sources: OpenAI API pricing/model pages for GPT-5-Codex, GPT-5, GPT-5.4, and GPT-5.3-Codex.
export const PRICING: Record<string, { input: number; cachedInput?: number; output: number }> = {
  'claude': { input: 3, output: 15 },
  'claude-opus': { input: 15, output: 75 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'codex': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-codex': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5.4': { input: 1.25, cachedInput: 0.125, output: 7.5 },
  'gpt-5.4-mini': { input: 0.375, cachedInput: 0.0375, output: 2.25 },
  'gpt-5.4-nano': { input: 0.10, cachedInput: 0.01, output: 0.625 },
  'opencode': { input: 3, output: 15 },
};

export function estimateCost(
  inputTokens: number | null,
  cachedInputTokens: number | null,
  outputTokens: number | null,
  modelOrTool: string,
): number | null {
  if (inputTokens === null && cachedInputTokens === null && outputTokens === null) return null;
  const pricing = resolvePricing(modelOrTool);
  const i = inputTokens ?? 0;
  const c = cachedInputTokens ?? 0;
  const o = outputTokens ?? 0;
  return (i * pricing.input + c * (pricing.cachedInput ?? pricing.input) + o * pricing.output) / 1_000_000;
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

function resolvePricing(modelOrTool: string): { input: number; cachedInput?: number; output: number } {
  const key = modelOrTool.toLowerCase();
  const exact = PRICING[key];
  if (exact) return exact;
  const entries = [
    'gpt-5.3-codex',
    'gpt-5-codex',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.4',
    'gpt-5-mini',
    'gpt-5',
    'claude-opus',
    'claude-sonnet',
    'claude-haiku',
  ] as const;
  for (const candidate of entries) {
    if (key.includes(candidate)) return PRICING[candidate]!;
  }
  if (key.includes('claude')) return PRICING.claude!;
  if (key.includes('codex')) return PRICING.codex!;
  if (key.includes('opencode')) return PRICING.opencode!;
  return { input: 3, output: 15 };
}
