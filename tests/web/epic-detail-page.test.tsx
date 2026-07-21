// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpicDetailPage } from '../../src/web/client/pages/EpicDetailPage.js';
import { parseHash } from '../../src/web/client/lib/routes.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function workItem(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Item ${id}`,
    epicId: 'epic-1',
    workItemType: 'feature',
    repoLabel: 'repo-one',
    workflow: { stages: ['specify', 'implement'] },
    dependsOn: [],
    integrityIssue: null,
    ...overrides,
  };
}

function baseState(overrides: Partial<MsqWebState> = {}): MsqWebState {
  return {
    featureCatalog: {
      'feat-1': workItem('feat-1'),
      'feat-2': workItem('feat-2', { workItemType: 'bug', repoLabel: 'repo-two' }),
      'feat-3': workItem('feat-3', { repoLabel: null }),
    },
    projects: [{
      projectId: 'proj-1',
      name: 'Project One',
      position: 0,
      description: null,
      revision: 1,
      counts: { epics: 1, workItems: 3, archived: 0 },
      activeRuns: 0,
      tokens: { status: 'ready' },
      archivedAt: null,
    }],
    repositories: [],
    epics: [{
      epicId: 'epic-1',
      projectId: 'proj-1',
      repoId: null,
      title: 'Epic One',
      description: 'The first epic.',
      status: 'in_progress',
      position: 0,
      archivedAt: null,
      deletedAt: null,
      revision: 1,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }],
    runs: [{ featureId: 'feat-1', status: 'done', runId: 1 }],
    workflowTemplates: [],
    workflowTemplateMappings: {},
    ...overrides,
  } as unknown as MsqWebState;
}

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

function render(
  state: MsqWebState,
  { epicId = 'epic-1', onBack = (): void => undefined, onOpenBacklogItem = (): void => undefined }: {
    epicId?: string;
    onBack?: () => void;
    onOpenBacklogItem?: (featureId: string) => void;
  } = {},
): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const send: (message: WebSocketClientMessage) => void = () => undefined;
  const actionResults: Record<string, ActionResult> = {};
  act(() => {
    root.render(
      <EpicDetailPage
        state={state}
        projectId="proj-1"
        epicId={epicId}
        send={send}
        actionResults={actionResults}
        onBack={onBack}
        onOpenBacklogItem={onOpenBacklogItem}
      />,
    );
  });
  return container;
}

function rows(container: HTMLDivElement): HTMLElement[] {
  return [...container.querySelectorAll('[role="link"]')] as HTMLElement[];
}

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

describe('epic-detail route parsing', () => {
  it('parses the epic route before the generic project route', () => {
    expect(parseHash('#/projects/p1/epics/e1')).toEqual({ page: 'epic-detail', projectId: 'p1', epicId: 'e1' });
    expect(parseHash('#/projects/p1')).toEqual({ page: 'project-detail', projectId: 'p1' });
  });
});

