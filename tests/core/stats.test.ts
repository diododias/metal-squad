import { describe, expect, it } from 'vitest';
import {
  aggregateTokens,
  computeRunBreakdown,
  computeStats,
  formatBreakdown,
  formatDurationMs,
  formatTokensCompact,
  renderUsageBar,
} from '../../src/core/stats.js';
import { parsePeriodDays } from '../../src/commands/stats.js';
import type { RunEventRow, StatsRunRow } from '../../src/db/repo.js';

const run = (overrides: Partial<StatsRunRow>): StatsRunRow => ({
  id: 1,
  repoId: 'repo-1',
  featureId: 'feat-1',
  tool: 'claude',
  status: 'done',
  startedAt: '2026-07-06 10:00:00',
  endedAt: '2026-07-06 10:04:00',
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

describe('computeStats', () => {
  it('aggregates runs, tokens, duration and success rate', () => {
    const rows = [
      run({ id: 1, status: 'done' }),
      run({ id: 2, status: 'failed', featureId: 'feat-2', endedAt: '2026-07-06 10:02:00' }),
      run({ id: 3, status: 'running', endedAt: null, inputTokens: null, outputTokens: null, totalTokens: null }),
    ];
    const stats = computeStats(rows);

    expect(stats.runs).toMatchObject({ total: 3, done: 1, failed: 1, running: 1 });
    expect(stats.tokens.total).toBe(3000);
    expect(stats.tokens.input).toBe(2000);
    expect(stats.tokens.output).toBe(1000);
    expect(stats.successRatePercent).toBe(50);
    expect(stats.topFeaturesByTokens[0]?.featureId).toBe('feat-1');
    expect(stats.topFeaturesByTokens[0]?.runs).toBe(2);
  });

  it('handles empty input', () => {
    const stats = computeStats([]);
    expect(stats.runs.total).toBe(0);
    expect(stats.avgDurationMs).toBeNull();
    expect(stats.successRatePercent).toBeNull();
    expect(stats.topFeaturesByTokens).toEqual([]);
  });
});

describe('computeRunBreakdown', () => {
  it('splits wall time into agent, gate wait and retry wait', () => {
    const events = [
      event('started', '2026-07-06 10:00:00'),
      event('gate_wait', '2026-07-06 10:01:00', { gateId: 5 }),
      event('gate_resolved', '2026-07-06 10:02:00', { gateId: 5 }),
      event('retry', '2026-07-06 10:02:30', { attempt: 1, waitMs: 10_000 }),
      event('done', '2026-07-06 10:04:00'),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:04:00');

    expect(breakdown.wallMs).toBe(240_000);
    expect(breakdown.gateWaitMs).toBe(60_000);
    expect(breakdown.retryWaitMs).toBe(10_000);
    expect(breakdown.retryCount).toBe(1);
    expect(breakdown.agentMs).toBe(170_000);
  });

  it('counts unresolved gates until the run end', () => {
    const events = [
      event('gate_wait', '2026-07-06 10:03:00', { gateId: 9 }),
    ];
    const breakdown = computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:05:00');
    expect(breakdown.gateWaitMs).toBe(120_000);
  });

  it('returns null wall time for unparseable timestamps', () => {
    const breakdown = computeRunBreakdown([], 'not-a-date', null);
    expect(breakdown.wallMs).toBeNull();
    expect(breakdown.agentMs).toBeNull();
  });

  it('formats a human-readable breakdown', () => {
    const events = [
      event('gate_wait', '2026-07-06 10:01:00', { gateId: 5 }),
      event('gate_resolved', '2026-07-06 10:02:00', { gateId: 5 }),
    ];
    const text = formatBreakdown(
      computeRunBreakdown(events, '2026-07-06 10:00:00', '2026-07-06 10:04:00'),
    );
    expect(text).toContain('total 4m0s');
    expect(text).toContain('Agent: 3m0s (75%)');
    expect(text).toContain('Gate wait: 1m0s (25%)');
  });
});

describe('formatters', () => {
  it('formats durations', () => {
    expect(formatDurationMs(null)).toBe('—');
    expect(formatDurationMs(45_000)).toBe('45s');
    expect(formatDurationMs(272_000)).toBe('4m32s');
    expect(formatDurationMs(3_900_000)).toBe('1h5m');
  });

  it('formats token counts', () => {
    expect(formatTokensCompact(500)).toBe('500');
    expect(formatTokensCompact(346_300)).toBe('346.3k');
    expect(formatTokensCompact(2_500_000)).toBe('2.5M');
  });
});

describe('parsePeriodDays', () => {
  it('parses days, hours and weeks', () => {
    expect(parsePeriodDays('7d')).toBe(7);
    expect(parsePeriodDays('24h')).toBe(1);
    expect(parsePeriodDays('2w')).toBe(14);
  });

  it('rejects invalid formats', () => {
    expect(() => parsePeriodDays('abc')).toThrow(/Invalid --period/);
    expect(() => parsePeriodDays('7m')).toThrow(/Invalid --period/);
  });
});

describe('aggregateTokens', () => {
  const rows: StatsRunRow[] = [
    run({ id: 1, repoId: 'repo-1', tool: 'claude', featureId: 'feat-1', status: 'done', inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }),
    run({ id: 2, repoId: 'repo-1', tool: 'codex', featureId: 'feat-2', status: 'failed', inputTokens: 2000, cachedInputTokens: 0, outputTokens: 1000, totalTokens: 3000 }),
    run({ id: 3, repoId: 'repo-1', tool: 'claude', featureId: 'feat-1', status: 'done', inputTokens: 500, outputTokens: 500, totalTokens: 1000 }),
  ];

  it('aggregates by repo/tool, feature and status', () => {
    const agg = aggregateTokens(rows);
    expect(agg.totalTokens).toBe(5500);
    const repoClaude = agg.byRepoTool.find((line) => line.tool === 'claude');
    expect(repoClaude).toMatchObject({ repoId: 'repo-1', runs: 2, tokens: 2500 });
    const feat1 = agg.byFeature.find((line) => line.featureId === 'feat-1');
    expect(feat1).toMatchObject({ runs: 2, tokens: 2500 });
    const failed = agg.byStatus.find((line) => line.status === 'failed');
    expect(failed).toMatchObject({ runs: 1, tokens: 3000 });
  });

  it('handles empty rows', () => {
    const agg = aggregateTokens([]);
    expect(agg.totalTokens).toBe(0);
    expect(agg.byFeature).toEqual([]);
  });
});

describe('renderUsageBar', () => {
  it('renders proportional filled bars', () => {
    expect(renderUsageBar(0, 100, 10)).toBe('░'.repeat(10));
    expect(renderUsageBar(100, 100, 10)).toBe('█'.repeat(10));
    expect(renderUsageBar(50, 100, 10)).toBe('█'.repeat(5) + '░'.repeat(5));
  });

  it('is safe when max is zero', () => {
    expect(renderUsageBar(5, 0, 8)).toBe('░'.repeat(8));
  });
});
