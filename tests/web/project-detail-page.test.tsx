// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailPage } from '../../src/web/client/pages/ProjectDetailPage.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function epicRow(epicId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    epicId,
    projectId: 'proj-1',
    repoId: null,
    title: `Epic ${epicId}`,
    description: null,
    status: 'todo',
    position: 0,
    archivedAt: null,
    deletedAt: null,
    revision: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseState(overrides: Partial<MsqWebState> = {}): MsqWebState {
  return {
    featureCatalog: {
      'feat-1': { id: 'feat-1', title: 'Item one', epicId: 'epic-1', workItemType: 'feature', repoLabel: 'repo-one', workflow: { stages: [] }, dependsOn: [], integrityIssue: null },
      'feat-2': { id: 'feat-2', title: 'Item two', epicId: 'epic-1', workItemType: 'bug', repoLabel: 'repo-two', workflow: { stages: [] }, dependsOn: [], integrityIssue: null },
    },
    projects: [{
      projectId: 'proj-1',
      name: 'Project One',
      position: 0,
      description: null,
      revision: 1,
      counts: { epics: 1, workItems: 2, archived: 0 },
      activeRuns: 0,
      tokens: { status: 'ready' },
      archivedAt: null,
    }],
    repositories: [{ repoId: 'repo-1', projectId: 'proj-1', label: 'repo-one', health: 'ok', lastCheckedAt: null }],
    epics: [epicRow('epic-1', { title: 'Epic One', status: 'in_progress' })],
    runs: [{ featureId: 'feat-1', status: 'done', runId: 1 }],
    lifecycle: { 'epic:epic-1': { archive: true, restore: false, delete: false, cancel: false, deleted: false } },
    workflowTemplates: [],
    workflowTemplateMappings: {},
    ...overrides,
  } as unknown as MsqWebState;
}

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

function render(state: MsqWebState): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const send: (message: WebSocketClientMessage) => void = () => undefined;
  const actionResults: Record<string, ActionResult> = {};
  act(() => {
    root.render(
      <ProjectDetailPage state={state} projectId="proj-1" send={send} actionResults={actionResults} onBack={() => undefined} />,
    );
  });
  return container;
}

function rows(container: HTMLDivElement): HTMLElement[] {
  return [...container.querySelectorAll('[role="link"]')] as HTMLElement[];
}

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

describe('ProjectDetailPage as epic list', () => {
  it('renders epic rows with derived progress, work item count, and repo tags', () => {
    const container = render(baseState());
    const allRows = rows(container);
    expect(allRows).toHaveLength(1);
    expect(container.textContent).toContain('Epic One');
    expect(container.textContent).toContain('derived progress: 1/2');
    expect(container.textContent).toContain('2 Work Items');
    expect(container.textContent).toContain('repo-one: 1');
    expect(container.textContent).toContain('repo-two: 1');
    expect(container.textContent).toContain('manual: in_progress');
  });

  it('navigates to the epic detail hash on row click', () => {
    const container = render(baseState());
    act(() => { rows(container)[0]?.click(); });
    expect(window.location.hash).toBe('#/projects/proj-1/epics/epic-1');
  });

  it('rows are focusable and navigate with Enter', () => {
    const container = render(baseState());
    const row = rows(container)[0];
    expect(row?.tabIndex).toBe(0);
    act(() => {
      row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(window.location.hash).toBe('#/projects/proj-1/epics/epic-1');
  });

  it('clicking lifecycle controls inside the row does not navigate', () => {
    const container = render(baseState());
    const row = rows(container)[0];
    const lifecycleButton = [...(row?.querySelectorAll('button') ?? [])][0];
    expect(lifecycleButton).toBeDefined();
    act(() => { lifecycleButton?.click(); });
    expect(window.location.hash).toBe('');
  });

  it('renders no creation forms in the page body (templates section selects may remain until PF-11)', () => {
    const container = render(baseState());
    expect(container.querySelector('#new-epic-title')).toBeNull();
    expect(container.querySelector('#new-work-item-title')).toBeNull();
    expect(container.querySelector('select[aria-label="Epic"]')).toBeNull();
    expect(container.querySelector('select[aria-label="Repository"]')).toBeNull();
    expect(container.querySelector('select[aria-label="Work Item type"]')).toBeNull();
    expect(container.textContent).not.toContain('Create Epic');
    expect(container.textContent).not.toContain('Create Work Item');
  });

  it('paginates when the project has more epics than the page size', () => {
    const epics = Array.from({ length: 10 }, (_, index) => epicRow(`epic-${String(index)}`));
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    expect(rows(container)).toHaveLength(8);
    const next = [...container.querySelectorAll('button')].find((button) => button.textContent === 'next');
    act(() => { next?.click(); });
    expect(rows(container)).toHaveLength(2);
  });

  it('shows the empty state with a "+ Novo Épico" CTA', () => {
    const container = render(baseState({ epics: [] } as unknown as Partial<MsqWebState>));
    expect(container.textContent).toContain('No Epics yet.');
    const ctas = [...container.querySelectorAll('button')].filter((button) => button.textContent === '+ Novo Épico');
    expect(ctas.length).toBeGreaterThanOrEqual(1);
  });

  it('excludes archived epics from the list', () => {
    const epics = [epicRow('epic-1'), epicRow('epic-2', { archivedAt: '2026-07-10T00:00:00.000Z' })];
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    expect(rows(container)).toHaveLength(1);
  });

  it('shows not-found for an unknown project', () => {
    const state = baseState({ projects: [] } as unknown as Partial<MsqWebState>);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const onBack = vi.fn();
    act(() => {
      root.render(
        <ProjectDetailPage state={state} projectId="proj-1" send={() => undefined} actionResults={{}} onBack={onBack} />,
      );
    });
    expect(container.textContent).toContain('Project not found or no longer active.');
  });
});
