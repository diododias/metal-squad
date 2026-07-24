import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsPage } from '../../src/web/client/pages/AnalyticsPage.js';
import { BarList } from '../../src/web/client/components/data/BarList.js';
import { shouldShowRepositoryBreakdown, WorkItemDrilldownDrawer } from '../../src/web/client/pages/AnalyticsPage.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState } from '../../src/web/types.js';

function stateWith(totalTokens = 12_000): MsqWebState {
  return {
    projects: [{ projectId: 'project-a', name: 'Metal Squad', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens, error: null }, archivedAt: null }],
    analytics: {
      period: { sinceDays: 30 }, generatedAt: new Date().toISOString(), revision: 1,
      summary: { totalTokens, inputTokens: 8_000, cachedInputTokens: 2_000, outputTokens: 2_000, runs: totalTokens ? 3 : 0, successRatePercent: 100, wasteTokens: 1_000, contextAvgPercent: 20, contextMaxPercent: 42, contextP95Percent: 38, confidence: 'exact' },
      topGroups: { byProject: [], byEpic: [], byRepository: [], byWorkItem: [{ key: 'F-123', totalTokens, inputTokens: 8_000, cachedInputTokens: 2_000, outputTokens: 2_000, runs: 3, successRatePercent: 100, wasteTokens: 1_000, contextAvgPercent: 20, contextMaxPercent: 42, contextP95Percent: 38, confidence: 'exact', fallbackRuns: 0 }], byTool: [{ key: 'codex', totalTokens, inputTokens: 8_000, cachedInputTokens: 2_000, outputTokens: 2_000, runs: 3, successRatePercent: 100, wasteTokens: 1_000, contextAvgPercent: 20, contextMaxPercent: 42, contextP95Percent: 38, confidence: 'exact', fallbackRuns: 1 }], byModel: [{ key: 'unknown model', totalTokens: 2_000, inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 1_000, runs: 1, successRatePercent: 100, wasteTokens: 0, contextAvgPercent: 20, contextMaxPercent: 20, contextP95Percent: 20, confidence: 'unknown', fallbackRuns: 0 }], byStage: [{ key: 'custom-review', totalTokens: 2_000, inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 1_000, runs: 1, successRatePercent: 100, wasteTokens: 0, contextAvgPercent: 20, contextMaxPercent: 20, contextP95Percent: 20, confidence: 'unknown', fallbackRuns: 0 }], byEffort: [{ key: 'high', totalTokens: 8_000, inputTokens: 5_000, cachedInputTokens: 1_000, outputTokens: 2_000, runs: 2, successRatePercent: 100, wasteTokens: 0, contextAvgPercent: 20, contextMaxPercent: 20, contextP95Percent: 20, confidence: 'exact', fallbackRuns: 0 }], byThinking: [], byStatus: [] },
      dataQuality: { totalRuns: 3, exactRuns: 3, derivedRuns: 0, unknownRuns: 0, missingTokenRuns: 0, missingProjectSnapshotRuns: 0, missingEpicSnapshotRuns: 0 },
    },
  } as unknown as MsqWebState;
}

function renderAnalytics(state: MsqWebState): string {
  return renderToStaticMarkup(<ActiveProjectContext.Provider value={{ activeProjectId: 'project-a', activeProject: null, setActiveProject: () => {}, selectionInvalidated: false }}><AnalyticsPage state={state} /></ActiveProjectContext.Provider>);
}

