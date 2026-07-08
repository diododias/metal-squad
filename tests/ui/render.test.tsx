import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';

import { EmptyState } from '../../src/ui/components/EmptyState.js';
import { CommandBar } from '../../src/ui/components/CommandBar.js';
import { GatePanel } from '../../src/ui/components/GatePanel.js';
import { RunTable } from '../../src/ui/components/RunTable.js';
import { NotificationsFeed } from '../../src/ui/components/NotificationsFeed.js';
import { StatusBar } from '../../src/ui/components/StatusBar.js';
import { CommandPalette } from '../../src/ui/components/CommandPalette.js';
import { ThemeProvider } from '../../src/ui/theme/context.js';
import { resolveThemePreference } from '../../src/ui/theme/resolve.js';
import type { RunSummary } from '../../src/db/repo.js';

afterEach(() => cleanup());

function renderWithTheme(node: React.ReactElement, theme = 'default') {
  return render(
    <ThemeProvider resolution={resolveThemePreference(theme)}>
      {node}
    </ThemeProvider>,
  );
}

// Ink uses useInput to attach stdin listeners; isolate by mocking it where the
// component owns its own input handling (CommandPalette) so tests don't compete
// with the real stdin.
vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return { ...actual, useInput: vi.fn() };
});

const baseRun: RunSummary = {
  runId: 1,
  repoId: 'repo-1',
  featureId: 'feat-1',
  tool: 'claude',
  status: 'running',
  rawStatus: 'running',
  startedAt: '2026-01-01T00:00:00Z',
  endedAt: null,
  totalTokens: null,
  inputTokens: 100,
  cachedInputTokens: null,
  outputTokens: 50,
  gateId: null,
  gateDecision: null,
  pipelineId: null,
  pipelineStatus: null,
  pipelineCurrentStage: null,
  pipelineResumeSummary: null,
  stage: null,
  pendingStageRequestKind: null,
};

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
describe('EmptyState', () => {
  it('renders the idle message', () => {
    const { lastFrame } = renderWithTheme(<EmptyState />);
    expect(lastFrame()).toContain('No runs yet');
    expect(lastFrame()).toContain('msq run');
  });
});

// ---------------------------------------------------------------------------
// CommandBar
// ---------------------------------------------------------------------------
describe('CommandBar', () => {
  const base = {
    activeView: 'overview' as const,
    focusPanel: 'runs' as const,
    hasRuns: false,
    hasGates: false,
    hasPending: false,
    canPause: false,
    canResume: false,
    canAbort: false,
    width: 120,
  };

  it('always shows tab and quit', () => {
    const { lastFrame } = renderWithTheme(<CommandBar {...base} />);
    expect(lastFrame()).toContain('tab panel');
    expect(lastFrame()).toContain('q quit');
  });

  it('shows j/k and enter when there are runs', () => {
    const { lastFrame } = renderWithTheme(<CommandBar {...base} hasRuns />);
    expect(lastFrame()).toContain('j/k move');
    expect(lastFrame()).toContain('enter open');
  });

  it('shows gate actions when gates panel is focused', () => {
    const { lastFrame } = renderWithTheme(
      <CommandBar {...base} hasRuns hasGates focusPanel="gates" />
    );
    expect(lastFrame()).toContain('a approve');
    expect(lastFrame()).toContain('s skip');
    expect(lastFrame()).toContain('r retry');
  });

  it('shows run-detail shortcuts in run view', () => {
    const { lastFrame } = renderWithTheme(
      <CommandBar {...base} hasRuns activeView="run" />
    );
    expect(lastFrame()).toContain('esc overview');
    expect(lastFrame()).toContain('ctrl+s pause logs');
  });

  it('shows dashboard shortcuts when dashboardOpen', () => {
    const { lastFrame } = renderWithTheme(<CommandBar {...base} dashboardOpen />);
    expect(lastFrame()).toContain('[/] period');
    expect(lastFrame()).toContain('d close');
  });

  it('shows notifications shortcuts in notifications view', () => {
    const { lastFrame } = renderWithTheme(
      <CommandBar {...base} activeView="notifications" />
    );
    expect(lastFrame()).toContain('o close');
    expect(lastFrame()).toContain('esc overview');
  });

  it('shows pending shortcuts when hasPending', () => {
    const { lastFrame } = renderWithTheme(<CommandBar {...base} hasPending />);
    expect(lastFrame()).toContain('n start');
    expect(lastFrame()).toContain('↑/↓ select');
  });
});

