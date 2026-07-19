import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GatesPage } from '../../src/web/client/pages/GatesPage.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState } from '../../src/web/types.js';

function project(projectId: string, position: number): NonNullable<MsqWebState['projects']>[number] {
  return { projectId, name: `Project ${projectId}`, position, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null };
}

function stateWith(gates: unknown[]): MsqWebState {
  return {
    projects: [project('project-a', 0), project('project-b', 1)],
    featureCatalog: {
      'feat-a': { id: 'feat-a', title: 'Feature A', projectId: 'project-a', tool: 'codex' },
      'feat-b': { id: 'feat-b', title: 'Feature B', projectId: 'project-b', tool: 'codex' },
    },
    gates,
  } as unknown as MsqWebState;
}

const gates = [
  { kind: 'gate', id: 1, featureId: 'feat-a', repoId: '', prompt: 'Approve A?', createdAt: '2026-07-18T10:00:00.000Z' },
  { kind: 'gate', id: 2, featureId: 'feat-b', repoId: '', prompt: 'Approve B?', createdAt: '2026-07-18T10:00:00.000Z' },
];

function renderGates(state: MsqWebState, activeProjectId: string | null): string {
  return renderToStaticMarkup(
    <ActiveProjectContext.Provider value={{ activeProjectId, activeProject: null, setActiveProject: () => {}, selectionInvalidated: false }}>
      <GatesPage state={state} send={vi.fn()} />
    </ActiveProjectContext.Provider>,
  );
}

describe('GatesPage Project scope', () => {
  it('lists only gates whose feature belongs to the active Project, with a matching count', () => {
    const html = renderGates(stateWith(gates), 'project-a');
    expect(html).toContain('feat-a');
    expect(html).not.toContain('feat-b');
    expect(html).toContain('1 awaiting decision');
  });

  it('switches gates when the active Project changes', () => {
    const html = renderGates(stateWith(gates), 'project-b');
    expect(html).toContain('feat-b');
    expect(html).not.toContain('feat-a');
  });

  it('shows the empty state when Projects exist but none is selected', () => {
    const html = renderGates(stateWith(gates), null);
    expect(html).toContain('No pending gates');
    expect(html).toContain('0 awaiting decision');
  });
});