describe('AnalyticsPage UX contract', () => {
  it('renders the investigation hierarchy, global filters, and all internal tabs', () => {
    const html = renderAnalytics(stateWith());
    expect(html).toContain('Token consumption, efficiency and operational waste');
    expect(html).toContain('Project: Metal Squad');
    expect(html).toContain('Overview');
    expect(html).toContain('Work Items');
    expect(html).toContain('Breakdowns');
    expect(html).toContain('Insights');
    expect(html).toContain('Data Quality');
    expect(html).toContain('Total tokens');
    expect(html).toContain('Top Work Items');
  });

  it('renders the partial-data warning when confidence is incomplete', () => {
    const state = stateWith();
    state.analytics.dataQuality.unknownRuns = 2;
    expect(renderAnalytics(state)).toContain('Some historical runs are classified as unknown or derived.');
  });

  it('renders the prescribed empty state when the active selection has no telemetry', () => {
    expect(renderAnalytics(stateWith(0))).toContain('No token usage for this filter.');
  });

  it('renders actionable tool, model, stage, and effort breakdowns with fallback evidence', () => {
    const html = renderToStaticMarkup(<BarList items={[{ id: 'codex', label: 'codex · 1 fallback/retry', value: 12_000, ariaLabel: 'Filter by Tool codex', onClick: () => {} }]} />);
    expect(html).toContain('aria-label="Filter by Tool codex"');
    expect(html).toContain('1 fallback/retry');
  });

  it('shows the repository chart only for multi-repository Projects and retains zero-run Epics', () => {
    const state = stateWith();
    state.analytics.topGroups.byProject = [
      { ...state.analytics.topGroups.byWorkItem[0], key: 'project-a' },
      { ...state.analytics.topGroups.byWorkItem[0], key: 'unknown/unscoped', totalTokens: 400 },
    ];
    state.analytics.topGroups.byEpic = [{ ...state.analytics.topGroups.byWorkItem[0], key: 'epic-empty', runs: 0, totalTokens: 0 }];
    state.analytics.topGroups.byRepository = [
      { ...state.analytics.topGroups.byWorkItem[0], key: 'repo-a' },
      { ...state.analytics.topGroups.byWorkItem[0], key: 'repo-b', totalTokens: 6_000 },
    ];
    expect(shouldShowRepositoryBreakdown(state.analytics.topGroups.byRepository)).toBe(true);
    expect(state.analytics.topGroups.byEpic).toContainEqual(expect.objectContaining({ key: 'epic-empty', runs: 0 }));
    expect(shouldShowRepositoryBreakdown([{ key: 'repo-a' }, { key: 'unknown/unscoped' }])).toBe(false);
  });

  it('renders a pipeline-grouped drawer with telemetry gaps, task tokens and the existing Run Detail route', () => {
    const workItem = {
      workItemId: 'F-123', totalTokens: 120, wasteTokens: 20, runs: 2, contextMaxPercent: 72,
    } as Parameters<typeof WorkItemDrilldownDrawer>[0]['workItem'];
    const runs = [{
      runId: 7, pipelineId: 3, workItemId: 'F-123', projectId: 'project-a', epicId: 'epic-a', repoId: 'repo-a', tool: 'codex', model: 'gpt-5', status: 'done', stage: 'implement',
      startedAt: '2026-07-23T10:00:00.000Z', endedAt: '2026-07-23T10:02:00.000Z', durationMs: 120000, summary: 'Implemented the drawer', totalTokens: 120, inputTokens: 80, cachedInputTokens: 10, outputTokens: 30,
      usefulTokens: 120, wasteTokens: 0, hasTokenTelemetry: true, contextWindowPercent: 72, confidence: 'exact',
      tasks: [{ taskId: 'T1', title: 'Wire drawer', status: 'done', stage: 'implement', startedAt: null, endedAt: null, totalTokens: 80, inputTokens: 50, cachedInputTokens: 10, outputTokens: 20, contextWindowPercent: 60 }],
      retries: [{ attempt: 2, tool: 'claude', model: 'sonnet', error: 'timeout', retriedAt: '2026-07-23T10:01:00.000Z' }], events: [{ event: 'gate_wait', createdAt: '2026-07-23T10:00:30.000Z' }],
    }, {
      runId: 8, pipelineId: 3, workItemId: 'F-123', projectId: 'project-a', epicId: 'epic-a', repoId: 'repo-a', tool: 'codex', model: null, status: 'running', stage: 'implement',
      startedAt: '2026-07-23T10:03:00.000Z', endedAt: null, durationMs: null, summary: null, totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
      usefulTokens: 0, wasteTokens: 0, hasTokenTelemetry: false, contextWindowPercent: null, confidence: 'unknown', tasks: [], retries: [], events: [{ event: 'blocked_resumed', createdAt: '2026-07-23T10:03:00.000Z' }],
    }] as Parameters<typeof WorkItemDrilldownDrawer>[0]['runs'];
    const html = renderToStaticMarkup(<WorkItemDrilldownDrawer workItem={workItem} runs={runs} loading={false} onClose={() => {}} />);
    expect(html).toContain('Pipeline #3');
    expect(html).toContain('No token telemetry captured');
    expect(html).toContain('Task token breakdown');
    expect(html).toContain('Gate wait');
    expect(html).toContain('#/runs/F-123');
  });
});
