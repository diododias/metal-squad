import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';

import { EmptyState } from '../../src/ui/components/EmptyState.js';
import { CommandBar } from '../../src/ui/components/CommandBar.js';
import { HeaderBar } from '../../src/ui/components/HeaderBar.js';
import { StatsBar } from '../../src/ui/components/StatsBar.js';
import { KanbanCard } from '../../src/ui/components/KanbanCard.js';
import { FeaturePreview } from '../../src/ui/components/FeaturePreview.js';
import { FeatureConfigSection } from '../../src/ui/components/FeatureConfigSection.js';
import { WorkflowStepper } from '../../src/ui/components/WorkflowStepper.js';
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
  it('renders the onboarding message when the backlog is empty', () => {
    const { lastFrame } = renderWithTheme(<EmptyState />);
    expect(lastFrame()).toContain('Backlog vazio');
    expect(lastFrame()).toContain('msq init');
  });
});

// ---------------------------------------------------------------------------
// HeaderBar (F31 section 1: replaces the ASCII banner with a 1-line title)
// ---------------------------------------------------------------------------
describe('HeaderBar', () => {
  it('renders the product name, version, and active repo on one line', () => {
    const { lastFrame } = renderWithTheme(<HeaderBar version="0.0.1" repoLabel="metal-squad" width={80} />);
    expect(lastFrame()).toContain('METAL SQUAD');
    expect(lastFrame()).toContain('v0.0.1');
    expect(lastFrame()).toContain('metal-squad');
  });
});

