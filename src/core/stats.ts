import type { RunEventRow, StatsRunRow } from '../db/repo.js';

export interface RunStats {
  runs: {
    total: number;
    done: number;
    failed: number;
    running: number;
    blocked: number;
    aborted: number;
  };
  tokens: {
    total: number;
    input: number;
    cachedInput: number;
    output: number;
  };
  context: {
    avgPercent: number | null;
    maxPercent: number | null;
  };
  avgDurationMs: number | null;
  successRatePercent: number | null;
  topFeaturesByTokens: { featureId: string; tokens: number; runs: number }[];
}

export function computeStats(rows: StatsRunRow[], topN = 5): RunStats {
  const runs = { total: rows.length, done: 0, failed: 0, running: 0, blocked: 0, aborted: 0 };
  const tokens = { total: 0, input: 0, cachedInput: 0, output: 0 };
  let contextPercentTotal = 0;
  let contextPercentCount = 0;
  let contextPercentMax: number | null = null;
  let durationTotal = 0;
  let durationCount = 0;
  const byFeature = new Map<string, { tokens: number; runs: number }>();

  for (const row of rows) {
    if (row.status in runs) runs[row.status as keyof typeof runs] += 1;
    const usableTokens = row.dataQuality === undefined || row.dataQuality === 'valid' || row.dataQuality === 'corrected';
    tokens.total += usableTokens ? row.totalTokens ?? 0 : 0;
    tokens.input += usableTokens ? row.inputTokens ?? 0 : 0;
    tokens.cachedInput += usableTokens ? row.cachedInputTokens ?? 0 : 0;
    tokens.output += usableTokens ? row.outputTokens ?? 0 : 0;
    if (row.contextWindowPercent !== null && row.contextWindowPercent !== undefined) {
      contextPercentTotal += row.contextWindowPercent;
      contextPercentCount += 1;
      contextPercentMax = contextPercentMax === null
        ? row.contextWindowPercent
        : Math.max(contextPercentMax, row.contextWindowPercent);
    }

    const feature = byFeature.get(row.featureId) ?? { tokens: 0, runs: 0 };
    feature.tokens += usableTokens ? row.totalTokens ?? 0 : 0;
    feature.runs += 1;
    byFeature.set(row.featureId, feature);

    const duration = durationMs(row.startedAt, row.endedAt);
    if (duration !== null) {
      durationTotal += duration;
      durationCount += 1;
    }
  }

  const finished = runs.done + runs.failed + runs.aborted;
  return {
    runs,
    tokens,
    context: {
      avgPercent: contextPercentCount > 0 ? contextPercentTotal / contextPercentCount : null,
      maxPercent: contextPercentMax,
    },
    avgDurationMs: durationCount > 0 ? durationTotal / durationCount : null,
    successRatePercent: finished > 0 ? Math.round((runs.done / finished) * 100) : null,
    topFeaturesByTokens: [...byFeature.entries()]
      .map(([featureId, entry]) => ({ featureId, ...entry }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, topN),
  };
}

export interface RunBreakdown {
  wallMs: number | null;
  gateWaitMs: number;
  retryWaitMs: number;
  agentMs: number | null;
  retryCount: number;
}

/**
 * Deriva o breakdown de tempo a partir da timeline de eventos do run.
 * Gate wait soma gate_wait -> gate_resolved; retry wait usa o backoff
 * registrado; agent time eh o restante do wall time.
 */
export function computeRunBreakdown(
  events: RunEventRow[],
  startedAt: string,
  endedAt: string | null,
): RunBreakdown {
  const wallMs = durationMs(startedAt, endedAt);

  let gateWaitMs = 0;
  const pendingGateWaits = new Map<number | string, number>();
  let retryWaitMs = 0;
  let retryCount = 0;

  for (const event of events) {
    const at = parseTimestampMs(event.createdAt);
    if (event.event === 'gate_wait' && at !== null) {
      pendingGateWaits.set(gateKey(event), at);
    } else if (event.event === 'gate_resolved' && at !== null) {
      const startedWait = pendingGateWaits.get(gateKey(event));
      if (startedWait !== undefined) {
        gateWaitMs += Math.max(0, at - startedWait);
        pendingGateWaits.delete(gateKey(event));
      }
    } else if (event.event === 'retry') {
      retryCount += 1;
      const waitMs = event.metadata?.waitMs;
      if (typeof waitMs === 'number') retryWaitMs += waitMs;
    }
  }

  // gates ainda abertos contam ate o fim do run (ou agora, se em andamento)
  const endMs = endedAt ? parseTimestampMs(endedAt) : Date.now();
  if (endMs !== null) {
    for (const startedWait of pendingGateWaits.values()) {
      gateWaitMs += Math.max(0, endMs - startedWait);
    }
  }

  const agentMs = wallMs !== null ? Math.max(0, wallMs - gateWaitMs - retryWaitMs) : null;
  return { wallMs, gateWaitMs, retryWaitMs, agentMs, retryCount };
}

export function formatBreakdown(breakdown: RunBreakdown): string {
  if (breakdown.wallMs === null) return '';
  const percent = (part: number): string =>
    breakdown.wallMs && breakdown.wallMs > 0
    ? ` (${String(Math.round((part / breakdown.wallMs) * 100))}%)`
    : '';
  const lines = [
    `total ${formatDurationMs(breakdown.wallMs)}`,
    `  Agent: ${formatDurationMs(breakdown.agentMs ?? 0)}${percent(breakdown.agentMs ?? 0)}`,
  ];
  if (breakdown.gateWaitMs > 0) {
    lines.push(`  Gate wait: ${formatDurationMs(breakdown.gateWaitMs)}${percent(breakdown.gateWaitMs)}`);
  }
  if (breakdown.retryCount > 0) {
    lines.push(`  Retry: ${formatDurationMs(breakdown.retryWaitMs)}${percent(breakdown.retryWaitMs)} (${String(breakdown.retryCount)}x)`);
  }
  return lines.join('\n');
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—';
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${String(secs)}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${String(mins)}m${String(secs % 60)}s`;
  const hours = Math.floor(mins / 60);
  return `${String(hours)}h${String(mins % 60)}m`;
}

export function formatTokensCompact(total: number): string {
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

/** Returns the nearest-rank percentile. Invalid values are deliberately
 * ignored: callers can retain their count as a data-quality signal without
 * allowing unknown telemetry to distort a comparison baseline. */
export function percentile(values: readonly number[], percent: number): number | null {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const rank = Math.max(1, Math.min(valid.length, Math.ceil((percent / 100) * valid.length)));
  return valid[rank - 1] ?? null;
}

export interface TokenBaseline {
  count: number;
  average: number | null;
  p95: number | null;
  p99: number | null;
}

export function computeTokenBaseline(values: readonly number[]): TokenBaseline {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    count: valid.length,
    average: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null,
    p95: percentile(valid, 95),
    p99: percentile(valid, 99),
  };
}

export function isTokenOutlier(value: number, baseline: TokenBaseline): boolean {
  return Number.isFinite(value) && baseline.p95 !== null && value >= baseline.p95 && value > (baseline.average ?? 0);
}

function gateKey(event: RunEventRow): number | string {
  const gateId = event.metadata?.gateId;
  return typeof gateId === 'number' ? gateId : 'gate';
}

function durationMs(startedAt: string, endedAt: string | null): number | null {
  const start = parseTimestampMs(startedAt);
  if (start === null) return null;
  const end = endedAt ? parseTimestampMs(endedAt) : null;
  if (endedAt && end === null) return null;
  return Math.max(0, (end ?? Date.now()) - start);
}

export interface TokenLine {
  tokens: number;
  runs: number;
  maxContextPercent: number | null;
}

export interface TokenAggregates {
  byRepoTool: (TokenLine & { repoId: string; tool: string })[];
  byFeature: (TokenLine & { featureId: string })[];
  byStatus: (TokenLine & { status: string })[];
  totalTokens: number;
}

export function aggregateTokens(rows: StatsRunRow[]): TokenAggregates {
  const byRepoTool = new Map<string, TokenLine & { repoId: string; tool: string }>();
  const byFeature = new Map<string, TokenLine & { featureId: string }>();
  const byStatus = new Map<string, TokenLine & { status: string }>();
  let totalTokens = 0;

  for (const row of rows) {
    const tokens = row.dataQuality === undefined || row.dataQuality === 'valid' || row.dataQuality === 'corrected'
      ? row.totalTokens ?? 0
      : 0;
    totalTokens += tokens;

    const repoToolKey = `${row.repoId} ${row.tool}`;
    const repoTool = byRepoTool.get(repoToolKey)
      ?? { repoId: row.repoId, tool: row.tool, tokens: 0, runs: 0, maxContextPercent: null };
    repoTool.tokens += tokens;
    repoTool.runs += 1;
    repoTool.maxContextPercent = maxContext(repoTool.maxContextPercent, row.contextWindowPercent ?? null);
    byRepoTool.set(repoToolKey, repoTool);

    const feature = byFeature.get(row.featureId)
      ?? { featureId: row.featureId, tokens: 0, runs: 0, maxContextPercent: null };
    feature.tokens += tokens;
    feature.runs += 1;
    feature.maxContextPercent = maxContext(feature.maxContextPercent, row.contextWindowPercent ?? null);
    byFeature.set(row.featureId, feature);

    const status = byStatus.get(row.status)
      ?? { status: row.status, tokens: 0, runs: 0, maxContextPercent: null };
    status.tokens += tokens;
    status.runs += 1;
    status.maxContextPercent = maxContext(status.maxContextPercent, row.contextWindowPercent ?? null);
    byStatus.set(row.status, status);
  }

  return {
    byRepoTool: [...byRepoTool.values()].sort((a, b) => b.tokens - a.tokens),
    byFeature: [...byFeature.values()].sort((a, b) => b.tokens - a.tokens),
    byStatus: [...byStatus.values()].sort((a, b) => b.tokens - a.tokens),
    totalTokens,
  };
}

export function renderUsageBar(value: number, max: number, width = 16): string {
  if (max <= 0 || width <= 0) return '░'.repeat(Math.max(0, width));
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
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

function maxContext(current: number | null, next: number | null): number | null {
  if (next === null) return current;
  return current === null ? next : Math.max(current, next);
}