// ---------------------------------------------------------------------------
// GatePanel
// ---------------------------------------------------------------------------
describe('GatePanel', () => {
  const gates = [
    { id: 1, runId: 10, featureId: 'feat-1', repoId: 'repo-1', createdAt: '', resolvedAt: null, decision: null },
    { id: 2, runId: 11, featureId: 'feat-2', repoId: 'repo-2', createdAt: '', resolvedAt: null, decision: null },
  ];

  it('renders the header and shortcut hints', () => {
    const { lastFrame } = renderWithTheme(<GatePanel gates={gates} selectedIndex={0} />);
    expect(lastFrame()).toContain('Gates awaiting decision');
    expect(lastFrame()).toContain('[a]pprove');
    expect(lastFrame()).toContain('[s]kip');
    expect(lastFrame()).toContain('[r]etry');
  });

  it('prefixes the selected gate with the ▶ indicator', () => {
    const { lastFrame } = renderWithTheme(<GatePanel gates={gates} selectedIndex={0} />);
    expect(lastFrame()).toContain('▶ feat-1');
  });

  it('moves the ▶ indicator when selection changes', () => {
    const { lastFrame } = renderWithTheme(<GatePanel gates={gates} selectedIndex={1} />);
    expect(lastFrame()).toContain('▶ feat-2');
    expect(lastFrame()).not.toContain('▶ feat-1');
  });

  it('renders all gate feature ids', () => {
    const { lastFrame } = renderWithTheme(<GatePanel gates={gates} selectedIndex={0} />);
    expect(lastFrame()).toContain('feat-1');
    expect(lastFrame()).toContain('feat-2');
  });
});

// ---------------------------------------------------------------------------
// RunTable
// ---------------------------------------------------------------------------
describe('RunTable', () => {
  const runs: RunSummary[] = [
    { ...baseRun, runId: 1, featureId: 'feat-alpha', status: 'running', rawStatus: 'running' },
    { ...baseRun, runId: 2, featureId: 'feat-beta', status: 'done', rawStatus: 'done', totalTokens: 2000, endedAt: '2026-01-01T00:05:00Z' },
  ];

  it('renders full header row at wide width', () => {
    const { lastFrame } = renderWithTheme(<RunTable runs={runs} width={120} />);
    expect(lastFrame()).toContain('feature_id');
    expect(lastFrame()).toContain('tool');
    expect(lastFrame()).toContain('status');
    expect(lastFrame()).toContain('duration');
    expect(lastFrame()).toContain('tokens');
  });

  it('renders compact header at narrow width', () => {
    const { lastFrame } = renderWithTheme(<RunTable runs={runs} width={50} />);
    expect(lastFrame()).toContain('feature_id');
    expect(lastFrame()).toContain('status');
    expect(lastFrame()).not.toContain('duration');
    expect(lastFrame()).not.toContain('tokens');
  });

  it('marks the selected row with > indicator', () => {
    const { lastFrame } = renderWithTheme(<RunTable runs={runs} width={120} selectedIndex={0} isFocused />);
    expect(lastFrame()).toContain('> feat-alpha');
  });

  it('shows all feature ids', () => {
    const { lastFrame } = renderWithTheme(<RunTable runs={runs} width={120} />);
    expect(lastFrame()).toContain('feat-alpha');
    expect(lastFrame()).toContain('feat-beta');
  });
});