describe('EpicDetailPage', () => {
  it('renders a two-level breadcrumb that navigates to the project detail and projects list', () => {
    window.location.hash = '';
    const container = render(baseState());
    const buttons = [...container.querySelectorAll('button')];
    const projectCrumb = buttons.find((button) => button.textContent === 'Project One');
    const projectsCrumb = buttons.find((button) => button.textContent === 'Projects');
    expect(projectCrumb).toBeDefined();
    expect(projectsCrumb).toBeDefined();
    act(() => { projectCrumb?.click(); });
    expect(window.location.hash).toBe('#/projects/proj-1');
    act(() => { projectsCrumb?.click(); });
    expect(window.location.hash).toBe('#/projects');
  });

  it('renders the epic summary with derived progress and manual status', () => {
    const container = render(baseState());
    expect(container.textContent).toContain('Epic One');
    expect(container.textContent).toContain('derived progress: 1/3');
    expect(container.textContent).toContain('manual: in_progress');
    expect(container.textContent).toContain('The first epic.');
  });

  it('renders work items from distinct repos with their labels and unresolved fallback', () => {
    const container = render(baseState());
    const allRows = rows(container);
    expect(allRows).toHaveLength(3);
    expect(container.textContent).toContain('repo-one');
    expect(container.textContent).toContain('repo-two');
    expect(container.textContent).toContain('unresolved repo');
  });

  it('navigates to the backlog item on click', () => {
    const onOpenBacklogItem = vi.fn();
    const container = render(baseState(), { onOpenBacklogItem });
    act(() => { rows(container)[0]?.click(); });
    expect(onOpenBacklogItem).toHaveBeenCalledWith('feat-1');
  });

  it('rows are focusable and activate with Enter', () => {
    const onOpenBacklogItem = vi.fn();
    const container = render(baseState(), { onOpenBacklogItem });
    const row = rows(container)[1];
    expect(row?.tabIndex).toBe(0);
    act(() => {
      row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onOpenBacklogItem).toHaveBeenCalledWith('feat-2');
  });

  it('paginates when the epic has more items than the page size', () => {
    const catalog: Record<string, Record<string, unknown>> = {};
    for (let index = 0; index < 10; index += 1) catalog[`feat-${String(index)}`] = workItem(`feat-${String(index)}`);
    const container = render(baseState({ featureCatalog: catalog } as unknown as Partial<MsqWebState>));
    expect(rows(container)).toHaveLength(8);
    const next = [...container.querySelectorAll('button')].find((button) => button.textContent === 'next');
    expect(next).toBeDefined();
    act(() => { next?.click(); });
    expect(rows(container)).toHaveLength(2);
  });

  it('shows an empty state for an epic without work items', () => {
    const container = render(baseState({ featureCatalog: {} } as unknown as Partial<MsqWebState>));
    expect(container.textContent).toContain('No Work Items in this Epic yet.');
  });

  it('shows not-found for an unknown epic id', () => {
    const onBack = vi.fn();
    const container = render(baseState(), { epicId: 'missing', onBack });
    expect(container.textContent).toContain('Epic not found or no longer active.');
    const back = [...container.querySelectorAll('button')].find((button) => button.textContent === 'back to Project');
    act(() => { back?.click(); });
    expect(onBack).toHaveBeenCalled();
  });

  it('shows not-found for an archived epic', () => {
    const state = baseState();
    (state.epics[0] as unknown as { archivedAt: string | null }).archivedAt = '2026-07-10T00:00:00.000Z';
    const container = render(state);
    expect(container.textContent).toContain('Epic not found or no longer active.');
  });
});

describe('EpicDetailPage edit modal (PF-06)', () => {
  function renderWithSend(state: MsqWebState): { container: HTMLDivElement; send: ReturnType<typeof vi.fn>; rerender: (actionResults: Record<string, ActionResult>) => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const send = vi.fn();
    const element = (actionResults: Record<string, ActionResult>): React.JSX.Element => (
      <EpicDetailPage
        state={state}
        projectId="proj-1"
        epicId="epic-1"
        send={send}
        actionResults={actionResults}
        onBack={() => undefined}
        onOpenBacklogItem={() => undefined}
      />
    );
    act(() => { root.render(element({})); });
    return { container, send, rerender: (actionResults) => { act(() => { root.render(element(actionResults)); }); } };
  }

  function openEditor(container: HTMLDivElement): void {
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'editar Épico');
    if (!button) throw new Error('editar Épico button not found');
    act(() => { button.click(); });
  }

  it('opens the EpicEditor inside a modal from the header action', () => {
    const view = renderWithSend(baseState());
    expect(view.container.querySelector('[aria-label="Edit Epic"]')).toBeNull();
    openEditor(view.container);
    const dialog = view.container.querySelector('[aria-label="Edit Epic"]');
    expect(dialog).not.toBeNull();
    expect((dialog?.querySelector('#epic-epic-1-title') as HTMLInputElement).value).toBe('Epic One');
  });

  it('saves the manual status via action:updateEpic with expectedRevision', () => {
    const view = renderWithSend(baseState());
    openEditor(view.container);
    const statusSelect = view.container.querySelector('#epic-epic-1-status') as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(statusSelect), 'value')?.set?.call(statusSelect, 'done');
    act(() => { statusSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    const save = [...view.container.querySelectorAll('button')].find((item) => item.textContent?.startsWith('save'));
    act(() => { save?.click(); });
    const message = view.send.mock.calls.map((call) => call[0] as { type: string; patch?: { status?: string }; expectedRevision?: number }).find((item) => item.type === 'action:updateEpic');
    expect(message?.patch?.status).toBe('done');
    expect(message?.expectedRevision).toBe(1);
  });

  it('surfaces the revision-conflict recovery actions inside the modal', () => {
    const view = renderWithSend(baseState());
    openEditor(view.container);
    const titleInput = view.container.querySelector('#epic-epic-1-title') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(titleInput), 'value')?.set?.call(titleInput, 'Renamed');
    act(() => { titleInput.dispatchEvent(new Event('input', { bubbles: true })); });
    const save = [...view.container.querySelectorAll('button')].find((item) => item.textContent?.startsWith('save'));
    act(() => { save?.click(); });
    const message = view.send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((item) => item.type === 'action:updateEpic');
    view.rerender({ [message!.requestId]: { type: 'action:result', payload: { requestId: message!.requestId, ok: false, error: { code: 'REVISION_CONFLICT', message: 'Epic was modified by someone else.' } } } as unknown as ActionResult });
    expect(view.container.querySelector('[aria-label="Edit Epic"]')).not.toBeNull();
    expect(view.container.textContent).toContain('Epic was modified by someone else.');
  });
});
