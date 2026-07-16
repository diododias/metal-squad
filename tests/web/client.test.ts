// @vitest-environment happy-dom

import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/web/client/App.js';
import { parseHash } from '../../src/web/client/lib/routes.js';
import { ConfigPage } from '../../src/web/client/pages/ConfigPage.js';
import { BoardPage } from '../../src/web/client/pages/BoardPage.js';
import type { MsqWebState, WebSocketClientMessage } from '../../src/web/types.js';
import {
  formatDurationMs,
  formatHeartbeatLine,
  formatPercent,
  formatPublishTarget,
  formatTokens,
  getPublishStatusLabel,
  getRunStatusLabel,
  truncateText,
} from '../../src/web/client/lib/format.js';
import { summarizeTaskRuns } from '../../src/web/client/lib/workflow.js';
import { normalizeLegacyOpencodePayload, type OutputLine } from '../../src/web/client/hooks/useLocalOutput.js';
import { subscriptionKey } from '../../src/web/client/hooks/useWebSocket.js';
import type { RunSummary, TaskRun } from '../../src/db/repo.js';

vi.mock('../../src/web/client/hooks/useWebSocket.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/web/client/hooks/useWebSocket.js')>()),
  useWebSocket: () => ({ send: () => undefined, error: null }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];

const settingsState = {
  runtimeConfig: {
    concurrency: 1,
    toolTimeoutMs: 60_000,
    staleRunThresholdMinutes: 10,
    promptContextCharLimit: 20_000,
    workflow: { autoAdvanceStages: false, pollIntervalMs: 5_000 },
    web: { host: '127.0.0.1', port: 3000, auth: 'none' },
    tools: [
      { id: 'claude', adapter: 'claude', command: 'claude', baseArgs: [], env: {}, versionCheck: ['--version'], capabilities: { model: true, effort: true, thinking: true }, thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 0 },
      { id: 'codex-canary', adapter: 'codex', command: 'codex-canary', baseArgs: [], env: {}, versionCheck: ['--version'], capabilities: { model: true, effort: true, thinking: false }, thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 0 },
    ],
    notifications: { channels: [], events: [] },
    budget: { alertAtPercent: 80, lastResetDate: null },
  },
  backlogSettings: {
    configSources: undefined,
    resolvedDefaults: undefined,
    budget: undefined,
    projectDefaults: {
      tool: 'codex',
      effort: 'medium',
      thinking: 'off',
      skills: ['speckit-specify'],
      stageSkills: { specify: ['speckit-specify'] },
      workflow: {
        mode: 'staged',
        stages: ['specify', 'plan'],
        approvals: { channel: 'telegram', autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
        stepGuidance: {},
      },
    },
  },
  environment: {
    databasePath: '/tmp/msq/app.db',
    databaseSource: 'default',
    dbWritable: true,
    dataDir: '/tmp/msq',
    configDir: '/tmp/config',
    configWritable: true,
  },
  featureCatalog: {},
  skillsCatalog: [],
} as unknown as MsqWebState;

function render(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => {
    roots.forEach((root) => { root.unmount(); });
  });
  roots = [];
  document.body.replaceChildren();
});

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