// ---------------------------------------------------------------------------
// NotificationsFeed
// ---------------------------------------------------------------------------
describe('NotificationsFeed', () => {
  const notifications = [
    { id: '1', event: 'run:start', message: 'feat-1 started', ts: '10:00:00' },
    { id: '2', event: 'run:done', message: 'feat-1 finished', ts: '10:05:00' },
    { id: '3', event: 'gate:created', message: 'gate opened', ts: '10:06:00' },
  ];

  it('renders notification messages', () => {
    const { lastFrame } = renderWithTheme(
      <NotificationsFeed notifications={notifications} width={80} />
    );
    expect(lastFrame()).toContain('feat-1 started');
    expect(lastFrame()).toContain('feat-1 finished');
  });

  it('shows empty state when no notifications', () => {
    const { lastFrame } = renderWithTheme(
      <NotificationsFeed notifications={[]} width={80} />
    );
    expect(lastFrame()).toContain('No recent notifications');
  });

  it('truncates to maxVisible and shows overflow count in compact mode', () => {
    const { lastFrame } = renderWithTheme(
      <NotificationsFeed notifications={notifications} maxVisible={1} width={80} compact />
    );
    expect(lastFrame()).toContain('+2 more');
  });

  it('shows event type labels', () => {
    const { lastFrame } = renderWithTheme(
      <NotificationsFeed notifications={notifications} width={80} />
    );
    expect(lastFrame()).toContain('RUN');
    expect(lastFrame()).toContain('DONE');
  });
});

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------
describe('StatusBar', () => {
  const base = {
    selectedRun: null,
    selectedFeature: null,
    gateCount: 0,
    totalRuns: 0,
    doneRuns: 0,
    width: 120,
  };

  it('renders idle state with 0/0 progress', () => {
    const { lastFrame } = renderWithTheme(<StatusBar {...base} />);
    expect(lastFrame()).toContain('Idle');
    expect(lastFrame()).toContain('0/0 done');
  });

  it('renders feature id and tool when a run is selected', () => {
    const { lastFrame } = renderWithTheme(
      <StatusBar
        {...base}
        selectedRun={baseRun}
        totalRuns={3}
        doneRuns={1}
      />
    );
    expect(lastFrame()).toContain('feat-1');
    expect(lastFrame()).toContain('claude');
    expect(lastFrame()).toContain('1/3 done');
  });

  it('renders gate count when gates are open', () => {
    const { lastFrame } = renderWithTheme(
      <StatusBar {...base} gateCount={2} />
    );
    expect(lastFrame()).toContain('2 gates open');
  });

  it('renders shortcut hints when provided', () => {
    const { lastFrame } = renderWithTheme(
      <StatusBar {...base} shortcutHints={['a:approve', 's:skip', 'esc:back']} />
    );
    expect(lastFrame()).toContain('a:approve');
    expect(lastFrame()).toContain('s:skip');
    expect(lastFrame()).toContain('esc:back');
  });

  it('renders current stage next to feature id', () => {
    const { lastFrame } = renderWithTheme(
      <StatusBar {...base} selectedRun={baseRun} currentStage="implement" />
    );
    expect(lastFrame()).toContain('feat-1 > implement');
  });

  it('renders the fallback theme notice when provided', () => {
    const { lastFrame } = renderWithTheme(
      <StatusBar
        {...base}
        themeNotice={'Theme "solarized" is not supported. Using "default".'}
      />,
      'minimal',
    );
    expect(lastFrame()).toContain('solarized');
    expect(lastFrame()).toContain('default');
  });
});

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------
// The palette uses `position="absolute"` from ink which is not rendered in
// ink-testing-library's virtual terminal frame. Open-state behaviour (open,
// close, execute, navigate) is covered by the mock-based tests in app.test.ts.
// Here we only verify the contract that a closed palette emits no output.
describe('CommandPalette', () => {
  const closedState = {
    isOpen: false,
    query: '',
    filteredCommands: [],
    selectedIndex: 0,
  };

  const noopHandlers = {
    onClose: vi.fn(),
    onExecute: vi.fn(),
    onSelectPrevious: vi.fn(),
    onSelectNext: vi.fn(),
    onQueryChange: vi.fn(),
  };

  it('renders nothing when closed', () => {
    const { lastFrame } = renderWithTheme(
      <CommandPalette state={closedState} width={120} {...noopHandlers} />
    );
    expect(lastFrame()).toBe('');
  });
});
