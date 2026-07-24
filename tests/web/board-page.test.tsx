// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { BoardPage } from '../../src/web/client/pages/BoardPage.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const state = {
  runs: [],
  pendingFeatures: [],
  featureCatalog: {},
} as unknown as MsqWebState;

function renderBoard(): string {
  return renderToStaticMarkup(
    <BoardPage
      state={state}
      isMobile={false}
      onOpenRun={() => {}}
      onOpenBacklogItem={() => {}}
    />,
  );
}

describe('BoardPage view', () => {
  it('renders only the status columns', () => {
    const html = renderBoard();
    expect(html).toContain('IN PROGRESS / BLOCKED');
    expect(html).toContain('DONE');
    expect(html).toContain('FAILED / ABORTED');
  });

  it('does not render any workflow stage columns', () => {
    const html = renderBoard();
    for (const stage of ['specify', 'plan', 'tasks', 'implement', 'validate']) {
      expect(html).not.toContain(stage.toUpperCase());
    }
  });

  it('does not render a view toggle control', () => {
    const html = renderBoard();
    expect(html).not.toContain('by status');
    expect(html).not.toContain('by workflow stage');
  });
});

function project(projectId: string, position: number): NonNullable<MsqWebState['projects']>[number] {
  return { projectId, name: `Project ${projectId}`, position, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null };
}

function pendingFeature(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: overrides.id,
    title: overrides.id,
    tool: 'codex',
    workflow: { stages: ['implement'], autoAdvance: false },
    ...overrides,
  };
}

const scopedState = {
  projects: [project('project-a', 0), project('project-b', 1)],
  repositories: [],
  runs: [
    { runId: 1, featureId: 'feat-b1', status: 'running', stage: 'implement', tool: 'codex', totalTokens: 0 },
  ],
  pendingFeatures: [
    pendingFeature({ id: 'feat-a1', epicId: 'epic-1', epicTitle: 'Epic One', workItemType: 'feature' }),
    pendingFeature({ id: 'feat-a2', epicId: 'epic-2', epicTitle: 'Epic Two', workItemType: 'bug' }),
  ],
  featureCatalog: {
    'feat-a1': { id: 'feat-a1', title: 'feat-a1', projectId: 'project-a', epicId: 'epic-1', epicTitle: 'Epic One', workItemType: 'feature', tool: 'codex', workflow: { stages: ['implement'] } },
    'feat-a2': { id: 'feat-a2', title: 'feat-a2', projectId: 'project-a', epicId: 'epic-2', epicTitle: 'Epic Two', workItemType: 'bug', tool: 'codex', workflow: { stages: ['implement'] } },
    'feat-b1': { id: 'feat-b1', title: 'feat-b1', projectId: 'project-b', epicId: 'epic-3', epicTitle: 'Epic Three', workItemType: 'feature', tool: 'codex', workflow: { stages: ['implement'] } },
  },
} as unknown as MsqWebState;

function renderScopedBoard(activeProjectId: string | null): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <ActiveProjectContext.Provider value={{ activeProjectId, activeProject: null, setActiveProject: () => {}, selectionInvalidated: false }}>
        <BoardPage state={scopedState} isMobile={false} onOpenRun={() => {}} onOpenBacklogItem={() => {}} />
      </ActiveProjectContext.Provider>,
    );
  });
  roots.push(root);
  return container;
}

const roots: Root[] = [];

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

describe('BoardPage Project scope', () => {
  it('scopes the TODO column and run columns to the active Project', () => {
    const container = renderScopedBoard('project-a');
    expect(container.textContent).toContain('TODO (2)');
    expect(container.textContent).toContain('feat-a1');
    expect(container.textContent).toContain('feat-a2');
    expect(container.textContent).not.toContain('feat-b1');
    expect(container.textContent).toContain('IN PROGRESS / BLOCKED (0)');
  });

  it('switches every column when the active Project changes', () => {
    const container = renderScopedBoard('project-b');
    expect(container.textContent).toContain('TODO (0)');
    expect(container.textContent).toContain('IN PROGRESS / BLOCKED (1)');
    expect(container.textContent).toContain('feat-b1');
    expect(container.textContent).not.toContain('feat-a1');
  });

  it('shows no items anywhere when Projects exist but none is selected (mandatory selection)', () => {
    const container = renderScopedBoard(null);
    expect(container.textContent).toContain('TODO (0)');
    expect(container.textContent).toContain('IN PROGRESS / BLOCKED (0)');
    expect(container.textContent).not.toContain('feat-a1');
    expect(container.textContent).not.toContain('feat-b1');
  });

  it('only lists Epics belonging to the active Project in the Epic filter', () => {
    const container = renderScopedBoard('project-a');
    const epicSelect = container.querySelectorAll('select')[0];
    const optionLabels = Array.from(epicSelect?.querySelectorAll('option') ?? []).map((option) => option.textContent);
    expect(optionLabels).toEqual(['all epics', 'Epic One', 'Epic Two']);
  });

  it('composes Epic and type filters as an AND predicate on top of the Project scope', () => {
    const container = renderScopedBoard('project-a');
    const [epicSelect, typeSelect] = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(epicSelect), 'value');
      descriptor?.set?.call(epicSelect, 'epic-1');
      epicSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('feat-a1');
    expect(container.textContent).not.toContain('feat-a2');

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(typeSelect), 'value');
      descriptor?.set?.call(typeSelect, 'bug');
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // epic-1 only has a "feature" item; requiring type "bug" on top of it leaves nothing.
    expect(container.textContent).toContain('No pending features');
    expect(container.textContent).not.toContain('feat-a1');
  });

  it('narrows to the selected type across the active Project', () => {
    const container = renderScopedBoard('project-a');
    const typeSelect = Array.from(container.querySelectorAll('select'))[1] as HTMLSelectElement;

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(typeSelect), 'value');
      descriptor?.set?.call(typeSelect, 'bug');
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('feat-a2');
    expect(container.textContent).not.toContain('feat-a1');
  });
});
