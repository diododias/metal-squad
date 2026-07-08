import { describe, expect, it } from 'vitest';
import {
  aggregateCosts,
  computeRunBreakdown,
  computeStats,
  formatBreakdown,
  formatDurationMs,
  formatTokensCompact,
  renderUsageBar,
} from '../../src/core/stats.js';
import type { RunEventRow, StatsRunRow } from '../../src/db/repo.js';

const run = (overrides: Partial<StatsRunRow>): StatsRunRow => ({
  id: 1,
  repoId: 'repo-1',
  featureId: 'feat-1',
  tool: 'claude',
  status: 'done',
  startedAt: '2026-07-06 10:00:00',
  endedAt: '2026-07-06 10:01:00',
  inputTokens: 1000,
  cachedInputTokens: null,
  outputTokens: 500,
  totalTokens: 1500,
  ...overrides,
});

const event = (
  eventName: string,
  createdAt: string,
  metadata: Record<string, unknown> | null = null,
): RunEventRow => ({
  id: 1,
  runId: 1,
  event: eventName,
  metadata,
  createdAt,
});

describe('formatDurationMs — boundary cases', () => {
  it('returns "0s" for 0ms', () => {
    expect(formatDurationMs(0)).toBe('0s');
  });

  it('returns "59s" for 59000ms (just below 60s boundary)', () => {
    expect(formatDurationMs(59_000)).toBe('59s');
  });

  it('returns "1m0s" for exactly 60000ms (60s boundary)', () => {
    expect(formatDurationMs(60_000)).toBe('1m0s');
  });

  it('returns "59m59s" for 3599000ms (just below 60m boundary)', () => {
    expect(formatDurationMs(3_599_000)).toBe('59m59s');
  });

  it('returns "1h0m" for exactly 3600000ms (60m boundary)', () => {
    expect(formatDurationMs(3_600_000)).toBe('1h0m');
  });

  it('returns "2h30m" for 2.5 hours', () => {
    expect(formatDurationMs(9_000_000)).toBe('2h30m');
  });

  it('returns "—" for null', () => {
    expect(formatDurationMs(null)).toBe('—');
  });

  it('clamps negative ms to 0s', () => {
    expect(formatDurationMs(-1000)).toBe('0s');
  });
});

describe('formatTokensCompact — boundary cases', () => {
  it('returns raw string for 0', () => {
    expect(formatTokensCompact(0)).toBe('0');
  });

  it('returns raw string for 999', () => {
    expect(formatTokensCompact(999)).toBe('999');
  });

  it('returns "1.0k" for exactly 1000', () => {
    expect(formatTokensCompact(1000)).toBe('1.0k');
  });

  it('returns "1.5k" for 1500', () => {
    expect(formatTokensCompact(1500)).toBe('1.5k');
  });

  it('returns "999.9k" for 999900', () => {
    expect(formatTokensCompact(999_900)).toBe('999.9k');
  });

  it('returns "1.0M" for exactly 1000000', () => {
    expect(formatTokensCompact(1_000_000)).toBe('1.0M');
  });

  it('returns "10.0M" for 10000000', () => {
    expect(formatTokensCompact(10_000_000)).toBe('10.0M');
  });
});

