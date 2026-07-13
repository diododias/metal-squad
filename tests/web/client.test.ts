import { describe, expect, it } from 'vitest';
import { parseHash } from '../../src/web/client/lib/routes.js';
import { formatDurationMs, formatPercent, formatTokens, truncateText, formatHeartbeatLine, getRunStatusLabel } from '../../src/web/client/lib/format.js';
import { summarizeTaskRuns } from '../../src/web/client/lib/workflow.js';
import { normalizeLegacyOpencodePayload, type OutputLine } from '../../src/web/client/hooks/useLocalOutput.js';
import { subscriptionKey } from '../../src/web/client/hooks/useWebSocket.js';
import type { RunSummary, TaskRun } from '../../src/db/repo.js';

describe('parseHash', () => {
  it('maps hashes to routes', () => {
    expect(parseHash('')).toEqual({ page: 'board' });
    expect(parseHash('#/board')).toEqual({ page: 'board' });
    expect(parseHash('#/runs')).toEqual({ page: 'runs' });
    expect(parseHash('#/runs/feat-1')).toEqual({ page: 'run-detail', featureId: 'feat-1' });
    expect(parseHash('#/backlog/feat-2')).toEqual({ page: 'backlog-detail', featureId: 'feat-2' });
    expect(parseHash('#/gates')).toEqual({ page: 'gates' });
    expect(parseHash('#/analytics')).toEqual({ page: 'analytics' });
    expect(parseHash('#/config')).toEqual({ page: 'config' });
  });

  it('falls back to board for unknown hashes', () => {
    expect(parseHash('#/nope')).toEqual({ page: 'board' });
  });
});

describe('format helpers', () => {
  it('formats tokens with k suffix from 1000 up', () => {
    expect(formatTokens(null)).toBe('—');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1500)).toBe('1.5k');
  });

  it('formats percentages and rejects non-finite values', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
    expect(formatPercent(42)).toBe('42%');
    expect(formatPercent(42.34)).toBe('42.3%');
  });

  it('formats durations across units', () => {
    expect(formatDurationMs(null)).toBe('—');
    expect(formatDurationMs(45_000)).toBe('45s');
    expect(formatDurationMs(90_000)).toBe('1m30s');
    expect(formatDurationMs(3_720_000)).toBe('1h2m');
  });

  it('truncates long text with ellipsis', () => {
    expect(truncateText('short', 10)).toBe('short');
    expect(truncateText('a-very-long-line', 10)).toBe('a-very-...');
  });

  it('reduces msq heartbeat lines to their suffix', () => {
    expect(formatHeartbeatLine('[msq] codex running for 12s (stdout 10B stderr 0B idle 3s) building', 80)).toBe('building');
    expect(formatHeartbeatLine('[msq] codex running for 12s (stdout 10B stderr 0B idle 3s)', 80)).toBe('thinking...');
    expect(formatHeartbeatLine('regular output line', 80)).toBe('regular output line');
  });

  it('derives run status labels from pending stage requests', () => {
    const base = { pendingStageRequestKind: null, pipelineStatus: null, rawStatus: 'running', status: 'running' } as unknown as RunSummary;
    expect(getRunStatusLabel(base)).toBe('running');
    expect(getRunStatusLabel({ ...base, pendingStageRequestKind: 'approval' } as RunSummary)).toBe('awaiting approval');
    expect(getRunStatusLabel({ ...base, pendingStageRequestKind: 'input' } as RunSummary)).toBe('awaiting input');
    expect(getRunStatusLabel({ ...base, pipelineStatus: 'running', rawStatus: 'done' } as RunSummary)).toBe('advancing');
  });
});

