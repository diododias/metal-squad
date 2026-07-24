// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EpicDetailPage } from '../../src/web/client/pages/EpicDetailPage.js';
import { parseHash } from '../../src/web/client/lib/routes.js';
import { readHashParams } from '../../src/web/client/lib/hashState.js';
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
  { epicId = 'epic-1', onBack = (): void => undefined, onOpenBacklogItem = (): void => undefined, send: providedSend }: {
    epicId?: string;
    onBack?: () => void;
    onOpenBacklogItem?: (featureId: string) => void;
    send?: (message: WebSocketClientMessage) => void;
  } = {},
): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const send: (message: WebSocketClientMessage) => void = providedSend ?? (() => undefined);
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

beforeEach(() => {
  window.location.hash = '';
});

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

describe('Epic approval action', () => {
  it('shows Approve only for an in_review Epic and sends optimistic revision', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const container = render(baseState({ epics: [{ ...baseState().epics[0]!, status: 'in_review', revision: 7 }] }), { send });
    const approve = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Approve');
    expect(approve).toBeDefined();
    act(() => { approve?.click(); });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'action:approveEpic', epicId: 'epic-1', expectedRevision: 7 }));
  });

  it('does not offer approval once the Epic is done', () => {
    const container = render(baseState({ epics: [{ ...baseState().epics[0]!, status: 'done' }] }));
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Approve')).toBe(false);
  });
});