describe('computeStats — edge cases', () => {
  it('returns successRatePercent null when only running runs (no finished)', () => {
    const rows = [
      run({ status: 'running', endedAt: null }),
    ];
    const stats = computeStats(rows);
    expect(stats.successRatePercent).toBeNull();
  });

  it('returns avgDurationMs null when no run has valid timestamps', () => {
    const rows = [
      run({ startedAt: 'bad', endedAt: null }),
    ];
    const stats = computeStats(rows);
    expect(stats.avgDurationMs).toBeNull();
  });

  it('counts aborted runs in finished for success rate', () => {
    const rows = [
      run({ status: 'done' }),
      run({ id: 2, status: 'aborted', featureId: 'feat-2' }),
    ];
    const stats = computeStats(rows);
    // 1 done / (1 done + 1 aborted) = 50%
    expect(stats.successRatePercent).toBe(50);
    expect(stats.runs.aborted).toBe(1);
  });

  it('counts blocked runs separately (not in finished)', () => {
    const rows = [
      run({ status: 'blocked' }),
    ];
    const stats = computeStats(rows);
    expect(stats.runs.blocked).toBe(1);
    expect(stats.successRatePercent).toBeNull();
  });

  it('accumulates cachedInput tokens', () => {
    const rows = [
      run({ cachedInputTokens: 200 }),
      run({ id: 2, cachedInputTokens: 300, featureId: 'feat-2' }),
    ];
    const stats = computeStats(rows);
    expect(stats.tokens.cachedInput).toBe(500);
  });

  it('handles null token fields without crashing', () => {
    const rows = [
      run({ inputTokens: null, outputTokens: null, totalTokens: null }),
    ];
    const stats = computeStats(rows);
    expect(stats.tokens.total).toBe(0);
    expect(stats.tokens.input).toBe(0);
    expect(stats.tokens.output).toBe(0);
  });

  it('computes avgDurationMs as average over valid-duration runs', () => {
    const rows = [
      run({ startedAt: '2026-07-06 10:00:00', endedAt: '2026-07-06 10:01:00' }), // 60s
      run({ id: 2, featureId: 'feat-2', startedAt: '2026-07-06 10:00:00', endedAt: '2026-07-06 10:03:00' }), // 180s
    ];
    const stats = computeStats(rows);
    expect(stats.avgDurationMs).toBe(120_000); // (60+180)/2 * 1000
  });

  it('limits topFeaturesByCost to topN (default 5)', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      run({ id: i + 1, featureId: `feat-${i}` }),
    );
    const stats = computeStats(rows);
    expect(stats.topFeaturesByCost).toHaveLength(5);
  });

  it('respects custom topN parameter', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      run({ id: i + 1, featureId: `feat-${i}` }),
    );
    const stats = computeStats(rows, 3);
    expect(stats.topFeaturesByCost).toHaveLength(3);
  });

  it('returns successRatePercent 100 when all done', () => {
    const rows = [
      run({ status: 'done' }),
      run({ id: 2, featureId: 'feat-2', status: 'done' }),
    ];
    const stats = computeStats(rows);
    expect(stats.successRatePercent).toBe(100);
  });

  it('returns successRatePercent 0 when all failed', () => {
    const rows = [
      run({ status: 'failed' }),
      run({ id: 2, featureId: 'feat-2', status: 'failed' }),
    ];
    const stats = computeStats(rows);
    expect(stats.successRatePercent).toBe(0);
  });
});

