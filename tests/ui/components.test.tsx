import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render } from 'ink-testing-library';
import { CommandBar } from '../../src/ui/components/CommandBar.js';
import { CostDashboard } from '../../src/ui/components/CostDashboard.js';
import { EmptyState } from '../../src/ui/components/EmptyState.js';
import { GatePanel } from '../../src/ui/components/GatePanel.js';
import { MainPanel } from '../../src/ui/components/MainPanel.js';
import { RunTable } from '../../src/ui/components/RunTable.js';
import { Sidebar } from '../../src/ui/components/Sidebar.js';
import { StatusBar } from '../../src/ui/components/StatusBar.js';
import { ThemeProvider } from '../../src/ui/theme/context.js';
import { resolveThemePreference } from '../../src/ui/theme/resolve.js';
import type { StatsRunRow } from '../../src/db/repo.js';

afterEach(() => cleanup());

function renderWithTheme(node: React.ReactElement, theme = 'default') {
  return render(
    <ThemeProvider resolution={resolveThemePreference(theme)}>
      {node}
    </ThemeProvider>,
  );
}

describe('ui components', () => {
  it('renders the empty state message', () => {
    const { lastFrame } = renderWithTheme(<EmptyState />, 'light');
    expect(lastFrame()).toContain('No runs yet');
    expect(lastFrame()).toContain('msq run');
  });

  it('renders gate panel rows and highlights the selected gate', () => {
    const { lastFrame } = renderWithTheme(
      <GatePanel
        gates={[
          {
            id: 1,
            runId: 10,
            featureId: 'feat-1',
            repoId: 'repo-1',
            createdAt: '2026-07-06T10:00:00Z',
            resolvedAt: null,
            decision: null,
          },
          {
            id: 2,
            runId: 11,
            featureId: 'feat-2',
            repoId: 'repo-2',
            createdAt: '2026-07-06T10:01:00Z',
            resolvedAt: null,
            decision: null,
          },
        ]}
        selectedIndex={1}
      />,
      'minimal',
    );

    expect(lastFrame()).toContain('Gates awaiting decision');
    expect(lastFrame()).toContain('▶ feat-2');
  });

  it('renders compact and full tables', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T10:02:00Z'));

    const runs = [
      {
        runId: 1,
        repoId: 'repo-1',
        featureId: 'feat-a-very-long-id',
        tool: 'claude' as const,
        status: 'running' as const,
        rawStatus: 'running' as const,
        startedAt: '2026-07-06T10:01:30Z',
        endedAt: null,
        totalTokens: null,
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        gateId: null,
        gateDecision: null,
        pipelineId: null,
        pipelineStatus: null,
        pipelineCurrentStage: null,
        pipelineResumeSummary: null,
        stage: null,
        pendingStageRequestKind: null,
      },
      {
        runId: 2,
        repoId: 'repo-1',
        featureId: 'feat-2',
        tool: 'codex' as const,
        status: 'done' as const,
        rawStatus: 'done' as const,
        startedAt: '2026-07-06T10:00:00Z',
        endedAt: '2026-07-06T10:01:00Z',
        totalTokens: 1200,
        inputTokens: 900,
        cachedInputTokens: null,
        outputTokens: 300,
        gateId: null,
        gateDecision: null,
        pipelineId: null,
        pipelineStatus: null,
        pipelineCurrentStage: null,
        pipelineResumeSummary: null,
        stage: null,
        pendingStageRequestKind: null,
      },
    ];

    expect(renderWithTheme(<RunTable runs={runs} width={40} />, 'dark').lastFrame()).toContain('feature_id');
    expect(renderWithTheme(<RunTable runs={runs} width={100} />, 'dark').lastFrame()).toContain('duration');
  });

  it('renders sidebar, main panel, status bar, and command bar with theme-aware content', () => {
    const runs = [
      {
        runId: 1,
        repoId: 'repo-1',
        featureId: 'feat-1',
        tool: 'codex' as const,
        status: 'running' as const,
        rawStatus: 'running' as const,
        startedAt: '2026-07-06T10:01:30Z',
        endedAt: null,
        totalTokens: 800,
        inputTokens: 600,
        cachedInputTokens: null,
        outputTokens: 200,
        gateId: null,
        gateDecision: null,
        pipelineId: null,
        pipelineStatus: null,
        pipelineCurrentStage: null,
        pipelineResumeSummary: null,
        stage: null,
        pendingStageRequestKind: null,
      },
    ];
    const gates = [
      {
        id: 1,
        runId: 1,
        featureId: 'feat-1',
        repoId: 'repo-1',
        createdAt: '2026-07-06T10:00:00Z',
        resolvedAt: null,
        decision: null,
      },
    ];
    const selectedFeature = {
      id: 'feat-1',
      title: 'F05 Layout Multi-Panel',
      skills: ['implement', 'test'],
      tool: 'codex',
      effort: 'medium' as const,
    };

    expect(renderWithTheme(
      <Sidebar
        runs={runs}
        gates={gates as any}
        notifications={[]}
        selectedRunIndex={0}
        selectedGateIndex={0}
        focusPanel="runs"
        activeView="overview"
        skills={selectedFeature.skills}
        width={32}
        mode="full"
      />,
      'dark',
    ).lastFrame()).toContain('Workflow');

    expect(renderWithTheme(
      <MainPanel
        runs={runs}
        gates={gates as any}
        selectedRun={runs[0] ?? null}
        selectedRunIndex={0}
        selectedFeature={selectedFeature}
        activeView="run"
        output={[{
          id: 1,
          runId: 1,
          featureId: 'feat-1',
          tool: 'codex',
          stream: 'stdout',
          source: 'agent',
          line: 'Updating the TUI shell.',
          createdAt: '2026-07-06T10:01:31Z',
        }]}
        outputPaused={false}
        logsVisible
        focusPanel="main"
        mode="full"
        width={72}
        pendingFeatures={[]}
        selectedPendingIndex={0}
        notifications={[]}
      />,
      'dark',
    ).lastFrame()).toContain('Run Detail');

    expect(renderWithTheme(
      <StatusBar
        selectedRun={runs[0] ?? null}
        selectedFeature={selectedFeature}
        gateCount={gates.length}
        totalRuns={runs.length}
        doneRuns={0}
        width={120}
        activeView="overview"
        themeNotice={'Theme "solarized" is not supported. Using "default".'}
      />,
      'default',
    ).lastFrame()).toContain('solarized');

    expect(renderWithTheme(
      <CommandBar
        activeView="run"
        focusPanel="gates"
        hasRuns
        hasGates
        hasPending={false}
        canPause={false}
        canResume={false}
        canAbort={false}
        width={120}
      />,
      'default',
    ).lastFrame()).toContain('a approve');
  });

  it('renders the cost dashboard with aggregated rows', () => {
    const rows: StatsRunRow[] = [
      {
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
      },
    ];
    const { lastFrame } = renderWithTheme(<CostDashboard rows={rows} periodLabel="last 7 days" width={100} />, 'dark');
    expect(lastFrame()).toContain('Usage Telemetry');
    expect(lastFrame()).toContain('By feature');
  });

  it('renders the cost dashboard empty state', () => {
    const { lastFrame } = renderWithTheme(<CostDashboard rows={[]} periodLabel="today" width={100} />, 'minimal');
    expect(lastFrame()).toContain('No runs recorded for this period.');
  });
});