// ---------------------------------------------------------------------------
// StatsBar (F31 section 1: always-visible done/todo/execução/falha/gates/tokens)
// ---------------------------------------------------------------------------
describe('StatsBar', () => {
  it('renders the always-visible stats row', () => {
    const { lastFrame } = renderWithTheme(
      <StatsBar
        done={3}
        todo={5}
        execution={2}
        falha={1}
        gatesPending={4}
        tokenStats={{ status: 'ready', totalTokens: 1500, error: null }}
      />,
    );
    expect(lastFrame()).toContain('3 done');
    expect(lastFrame()).toContain('5 todo');
    expect(lastFrame()).toContain('2 execução');
    expect(lastFrame()).toContain('1 falha');
    expect(lastFrame()).toContain('4 aprovações');
    expect(lastFrame()).toContain('tokens (7d) 1.5k');
  });

  it('shows a loading placeholder instead of 0 while token stats are pending', () => {
    const { lastFrame } = renderWithTheme(
      <StatsBar
        done={0}
        todo={0}
        execution={0}
        falha={0}
        gatesPending={0}
        tokenStats={{ status: 'loading', totalTokens: null, error: null }}
      />,
    );
    expect(lastFrame()).toContain('tokens (7d) —');
  });

  it('keeps the last known total visible when the token stats query errors', () => {
    const { lastFrame } = renderWithTheme(
      <StatsBar
        done={0}
        todo={0}
        execution={0}
        falha={0}
        gatesPending={0}
        tokenStats={{ status: 'error', totalTokens: 900, error: 'db locked' }}
      />,
    );
    expect(lastFrame()).toContain('tokens (7d) 900');
    expect(lastFrame()).toContain('stats unavailable');
  });

  // F31 item 1: short terminals drop the tokens segment first to keep the
  // stats row a single dense line — the counts themselves are never cut.
  it('drops the tokens segment in compact mode, keeping the counts', () => {
    const { lastFrame } = renderWithTheme(
      <StatsBar
        done={3}
        todo={5}
        execution={2}
        falha={1}
        gatesPending={4}
        tokenStats={{ status: 'ready', totalTokens: 1500, error: null }}
        compact
      />,
    );
    const frame = lastFrame();
    expect(frame).toContain('3 done');
    expect(frame).toContain('4 aprovações');
    expect(frame).not.toContain('tokens (7d)');
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
// KanbanCard (F31 section 3 + "componente de card unico": absorbs RunTable)
// ---------------------------------------------------------------------------
describe('KanbanCard', () => {
  const run: RunSummary = { ...baseRun, runId: 1, featureId: 'feat-alpha', status: 'running', rawStatus: 'running' };
  const feature = {
    id: 'feat-alpha',
    title: 'Alpha',
    skills: [],
    tool: 'codex',
    model: 'gpt-5',
    effort: 'high' as const,
  };

  it('shows tool · model · effort for a run row, not just the tool', () => {
    const { lastFrame } = renderWithTheme(
      <KanbanCard width={40} selected={false} focused={false} run={run} feature={feature} />,
    );
    expect(lastFrame()).toContain('feat-alpha');
    // The tool is the run's own adapter (baseRun.tool === 'claude'), while
    // model/effort resolve from the feature catalog entry passed in.
    expect(lastFrame()).toContain('claude · gpt-5 · high');
  });

  it('falls back to the tool name when no model is configured', () => {
    const { lastFrame } = renderWithTheme(
      <KanbanCard width={40} selected={false} focused={false} run={run} feature={{ ...feature, model: undefined }} />,
    );
    expect(lastFrame()).toContain('claude · claude · high');
  });

  it('marks the selected row with the > indicator', () => {
    const { lastFrame } = renderWithTheme(
      <KanbanCard width={40} selected focused run={run} feature={feature} />,
    );
    expect(lastFrame()).toContain('> ');
  });

  it('renders a pending (TODO) feature without a run', () => {
    const { lastFrame } = renderWithTheme(
      <KanbanCard width={40} selected={false} focused={false} pendingFeature={feature} />,
    );
    expect(lastFrame()).toContain('feat-alpha');
    expect(lastFrame()).toContain('codex · gpt-5 · high');
  });
});

// ---------------------------------------------------------------------------
// FeaturePreview + FeatureConfigSection (F31 sections 4 and 5b)
// ---------------------------------------------------------------------------
describe('FeaturePreview', () => {
  const previewFeature = {
    id: 'feat-preview',
    title: 'F31 Preview',
    skills: ['implement'],
    tool: 'codex',
    model: 'gpt-5',
    effort: 'high' as const,
    description: 'Read-only preview of the feature spec.',
    tasks: [{ id: 'T1', title: 'Wire the preview', status: 'todo' as const, dependsOn: [] }],
    dependsOn: ['feat-earlier'],
    workflow: {
      mode: 'staged' as const,
      stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
      approvals: { channel: 'telegram' as const, autoAdvance: false },
      syncTasksToBacklog: true,
    },
    retry: undefined,
    specFile: undefined,
    context: undefined,
  };
  const settings = { stageSkills: {} };

  it('shows the spec, declared tasks, and config without starting anything', () => {
    const { lastFrame } = renderWithTheme(
      <FeaturePreview feature={previewFeature} settings={settings} mode="full" width={100} />,
    );
    expect(lastFrame()).toContain('F31 Preview');
    expect(lastFrame()).toContain('not started yet');
    expect(lastFrame()).toContain('Read-only preview of the feature spec.');
    expect(lastFrame()).toContain('Wire the preview');
    expect(lastFrame()).toContain('Feature Config');
    expect(lastFrame()).toContain('Enter confirms and starts');
  });

  it('shows resolved retry defaults (muted) when the feature declares none', () => {
    const { lastFrame } = renderWithTheme(
      <FeatureConfigSection feature={previewFeature} settings={settings} width={60} />,
    );
    // RetrySchema defaults: maxAttempts 1, backoffMs 5000, onFail 'stop'.
    expect(lastFrame()).toContain('maxAttempts: 1');
    expect(lastFrame()).toContain('onFail: stop');
    expect(lastFrame()).toContain('feat-earlier');
  });
});

// ---------------------------------------------------------------------------
// WorkflowStepper (F31 section 5: compact, always-visible stepper)
// ---------------------------------------------------------------------------
describe('WorkflowStepper', () => {
  const stages = ['specify', 'plan', 'tasks', 'implement', 'validate'];
  const workflowStages = [
    { stage: 'specify', tasks: [], total: 2, totalTokens: 0, maxContextPercent: null, done: 2, running: 0, failed: 0, blocked: 0, pending: 0, skipped: 0 },
    { stage: 'plan', tasks: [], total: 3, totalTokens: 0, maxContextPercent: null, done: 1, running: 1, failed: 0, blocked: 0, pending: 1, skipped: 0 },
  ];

  it('marks completed stages done and the current stage as active', () => {
    const { lastFrame } = renderWithTheme(
      <WorkflowStepper stages={stages} workflowStages={workflowStages} currentStage="plan" width={80} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('✓ specify');
    expect(frame).toContain('▸ plan 1/3');
    expect(frame).toContain('· tasks');
    expect(frame).toContain('· implement');
    expect(frame).toContain('· validate');
  });

  it('shows every declared stage even when none has run yet', () => {
    const { lastFrame } = renderWithTheme(
      <WorkflowStepper stages={stages} workflowStages={[]} currentStage={null} width={80} />,
    );
    for (const stage of stages) {
      expect(lastFrame()).toContain(stage);
    }
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