describe('summarizeTaskRuns', () => {
  const task = (overrides: Partial<TaskRun>): TaskRun =>
    ({
      id: 1,
      title: 'task',
      stage: 'implement',
      status: 'pending',
      startedAt: null,
      totalTokens: null,
      contextWindowPercent: null,
      ...overrides,
    }) as TaskRun;

  it('groups by stage in workflow order and aggregates counters', () => {
    const groups = summarizeTaskRuns([
      task({ id: 1, stage: 'implement', status: 'done', totalTokens: 100 }),
      task({ id: 2, stage: 'specify', status: 'running', totalTokens: 50, contextWindowPercent: 20 }),
      task({ id: 3, stage: 'implement', status: 'failed', totalTokens: 25, contextWindowPercent: 60 }),
    ]);

    expect(groups.map((g) => g.stage)).toEqual(['specify', 'implement']);
    const implement = groups[1];
    expect(implement?.total).toBe(2);
    expect(implement?.done).toBe(1);
    expect(implement?.failed).toBe(1);
    expect(implement?.totalTokens).toBe(125);
    expect(implement?.maxContextPercent).toBe(60);
    // failed sorts before done within a stage
    expect(implement?.tasks.map((t) => t.id)).toEqual([3, 1]);
  });

  it('puts unknown stages after the declared workflow stages', () => {
    const groups = summarizeTaskRuns(
      [task({ id: 1, stage: 'custom' }), task({ id: 2, stage: 'plan' })],
      ['specify', 'plan'],
    );
    expect(groups.map((g) => g.stage)).toEqual(['plan', 'custom']);
  });
});

describe('normalizeLegacyOpencodePayload', () => {
  const line = (overrides: Partial<OutputLine>): OutputLine => ({ runId: 1, line: '', tool: 'opencode', ...overrides });

  it('passes through non-opencode and non-json payloads unchanged', () => {
    const claude = line({ tool: 'claude', line: 'hello' });
    expect(normalizeLegacyOpencodePayload(claude)).toBe(claude);
    const plain = line({ line: 'plain text' });
    expect(normalizeLegacyOpencodePayload(plain)).toBe(plain);
  });

  it('maps legacy json events to agent/tool lines', () => {
    expect(normalizeLegacyOpencodePayload(line({ line: '{"type":"tool_use","tool":"bash"}' }))).toMatchObject({ source: 'tool', line: 'tool bash' });
    expect(normalizeLegacyOpencodePayload(line({ line: '{"type":"text","text":"hi"}' }))).toMatchObject({ source: 'agent', line: 'hi' });
    expect(normalizeLegacyOpencodePayload(line({ line: '{"type":"thinking","reasoning":"hmm"}' }))).toMatchObject({ source: 'agent', line: '[thinking] hmm' });
  });

  it('drops step markers and empty events', () => {
    expect(normalizeLegacyOpencodePayload(line({ line: '{"type":"step_start"}' }))).toBeNull();
    expect(normalizeLegacyOpencodePayload(line({ line: '{"type":"step_finish"}' }))).toBeNull();
    expect(normalizeLegacyOpencodePayload(line({ line: '{"type":"text"}' }))).toBeNull();
    expect(normalizeLegacyOpencodePayload(line({ line: '{"type":"tool_use"}' }))).toBeNull();
  });
});

describe('subscriptionKey', () => {
  it('pairs subscribe and unsubscribe messages under the same key', () => {
    expect(subscriptionKey({ type: 'subscribe:output', runId: 7 })).toBe('output:7');
    expect(subscriptionKey({ type: 'unsubscribe:output', runId: 7 })).toBe('output:7');
    expect(subscriptionKey({ type: 'subscribe:runHistory', featureId: 'feat-1' })).toBe('runHistory:feat-1');
    expect(subscriptionKey({ type: 'unsubscribe:runHistory', featureId: 'feat-1' })).toBe('runHistory:feat-1');
  });

  it('returns null for non-subscription messages', () => {
    expect(subscriptionKey({ type: 'auth', token: 't' })).toBeNull();
    expect(subscriptionKey({ type: 'action:startFeature', featureId: 'feat-1' })).toBeNull();
  });
});