describe('Settings client surfaces', () => {
  it('keeps the Settings route stable', () => {
    expect(parseHash('#/config')).toEqual({ page: 'config' });
  });

  it('renders the Settings heading and preserves all selectable categories', () => {
    const container = render(React.createElement(ConfigPage, { state: settingsState, isMobile: false, send: () => undefined }));

    expect(container.querySelector('h1')?.textContent).toBe('Settings');
    expect(Array.from(container.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      '[Runtime]',
      'Defaults',
      'Tools',
      'Skills',
      'Notifications',
      'Budget',
    ]);
    expect(container.textContent).toContain('secrets');
    expect(container.textContent).toContain('empty');
  });

  it('renders environment diagnostics without exposing secret values', () => {
    const state = {
      ...settingsState,
      runtimeConfig: {
        ...settingsState.runtimeConfig,
        web: { ...settingsState.runtimeConfig.web, auth: 'token' },
      },
      environment: {
        databasePath: '/tmp/msq/app.db',
        databaseSource: 'override',
        dbWritable: false,
        dataDir: '/tmp/msq',
        configDir: '/tmp/config',
        configWritable: true,
        repoPath: '/repo/metal-squad',
        repoId: 'repo-13',
        version: '1.2.3',
      },
    } as MsqWebState;

    const container = render(React.createElement(ConfigPage, { state, isMobile: false, send: () => undefined }));
    const text = container.textContent ?? '';

    expect(text).toContain('Environment / Sources');
    expect(text).toContain('/tmp/msq/app.db · read-only');
    expect(text).toContain('[override]');
    expect(text).toContain('/tmp/config · writable');
    expect(text).toContain('/repo/metal-squad · repo-13');
    expect(text).toContain('DB (importado via backlog load)');
    expect(text).toContain('127.0.0.1:3000 · token');
    expect(text).toContain('secrets');
    expect(text).toContain('configured');
    expect(text).toContain('1.2.3');
  });

  it('saves only the changed project default through the websocket action', () => {
    const messages: WebSocketClientMessage[] = [];
    const container = render(React.createElement(ConfigPage, {
      state: settingsState,
      isMobile: false,
      send: (message: WebSocketClientMessage) => { messages.push(message); },
    }));

    act(() => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Defaults')?.click();
    });
    const effort = container.querySelector('#defaults-effort') as HTMLSelectElement;
    act(() => {
      effort.value = 'high';
      effort.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save defaults')?.click();
    });

    expect(messages).toEqual([{ type: 'action:updateProjectDefaults', patch: { effort: 'high' } }]);
  });

  it('shows registered tools and sends a complete registry update', () => {
    const messages: WebSocketClientMessage[] = [];
    const container = render(React.createElement(ConfigPage, { state: settingsState, isMobile: false, send: (message: WebSocketClientMessage) => { messages.push(message); } }));
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Tools')?.click(); });
    expect(container.textContent).toContain('Tools registry');
    expect(container.textContent).toContain('claude');
    act(() => { Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'remove')[1]?.click(); });
    expect(messages).toEqual([{ type: 'action:updateToolsRegistry', tools: [settingsState.runtimeConfig.tools[0]] }]);
  });

  it('renders Settings in the main navigation while retaining the config route', () => {
    const container = render(React.createElement(App));

    expect(container.textContent).toContain('Settings');
    expect(parseHash('#/config')).toEqual({ page: 'config' });
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

  it('formats publish status and target from persisted evidence', () => {
    const base = {} as RunSummary;
    expect(getPublishStatusLabel(base)).toBe('—');
    expect(formatPublishTarget(base)).toBe('—');

    const blocked = {
      publishError: 'missing pr',
      branchName: 'feat/test',
    } as RunSummary;
    expect(getPublishStatusLabel(blocked)).toBe('missing evidence');
    expect(formatPublishTarget(blocked)).toBe('feat/test');

    const verified = {
      publishVerified: true,
      prNumber: 42,
      prUrl: 'https://example/pr/42',
    } as RunSummary;
    expect(getPublishStatusLabel(verified)).toBe('verified');
    expect(formatPublishTarget(verified)).toBe('PR #42');
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

describe('BoardPage feature-specific workflows', () => {
  it('renders each TODO and run with only the workflow configured for its feature', () => {
    const state = {
      runs: [
        { runId: 1, featureId: 'feature-a', status: 'running', stage: 'implement', tool: 'codex', totalTokens: 0 },
        { runId: 2, featureId: 'feature-b', status: 'running', stage: 'plan', tool: 'codex', totalTokens: 0 },
      ],
      pendingFeatures: [
        { id: 'feature-todo', title: 'Todo workflow', tool: 'codex', effort: 'high', workflow: { stages: ['draft', 'approve'] } },
      ],
      featureCatalog: {
        'feature-a': { id: 'feature-a', title: 'Feature A', workflow: { stages: ['specify', 'implement'] } },
        'feature-b': { id: 'feature-b', title: 'Feature B', workflow: { stages: ['plan', 'validate'] } },
        'feature-todo': { id: 'feature-todo', title: 'Todo workflow', tool: 'codex', effort: 'high', workflow: { stages: ['draft', 'approve'] } },
      },
    } as unknown as MsqWebState;

    const html = renderToStaticMarkup(createElement(BoardPage, { state, isMobile: false, onOpenRun: () => {}, onOpenBacklogItem: () => {} }));

    expect(html).toContain('✓ specify');
    expect(html).toContain('▸ implement');
    expect(html).toContain('▸ plan');
    expect(html).toContain('· validate');
    expect(html).toContain('· draft');
    expect(html).toContain('· approve');
  });

  it('keeps unknown catalog runs usable without inventing workflow stages', () => {
    const state = {
      runs: [{ runId: 3, featureId: 'unknown-feature', status: 'running', stage: 'implement', tool: 'codex', totalTokens: 0 }],
      pendingFeatures: [],
      featureCatalog: {},
    } as unknown as MsqWebState;

    const html = renderToStaticMarkup(createElement(BoardPage, { state, isMobile: false, onOpenRun: () => {}, onOpenBacklogItem: () => {} }));

    expect(html).toContain('IN PROGRESS / BLOCKED (1)');
    expect(html).not.toContain('▸ implement');
  });

  it('preserves an explicit empty configured workflow without rendering fallback stages', () => {
    const state = {
      runs: [{ runId: 4, featureId: 'empty-workflow', status: 'running', stage: 'implement', tool: 'codex', totalTokens: 0 }],
      pendingFeatures: [],
      featureCatalog: {
        'empty-workflow': { id: 'empty-workflow', title: 'Empty workflow', workflow: { stages: [] } },
      },
    } as unknown as MsqWebState;

    const html = renderToStaticMarkup(createElement(BoardPage, { state, isMobile: false, onOpenRun: () => {}, onOpenBacklogItem: () => {} }));

    expect(html).toContain('Empty workflow');
    expect(html).not.toContain('▸ implement');
  });
});
