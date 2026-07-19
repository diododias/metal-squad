import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsPage } from '../../src/web/client/pages/AnalyticsPage.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState } from '../../src/web/types.js';

function project(projectId: string, position: number): NonNullable<MsqWebState['projects']>[number] {
  return { projectId, name: `Project ${projectId}`, position, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null };
}

const now = new Date().toISOString();

function stateWith(rows: unknown[], runs: unknown[] = []): MsqWebState {
  return {
    projects: [project('project-a', 0), project('project-b', 1)],
    featureCatalog: {
      'feat-a': { id: 'feat-a', title: 'Feature A', projectId: 'project-a', tool: 'codex' },
      'feat-b': { id: 'feat-b', title: 'Feature B', projectId: 'project-b', tool: 'codex' },
    },
    runs,
    dashboard: { rows },
  } as unknown as MsqWebState;
}

const rows = [
  { featureId: 'feat-a', totalTokens: 1000, startedAt: now },
  { featureId: 'feat-b', totalTokens: 5000, startedAt: now },
];

function renderAnalytics(state: MsqWebState, activeProjectId: string | null): string {
  return renderToStaticMarkup(
    <ActiveProjectContext.Provider value={{ activeProjectId, activeProject: null, setActiveProject: () => {}, selectionInvalidated: false }}>
      <AnalyticsPage state={state} />
    </ActiveProjectContext.Provider>,
  );
}

describe('AnalyticsPage Project scope', () => {
  it('aggregates tokens and sessions only for the active Project', () => {
    const html = renderAnalytics(stateWith(rows), 'project-a');
    expect(html).toContain('1k');
    expect(html).not.toContain('5k');
  });

  it('switches the aggregate when the active Project changes', () => {
    const html = renderAnalytics(stateWith(rows), 'project-b');
    expect(html).toContain('5k');
    expect(html).not.toContain('1k');
  });

  it('shows no data for the period when Projects exist but none is selected', () => {
    const html = renderAnalytics(stateWith(rows), null);
    expect(html).toContain('No data for this period.');
  });

  it('scopes the active-features count to the active Project', () => {
    const runs = [
      { runId: 1, featureId: 'feat-a', status: 'running' },
      { runId: 2, featureId: 'feat-b', status: 'running' },
    ];
    const afterLabel = renderAnalytics(stateWith(rows, runs), 'project-a').split('Active features')[1] ?? '';
    // feat-a is the only run scoped to project-a, so exactly one active feature.
    expect(afterLabel.replace(/<[^>]*>/g, '').trimStart().startsWith('1')).toBe(true);
  });
});
