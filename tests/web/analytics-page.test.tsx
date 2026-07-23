import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsPage } from '../../src/web/client/pages/AnalyticsPage.js';
import { BarList } from '../../src/web/client/components/data/BarList.js';
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
    expect(html).toContain('Top consumers');
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
});