describe('EpicDetailPage', () => {
  it('renders a two-level breadcrumb that navigates to the project detail and projects list', () => {
    window.location.hash = '';
    const container = render(baseState());
    const buttons = [...container.querySelectorAll('button')];
    const projectCrumb = buttons.find((button) => button.textContent?.startsWith('Project One · P-'));
    const projectsCrumb = buttons.find((button) => button.textContent === 'Projects');
    expect(projectCrumb).toBeDefined();
    expect(projectsCrumb).toBeDefined();
    act(() => { projectCrumb?.click(); });
    expect(window.location.hash).toBe('#/projects/proj-1');
    act(() => { projectsCrumb?.click(); });
    expect(window.location.hash).toBe('#/projects');
  });

  it('renders the epic summary with derived progress and lifecycle status', () => {
    const container = render(baseState());
    expect(container.textContent).toContain('Epic One');
    expect(container.textContent).toContain('derived progress: 1/3');
    expect(container.textContent).toContain('in_progress');
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
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Edit Epic');
    if (!button) throw new Error('Edit Epic button not found');
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

  it('does not expose manual status editing', () => {
    const view = renderWithSend(baseState());
    openEditor(view.container);
    expect(view.container.querySelector('#epic-epic-1-status')).toBeNull();
    expect(view.container.textContent).toContain('status follows Work Item execution');
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

  function selectValue(container: HTMLDivElement, ariaLabel: string, value: string): void {
    const select = container.querySelector(`select[aria-label="${ariaLabel}"]`) as HTMLSelectElement;
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function typeQuery(container: HTMLDivElement, value: string): void {
    const input = container.querySelector('input[aria-label="Search Work Items"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('filters by failed run status', () => {
    const state = baseState({
      runs: [
        { featureId: 'feat-1', status: 'done', runId: 1 },
        { featureId: 'feat-2', status: 'failed', runId: 2 },
      ],
    } as unknown as Partial<MsqWebState>);
    const container = render(state);
    selectValue(container, 'Run status', 'failed');
    const visible = rows(container);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain('Item feat-2');
  });

  it('filters by not started (items without a run)', () => {
    const container = render(baseState());
    selectValue(container, 'Run status', 'not_started');
    const visible = rows(container);
    expect(visible).toHaveLength(2);
    expect(visible.map((row) => row.textContent).join(' ')).not.toContain('Item feat-1');
  });

  it('combines type, repo and search filters', () => {
    const container = render(baseState());
    selectValue(container, 'Work Item type filter', 'feature');
    selectValue(container, 'Repository filter', 'repo-one');
    expect(rows(container)).toHaveLength(1);
    typeQuery(container, 'no-such-item');
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).toContain('No matching Work Items.');
    expect(container.textContent).not.toContain('No Work Items in this Epic yet.');
  });

  it('filters unresolved repo items', () => {
    const container = render(baseState());
    selectValue(container, 'Repository filter', 'unresolved');
    const visible = rows(container);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain('Item feat-3');
  });

  it('orders by title and by run status', () => {
    const state = baseState({
      featureCatalog: {
        'feat-1': workItem('feat-1', { title: 'Zebra' }),
        'feat-2': workItem('feat-2', { title: 'Alpha' }),
      },
      runs: [{ featureId: 'feat-1', status: 'running', runId: 1 }],
    } as unknown as Partial<MsqWebState>);
    const container = render(state);
    selectValue(container, 'Work Item order', 'title');
    expect(rows(container)[0]?.textContent).toContain('Alpha');
    selectValue(container, 'Work Item order', 'status');
    expect(rows(container)[0]?.textContent).toContain('Zebra');
  });

  it('keeps the epic summary progress stable while filters are active', () => {
    const container = render(baseState());
    selectValue(container, 'Run status', 'failed');
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).toContain('derived progress: 1/3');
  });

  it('applies pagination after the filter and resets the page on filter change', () => {
    const catalog: Record<string, unknown> = {};
    for (let index = 0; index < 10; index += 1) catalog[`feat-${String(index)}`] = workItem(`feat-${String(index)}`);
    const container = render(baseState({ featureCatalog: catalog, runs: [] } as unknown as Partial<MsqWebState>));
    const next = [...container.querySelectorAll('button')].find((button) => button.textContent === 'next');
    act(() => { next?.click(); });
    expect(rows(container)).toHaveLength(2);
    selectValue(container, 'Run status', 'not_started');
    expect(rows(container)).toHaveLength(8);
  });
});

describe('EpicDetailPage row execution actions (PF-15)', () => {
  function renderRow(state: MsqWebState): { container: HTMLDivElement; send: ReturnType<typeof vi.fn>; onToast: ReturnType<typeof vi.fn> } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const send = vi.fn();
    const onToast = vi.fn();
    act(() => {
      root.render(
        <EpicDetailPage
          state={state}
          projectId="proj-1"
          epicId="epic-1"
          send={send}
          actionResults={{}}
          onBack={() => undefined}
          onOpenBacklogItem={() => undefined}
          onToast={onToast}
        />,
      );
    });
    return { container, send, onToast };
  }

  function startButtonIn(row: HTMLElement | undefined): HTMLButtonElement | undefined {
    return [...(row?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'start') as HTMLButtonElement | undefined;
  }

  it('starts an eligible item from the row without navigating', () => {
    window.location.hash = '#/projects/proj-1/epics/epic-1';
    const view = renderRow(baseState());
    const row = rows(view.container).find((candidate) => candidate.textContent?.includes('Item feat-2'));
    const start = startButtonIn(row);
    expect(start?.disabled).toBe(false);
    act(() => { start?.click(); });
    expect(view.send).toHaveBeenCalledWith({ type: 'action:startFeature', featureId: 'feat-2' });
    expect(window.location.hash).toBe('#/projects/proj-1/epics/epic-1');
    const toast = view.onToast.mock.calls[0]?.[0] as { tone: string; message: string; action?: { label: string; onSelect: () => void } };
    expect(toast.tone).toBe('ok');
    expect(toast.message).toContain('Item feat-2');
    toast.action?.onSelect();
    expect(window.location.hash).toBe('#/runs/feat-2');
  });

  it('disables start with the pending dependency reason and does not emit the action', () => {
    const state = baseState({
      featureCatalog: {
        'feat-1': workItem('feat-1', { dependsOn: ['feat-9'] }),
      },
      runs: [],
    } as unknown as Partial<MsqWebState>);
    const view = renderRow(state);
    const start = startButtonIn(rows(view.container)[0]);
    expect(start?.disabled).toBe(true);
    expect(start?.title).toContain('Pending dependencies: feat-9');
    act(() => { start?.click(); });
    expect(view.send).not.toHaveBeenCalled();
  });

  it('disables start when the repository is unavailable or the item has an integrity issue', () => {
    const state = baseState({
      featureCatalog: {
        'feat-1': workItem('feat-1', { repoId: 'repo-1' }),
        'feat-2': workItem('feat-2', { integrityIssue: 'workflow template missing' }),
      },
      repositories: [{ repoId: 'repo-1', projectId: 'proj-1', label: 'repo-one', health: 'unavailable', lastCheckedAt: null }],
      runs: [],
    } as unknown as Partial<MsqWebState>);
    const view = renderRow(state);
    const allRows = rows(view.container);
    const repoRow = allRows.find((row) => row.textContent?.includes('Item feat-1'));
    const integrityRow = allRows.find((row) => row.textContent?.includes('Item feat-2'));
    expect(startButtonIn(repoRow)?.disabled).toBe(true);
    expect(startButtonIn(repoRow)?.title).toContain('Repository unavailable');
    expect(startButtonIn(integrityRow)?.disabled).toBe(true);
    expect(startButtonIn(integrityRow)?.title).toContain('Integrity issue');
  });

  it('shows Abort instead of Start while a run is active', () => {
    window.location.hash = '#/projects/proj-1/epics/epic-1';
    const state = baseState({
      runs: [{ featureId: 'feat-1', status: 'running', runId: 7, pipelineId: 1 }],
    } as unknown as Partial<MsqWebState>);
    const view = renderRow(state);
    const row = rows(view.container).find((candidate) => candidate.textContent?.includes('Item feat-1'));
    expect(startButtonIn(row)).toBeUndefined();
    const abort = [...(row?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Abort');
    expect(abort).toBeDefined();
    act(() => { abort?.click(); });
    expect(view.send).toHaveBeenCalledWith({ type: 'action:abortPipeline', pipelineId: 1 });
  });
});

describe('EpicDetailPage archived visibility (PF-17)', () => {
  type ArchivedResult = Extract<WebSocketServerMessage, { type: 'action:archivedResult' }>;

  function archivedEntry(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      kind: 'work_item',
      id,
      title: `Archived ${id}`,
      parentLabel: 'Epic One',
      parentId: 'epic-1',
      repoLabel: 'repo-one',
      workItemType: 'feature',
      archivedAt: '2026-07-10T00:00:00.000Z',
      revision: 3,
      allowed: { archive: false, restore: true, delete: false, cancel: false, deleted: false },
      ...overrides,
    };
  }

  function renderArchived(state: MsqWebState, epicId = 'epic-1'): {
    container: HTMLDivElement;
    send: ReturnType<typeof vi.fn>;
    rerender: (archivedResults: Record<string, ArchivedResult>) => void;
  } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const send = vi.fn();
    const element = (archivedResults: Record<string, ArchivedResult>): React.JSX.Element => (
      <EpicDetailPage
        state={state}
        projectId="proj-1"
        epicId={epicId}
        send={send}
        actionResults={{}}
        archivedResults={archivedResults}
        onBack={() => undefined}
        onOpenBacklogItem={() => undefined}
      />
    );
    act(() => { root.render(element({})); });
    return { container, send, rerender: (archivedResults) => { act(() => { root.render(element(archivedResults)); }); } };
  }

  it('queries archived work items scoped to the epic when the toggle is turned on and renders them attenuated', () => {
    const view = renderArchived(baseState());
    expect(view.send).not.toHaveBeenCalled();
    const checkbox = view.container.querySelector('input[aria-label="Show archived Work Items"]') as HTMLInputElement;
    act(() => { checkbox.click(); });
    const message = view.send.mock.calls.map((call) => call[0] as { type: string; requestId: string; filters?: Record<string, string> }).find((item) => item.type === 'action:queryArchived');
    expect(message?.filters).toEqual({ epicId: 'epic-1', kind: 'work_item' });
    view.rerender({
      [message!.requestId]: {
        type: 'action:archivedResult',
        payload: { requestId: message!.requestId, ok: true, items: [archivedEntry('feat-9')], total: 1, limit: 50, offset: 0 },
      } as unknown as ArchivedResult,
    });
    const row = view.container.querySelector('[aria-label="Archived feat-9 (archived)"]');
    expect(row).not.toBeNull();
    const restore = [...(row?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Restore');
    expect(restore).toBeDefined();
    expect(rows(view.container)).toHaveLength(3);
  });

  it('shows an archived state with restore instead of not-found for a directly routed archived epic', () => {
    const state = baseState({ epics: [] } as unknown as Partial<MsqWebState>);
    const view = renderArchived(state);
    const probe = view.send.mock.calls.map((call) => call[0] as { type: string; requestId: string; filters?: Record<string, string> }).find((item) => item.type === 'action:queryArchived');
    expect(probe?.filters).toEqual({ projectId: 'proj-1', kind: 'epic' });
    view.rerender({
      [probe!.requestId]: {
        type: 'action:archivedResult',
        payload: { requestId: probe!.requestId, ok: true, items: [archivedEntry('epic-1', { kind: 'epic', title: 'Epic One', repoLabel: null, workItemType: null })], total: 1, limit: 50, offset: 0 },
      } as unknown as ArchivedResult,
    });
    expect(view.container.textContent).not.toContain('Epic not found or no longer active.');
    expect(view.container.textContent).toContain('Epic One');
    expect(view.container.textContent).toContain('Epic archived');
    const restore = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Restore');
    expect(restore).toBeDefined();
  });

  it('keeps the plain not-found state when the epic is not in the archived results', () => {
    const state = baseState({ epics: [] } as unknown as Partial<MsqWebState>);
    const view = renderArchived(state, 'missing');
    const probe = view.send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((item) => item.type === 'action:queryArchived');
    view.rerender({
      [probe!.requestId]: {
        type: 'action:archivedResult',
        payload: { requestId: probe!.requestId, ok: true, items: [], total: 0, limit: 50, offset: 0 },
      } as unknown as ArchivedResult,
    });
    expect(view.container.textContent).toContain('Epic not found or no longer active.');
  });
});

describe('route query suffix (PF-11)', () => {
  it('ignores a query suffix when parsing routes', () => {
    expect(parseHash('#/projects/p1?tab=templates')).toEqual({ page: 'project-detail', projectId: 'p1' });
    expect(parseHash('#/projects/p1/epics/e1?foo=bar')).toEqual({ page: 'epic-detail', projectId: 'p1', epicId: 'e1' });
  });
});

describe('EpicDetailPage filter persistence (PF-18)', () => {
  it('applies work item filters from a deep link on mount', () => {
    window.location.hash = '#/projects/proj-1/epics/epic-1?type=bug&order=title';
    const container = render(baseState());
    expect((container.querySelector('select[aria-label="Work Item type filter"]') as HTMLSelectElement).value).toBe('bug');
    expect((container.querySelector('select[aria-label="Work Item order"]') as HTMLSelectElement).value).toBe('title');
    const visible = rows(container);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain('Item feat-2');
  });

  it('degrades invalid query values to defaults without crashing', () => {
    window.location.hash = '#/projects/proj-1/epics/epic-1?status=banana&type=chore&order=sideways';
    const container = render(baseState());
    expect((container.querySelector('select[aria-label="Run status"]') as HTMLSelectElement).value).toBe('all');
    expect((container.querySelector('select[aria-label="Work Item type filter"]') as HTMLSelectElement).value).toBe('all');
    expect((container.querySelector('select[aria-label="Work Item order"]') as HTMLSelectElement).value).toBe('backlog');
    expect(rows(container)).toHaveLength(3);
  });

  it('writes filter changes into the hash and the project breadcrumb restores its saved query', () => {
    window.location.hash = '#/projects/proj-1?status=done';
    // Simulate the project page having written its query before drill-down.
    readHashParams();
    window.location.hash = '#/projects/proj-1/epics/epic-1';
    const container = render(baseState());
    const statusSelect = container.querySelector('select[aria-label="Run status"]') as HTMLSelectElement;
    act(() => {
      statusSelect.value = 'failed';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(window.location.hash).toContain('status=failed');
    const projectCrumb = [...container.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Project One · P-'));
    act(() => { projectCrumb?.click(); });
    expect(window.location.hash).toBe('#/projects/proj-1?status=done');
  });
});
