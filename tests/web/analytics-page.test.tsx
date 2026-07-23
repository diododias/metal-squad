import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsPage, shouldShowRepositoryBreakdown } from '../../src/web/client/pages/AnalyticsPage.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState } from '../../src/web/types.js';

function stateWith(totalTokens = 12_000): MsqWebState {
  return {
    projects: [{ projectId: 'project-a', name: 'Metal Squad', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens, error: null }, archivedAt: null }],
    analytics: {
      period: { sinceDays: 30 }, generatedAt: new Date().toISOString(), revision: 1,
      summary: { totalTokens, inputTokens: 8_000, cachedInputTokens: 2_000, outputTokens: 2_000, runs: totalTokens ? 3 : 0, successRatePercent: 100, wasteTokens: 1_000, contextAvgPercent: 20, contextMaxPercent: 42, contextP95Percent: 38, confidence: 'exact' },
      topGroups: { byProject: [], byEpic: [], byRepository: [], byWorkItem: [{ key: 'F-123', totalTokens, inputTokens: 8_000, cachedInputTokens: 2_000, outputTokens: 2_000, runs: 3, successRatePercent: 100, wasteTokens: 1_000, contextAvgPercent: 20, contextMaxPercent: 42, contextP95Percent: 38, confidence: 'exact' }], byTool: [], byModel: [], byStage: [], byStatus: [] },
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
});
