import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, render } from 'ink-testing-library';
import { CommandBar } from '../../src/ui/components/CommandBar.js';
import { CostDashboard } from '../../src/ui/components/CostDashboard.js';
import { EmptyState } from '../../src/ui/components/EmptyState.js';
import { MainPanel } from '../../src/ui/components/MainPanel.js';
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
    expect(lastFrame()).toContain('Backlog vazio');
    expect(lastFrame()).toContain('msq init');
  });

  it('renders main panel, status bar, and command bar with theme-aware content', () => {
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

    const mainPanelFrame = renderWithTheme(
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
        focusPanel="columns"
        activeColumn="execution"
        detailPageSize={7}
        mode="full"
        width={72}
        pendingFeatures={[]}
        selectedPendingIndex={0}
        notifications={[]}
      />,
      'dark',
    ).lastFrame();
    expect(mainPanelFrame).toContain('Run Detail');
    expect(mainPanelFrame).toContain('Workflow');
    // D5: AI> and TOOL> prefixes are hidden from log output.
    expect(mainPanelFrame).not.toContain('AI>');
    expect(mainPanelFrame).toContain('Updating the TUI shell.');

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
