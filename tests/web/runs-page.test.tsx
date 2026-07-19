import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunsPage } from '../../src/web/client/pages/RunsPage.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState } from '../../src/web/types.js';

function project(projectId: string, position: number): NonNullable<MsqWebState['projects']>[number] {
  return { projectId, name: `Project ${projectId}`, position, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null };
}

function stateWith(runs: unknown[]): MsqWebState {
  return {
    projects: [project('project-a', 0), project('project-b', 1)],
    featureCatalog: {
      'feat-a': { id: 'feat-a', title: 'Feature A', projectId: 'project-a', tool: 'codex' },
      'feat-b': { id: 'feat-b', title: 'Feature B', projectId: 'project-b', tool: 'codex' },
    },
    runs,
  } as unknown as MsqWebState;
}

const runs = [
  { runId: 1, featureId: 'feat-a', status: 'done', tool: 'codex', totalTokens: 100, startedAt: '2026-07-18T10:00:00.000Z', endedAt: null },
  { runId: 2, featureId: 'feat-b', status: 'done', tool: 'codex', totalTokens: 200, startedAt: '2026-07-18T10:00:00.000Z', endedAt: null },
];

function renderRuns(state: MsqWebState, activeProjectId: string | null): string {
  return renderToStaticMarkup(
    <ActiveProjectContext.Provider value={{ activeProjectId, activeProject: null, setActiveProject: () => {}, selectionInvalidated: false }}>
      <RunsPage state={state} onOpenRun={() => {}} />
    </ActiveProjectContext.Provider>,
  );
}

describe('RunsPage Project scope', () => {
  it('lists only runs whose feature belongs to the active Project', () => {
    const html = renderRuns(stateWith(runs), 'project-a');
    expect(html).toContain('Feature A');
    expect(html).not.toContain('Feature B');
  });

  it('switches the visible rows when the active Project changes', () => {
    const html = renderRuns(stateWith(runs), 'project-b');
    expect(html).toContain('Feature B');
    expect(html).not.toContain('Feature A');
  });

  it('renders an empty table body when the active Project has no runs', () => {
    const html = renderRuns(stateWith(runs), null);
    expect(html).not.toContain('Feature A');
    expect(html).not.toContain('Feature B');
    expect(html).toContain('<tbody');
  });
});