describe('computeRunBreakdown — edge cases', () => {
  it('sums multiple retry waitMs values', () => {
    const events = [
      event('retry', '2026-07-06 10:01:00', { attempt: 1, waitMs: 5_000 }),
      event('retry', '2026-07-06 10:02:00', { attempt: 2, waitMs: 10_000 }),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:05:00');
    expect(breakdown.retryCount).toBe(2);
    expect(breakdown.retryWaitMs).toBe(15_000);
  });

  it('ignores non-number waitMs in retry events', () => {
    const events = [
      event('retry', '2026-07-06 10:01:00', { attempt: 1, waitMs: 'not-a-number' }),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:05:00');
    expect(breakdown.retryCount).toBe(1);
    expect(breakdown.retryWaitMs).toBe(0);
  });

  it('ignores gate_resolved without matching gate_wait', () => {
    const events = [
      event('gate_resolved', '2026-07-06 10:02:00', { gateId: 99 }),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:05:00');
    expect(breakdown.gateWaitMs).toBe(0);
  });

  it('handles gate_wait with string-typed gateId in metadata', () => {
    const events = [
      event('gate_wait', '2026-07-06 10:01:00', { gateId: 'my-gate' }),
      event('gate_resolved', '2026-07-06 10:02:00', { gateId: 'my-gate' }),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:05:00');
    // string gateId falls back to 'gate' key, wait = 60s
    expect(breakdown.gateWaitMs).toBe(60_000);
  });

  it('clamps agentMs to 0 when gate+retry exceeds wall time', () => {
    // wallMs=60s, gateWaitMs=90s → agentMs clamped to 0
    const events = [
      event('gate_wait', '2026-07-06 10:00:00', { gateId: 1 }),
      event('gate_resolved', '2026-07-06 10:01:30', { gateId: 1 }),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:01:00');
    expect(breakdown.agentMs).toBe(0);
  });

  it('returns wallMs=null when startedAt is invalid', () => {
    const breakdown = computeRunBreakdown([], 'invalid', '2026-07-06 10:01:00');
    expect(breakdown.wallMs).toBeNull();
    expect(breakdown.agentMs).toBeNull();
  });

  it('returns wallMs=null when endedAt is present but invalid', () => {
    const breakdown = computeRunBreakdown([], '2026-07-06 10:00:00', 'invalid');
    expect(breakdown.wallMs).toBeNull();
  });

  it('handles events with null/undefined metadata gateId (falls back to string key)', () => {
    const events = [
      event('gate_wait', '2026-07-06 10:01:00', {}),
      event('gate_resolved', '2026-07-06 10:02:00', {}),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:05:00');
    expect(breakdown.gateWaitMs).toBe(60_000);
  });

  it('returns retryCount=0 and retryWaitMs=0 when no retry events', () => {
    const breakdown = computeRunBreakdown([], '2026-07-06 10:00:00', '2026-07-06 10:01:00');
    expect(breakdown.retryCount).toBe(0);
    expect(breakdown.retryWaitMs).toBe(0);
  });
});

describe('formatBreakdown — edge cases', () => {
  it('returns empty string when wallMs is null', () => {
    const result = formatBreakdown({ wallMs: null, gateWaitMs: 0, retryWaitMs: 0, agentMs: null, retryCount: 0 });
    expect(result).toBe('');
  });

  it('omits gate wait line when gateWaitMs is 0', () => {
    const result = formatBreakdown({ wallMs: 60_000, gateWaitMs: 0, retryWaitMs: 0, agentMs: 60_000, retryCount: 0 });
    expect(result).not.toContain('Gate wait');
  });

  it('omits retry line when retryCount is 0', () => {
    const result = formatBreakdown({ wallMs: 60_000, gateWaitMs: 0, retryWaitMs: 0, agentMs: 60_000, retryCount: 0 });
    expect(result).not.toContain('Retry');
  });

  it('includes retry line when retryCount > 0', () => {
    const result = formatBreakdown({ wallMs: 120_000, gateWaitMs: 0, retryWaitMs: 10_000, agentMs: 110_000, retryCount: 2 });
    expect(result).toContain('Retry');
    expect(result).toContain('2x');
  });

  it('shows percentage in parentheses', () => {
    const result = formatBreakdown({ wallMs: 100_000, gateWaitMs: 25_000, retryWaitMs: 0, agentMs: 75_000, retryCount: 0 });
    expect(result).toContain('(75%)');
    expect(result).toContain('(25%)');
  });

  it('omits percentage when wallMs is 0', () => {
    const result = formatBreakdown({ wallMs: 0, gateWaitMs: 0, retryWaitMs: 0, agentMs: 0, retryCount: 0 });
    expect(result).not.toContain('%');
  });

  it('includes total duration in first line', () => {
    const result = formatBreakdown({ wallMs: 90_000, gateWaitMs: 0, retryWaitMs: 0, agentMs: 90_000, retryCount: 0 });
    expect(result).toContain('total 1m30s');
  });
});

describe('aggregateCosts — sort orders and edge cases', () => {
  it('sorts byRepoTool by costUsd descending', () => {
    const rows = [
      run({ id: 1, repoId: 'repo-1', tool: 'codex', inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
      run({ id: 2, repoId: 'repo-1', tool: 'claude', inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 }),
    ];
    const agg = aggregateCosts(rows);
    expect(agg.byRepoTool[0]?.tool).toBe('claude');
    expect(agg.byRepoTool[1]?.tool).toBe('codex');
  });

  it('sorts byFeature by tokens descending', () => {
    const rows = [
      run({ id: 1, featureId: 'feat-small', totalTokens: 100 }),
      run({ id: 2, featureId: 'feat-large', totalTokens: 10000 }),
    ];
    const agg = aggregateCosts(rows);
    expect(agg.byFeature[0]?.featureId).toBe('feat-large');
    expect(agg.byFeature[1]?.featureId).toBe('feat-small');
  });

  it('sorts byStatus by costUsd descending', () => {
    const rows = [
      run({ id: 1, status: 'done', inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 }),
      run({ id: 2, status: 'failed', inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
    ];
    const agg = aggregateCosts(rows);
    expect(agg.byStatus[0]?.status).toBe('done');
    expect(agg.byStatus[1]?.status).toBe('failed');
  });

  it('uses totalTokens ?? 0 when totalTokens is null', () => {
    const rows = [run({ totalTokens: null })];
    const agg = aggregateCosts(rows);
    expect(agg.totalTokens).toBe(0);
    expect(agg.byRepoTool[0]?.tokens).toBe(0);
  });

  it('aggregates runs from same repoId+tool into single byRepoTool entry', () => {
    const rows = [
      run({ id: 1, repoId: 'repo-a', tool: 'claude', totalTokens: 1000 }),
      run({ id: 2, repoId: 'repo-a', tool: 'claude', totalTokens: 2000 }),
    ];
    const agg = aggregateCosts(rows);
    expect(agg.byRepoTool).toHaveLength(1);
    expect(agg.byRepoTool[0]?.tokens).toBe(3000);
    expect(agg.byRepoTool[0]?.runs).toBe(2);
  });

  it('separates different tools in same repo into separate byRepoTool entries', () => {
    const rows = [
      run({ id: 1, repoId: 'repo-a', tool: 'claude', totalTokens: 1000 }),
      run({ id: 2, repoId: 'repo-a', tool: 'codex', totalTokens: 2000 }),
    ];
    const agg = aggregateCosts(rows);
    expect(agg.byRepoTool).toHaveLength(2);
  });

  it('accumulates totalCostUsd across all rows', () => {
    const rows = [
      run({ id: 1, inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 }), // $3
      run({ id: 2, featureId: 'feat-2', inputTokens: 0, outputTokens: 1_000_000, totalTokens: 1_000_000 }), // $15
    ];
    const agg = aggregateCosts(rows);
    expect(agg.totalCostUsd).toBeCloseTo(18, 5);
  });
});

describe('renderUsageBar — edge cases', () => {
  it('returns empty string when width is 0', () => {
    expect(renderUsageBar(50, 100, 0)).toBe('');
  });

  it('clamps filled to width when value exceeds max', () => {
    const bar = renderUsageBar(200, 100, 10);
    expect(bar).toBe('█'.repeat(10));
  });

  it('clamps filled to 0 when value is negative', () => {
    const bar = renderUsageBar(-50, 100, 10);
    expect(bar).toBe('░'.repeat(10));
  });

  it('uses default width of 16', () => {
    expect(renderUsageBar(0, 100).length).toBe(16);
  });

  it('produces correct bar at 25%', () => {
    const bar = renderUsageBar(25, 100, 8);
    expect(bar).toBe('██░░░░░░');
  });

  it('produces full bar when value equals max', () => {
    expect(renderUsageBar(7, 7, 7)).toBe('█'.repeat(7));
  });
});
