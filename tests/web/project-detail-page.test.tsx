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
  it('places the search before the project description in the header', () => {
    const container = render(baseState({ projects: [{ ...baseState().projects[0]!, description: 'Project description' }] }));
    const search = container.querySelector('input[aria-label="Search Epics"]');
    const description = container.querySelector('.msq-page-header-description');

    expect(search?.compareDocumentPosition(description ?? null) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders epic rows with title, work item count, and dates', () => {
    const container = render(baseState());
    const allRows = rows(container);
    expect(allRows).toHaveLength(1);
    expect(container.textContent).toContain('Epic One');
    expect(container.textContent).toContain('2 work items');
    expect(container.textContent).toContain('created');
    expect(container.textContent).toContain('updated');
    expect(container.textContent).toMatch(/P-[0-9A-F]{8}/);
    expect(container.textContent).toMatch(/E-[0-9A-F]{8}/);
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

  it('clicking the row body navigates to the epic hash', () => {
    const container = render(baseState());
    const row = rows(container)[0];
    act(() => { row?.click(); });
    expect(window.location.hash).toBe('#/projects/proj-1/epics/epic-1');
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

  it('shows the empty state with a "+ New Epic" CTA', () => {
    const container = render(baseState({ epics: [] } as unknown as Partial<MsqWebState>));
    expect(container.textContent).toContain('No Epics yet.');
    const ctas = [...container.querySelectorAll('button')].filter((button) => button.textContent === '+ New Epic');
    expect(ctas.length).toBeGreaterThanOrEqual(1);
  });

  it('excludes archived epics from the list', () => {
    const epics = [epicRow('epic-1'), epicRow('epic-2', { archivedAt: '2026-07-10T00:00:00.000Z' })];
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    expect(rows(container)).toHaveLength(1);
  });

  it('filters epics by manual status', () => {
    const epics = [
      epicRow('epic-1', { title: 'Alpha', status: 'todo' }),
      epicRow('epic-2', { title: 'Beta', status: 'done' }),
    ];
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    const statusSelect = container.querySelector('select[aria-label="Epic status"]') as HTMLSelectElement;
    act(() => {
      statusSelect.value = 'done';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const visible = rows(container);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain('Beta');
  });

  it('search is case-insensitive and combines with the status filter', () => {
    const epics = [
      epicRow('epic-1', { title: 'Payments Alpha', status: 'done' }),
      epicRow('epic-2', { title: 'Payments Beta', status: 'todo' }),
      epicRow('epic-3', { title: 'Search', status: 'done' }),
    ];
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    const search = container.querySelector('input[aria-label="Search Epics"]') as HTMLInputElement;
    const statusSelect = container.querySelector('select[aria-label="Epic status"]') as HTMLSelectElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'payments');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      statusSelect.value = 'done';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const visible = rows(container);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain('Payments Alpha');
  });

  it('orders by derived progress with position as tie-breaker', () => {
    const epics = [
      epicRow('epic-a', { title: 'Zero progress', position: 0 }),
      epicRow('epic-1', { title: 'Half done', position: 1 }),
    ];
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    const orderSelect = container.querySelector('select[aria-label="Epic order"]') as HTMLSelectElement;
    act(() => {
      orderSelect.value = 'progress';
      orderSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const visible = rows(container);
    expect(visible[0]?.textContent).toContain('Half done');
    expect(visible[1]?.textContent).toContain('Zero progress');
  });

  it('shows epic row with status even when all work items are done', () => {
    const state = baseState({
      epics: [epicRow('epic-1', { title: 'Diverged', status: 'todo' })],
      runs: [
        { featureId: 'feat-1', status: 'done', runId: 1 },
        { featureId: 'feat-2', status: 'done', runId: 2 },
      ],
    } as unknown as Partial<MsqWebState>);
    const container = render(state);
    expect(container.textContent).toContain('Diverged');
    expect(container.textContent).toContain('2 work items');
  });

  it('does not show a divergence badge when manual matches derived or the epic has no items', () => {
    const state = baseState({
      epics: [
        epicRow('epic-1', { title: 'Matched', status: 'in_progress' }),
        epicRow('epic-empty', { title: 'Empty epic', status: 'todo' }),
      ],
    } as unknown as Partial<MsqWebState>);
    const container = render(state);
    expect(container.textContent).not.toContain('derived: in_progress');
    expect(container.textContent).not.toContain('derived: todo');
  });

  it('shows a distinct empty state when filters match nothing', () => {
    const container = render(baseState());
    const search = container.querySelector('input[aria-label="Search Epics"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'no-such-epic');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).toContain('No matching Epics.');
    expect(container.textContent).not.toContain('No Epics yet.');
  });

  it('resets pagination when a filter changes', () => {
    const epics = Array.from({ length: 10 }, (_, index) => epicRow(`epic-${String(index)}`, { title: `Epic ${String(index)}`, position: index }));
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    const next = [...container.querySelectorAll('button')].find((button) => button.textContent === 'next');
    act(() => { next?.click(); });
    expect(rows(container)).toHaveLength(2);
    const search = container.querySelector('input[aria-label="Search Epics"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'Epic');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows(container)).toHaveLength(8);
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

describe('ProjectDetailPage archived visibility (PF-17)', () => {
  type ArchivedResult = Extract<WebSocketServerMessage, { type: 'action:archivedResult' }>;

  function archivedEntry(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      kind: 'epic',
      id,
      title: `Archived ${id}`,
      parentLabel: 'Project One',
      parentId: 'proj-1',
      repoLabel: null,
      workItemType: null,
      archivedAt: '2026-07-10T00:00:00.000Z',
      revision: 3,
      allowed: { archive: false, restore: true, delete: false, cancel: false, deleted: false },
      ...overrides,
    };
  }

  function renderArchived(state: MsqWebState): {
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
      <ProjectDetailPage
        state={state}
        projectId="proj-1"
        send={send}
        actionResults={{}}
        archivedResults={archivedResults}
        onBack={() => undefined}
      />
    );
    act(() => { root.render(element({})); });
    return { container, send, rerender: (archivedResults) => { act(() => { root.render(element(archivedResults)); }); } };
  }

  function toggleShowArchived(container: HTMLDivElement): void {
    const checkbox = container.querySelector('input[aria-label="Show archived Epics"]') as HTMLInputElement;
    act(() => { checkbox.click(); });
  }

  it('does not query archived epics until the toggle is turned on', () => {
    const view = renderArchived(baseState());
    expect(view.send).not.toHaveBeenCalled();
    toggleShowArchived(view.container);
    const message = view.send.mock.calls.map((call) => call[0] as { type: string; requestId: string; filters?: Record<string, string> }).find((item) => item.type === 'action:queryArchived');
    expect(message?.filters).toEqual({ projectId: 'proj-1', kind: 'epic' });
  });

  it('renders archived epics attenuated with a Restore action when the toggle is on', () => {
    const view = renderArchived(baseState());
    toggleShowArchived(view.container);
    const message = view.send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((item) => item.type === 'action:queryArchived');
    view.rerender({
      [message!.requestId]: {
        type: 'action:archivedResult',
        payload: { requestId: message!.requestId, ok: true, items: [archivedEntry('epic-9')], total: 1, limit: 50, offset: 0 },
      } as unknown as ArchivedResult,
    });
    const row = view.container.querySelector('[aria-label="Archived epic-9 (archived)"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('archived');
    const restore = [...(row?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Restore');
    expect(restore).toBeDefined();
    expect(rows(view.container)).toHaveLength(1);
  });

  it('drops an archived entry from the section once it is active again in state', () => {
    const view = renderArchived(baseState());
    toggleShowArchived(view.container);
    const message = view.send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((item) => item.type === 'action:queryArchived');
    view.rerender({
      [message!.requestId]: {
        type: 'action:archivedResult',
        payload: { requestId: message!.requestId, ok: true, items: [archivedEntry('epic-1')], total: 1, limit: 50, offset: 0 },
      } as unknown as ArchivedResult,
    });
    expect(view.container.querySelector('[aria-label="Archived epic-1 (archived)"]')).toBeNull();
  });
});

describe('ProjectDetailPage tabs (PF-11)', () => {
  function tabButton(container: HTMLDivElement, label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find((button) => button.textContent === label || button.textContent === `[${label}]`) as HTMLButtonElement | undefined;
  }

  it('defaults to the Epics tab without any templates content', () => {
    const container = render(baseState());
    expect(container.textContent).toContain('Epic One');
    expect(container.textContent).not.toContain('Workflow Templates');
  });

  it('switches to the Templates tab, hiding the epic list and rendering the section', () => {
    const container = render(baseState());
    act(() => { tabButton(container, 'Templates')?.click(); });
    expect(container.textContent).toContain('Workflow Templates');
    expect(rows(container)).toHaveLength(0);
    expect(window.location.hash).toContain('tab=templates');
    act(() => { tabButton(container, 'Epics')?.click(); });
    expect(rows(container)).toHaveLength(1);
    expect(window.location.hash).not.toContain('tab=templates');
  });

  it('preserves epic list filters across tab switches', () => {
    const epics = [
      epicRow('epic-1', { title: 'Alpha', status: 'todo' }),
      epicRow('epic-2', { title: 'Beta', status: 'done' }),
    ];
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    const statusSelect = container.querySelector('select[aria-label="Epic status"]') as HTMLSelectElement;
    act(() => {
      statusSelect.value = 'done';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rows(container)).toHaveLength(1);
    act(() => { tabButton(container, 'Templates')?.click(); });
    act(() => { tabButton(container, 'Epics')?.click(); });
    const visible = rows(container);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain('Beta');
    expect((container.querySelector('select[aria-label="Epic status"]') as HTMLSelectElement).value).toBe('done');
  });

  it('opens the Templates tab from a deep link with ?tab=templates', () => {
    window.location.hash = '#/projects/proj-1?tab=templates';
    const container = render(baseState());
    expect(container.textContent).toContain('Workflow Templates');
    expect(rows(container)).toHaveLength(0);
  });
});

describe('ProjectDetailPage filter persistence (PF-18)', () => {
  it('applies filters from a deep link on mount', () => {
    window.location.hash = '#/projects/proj-1?status=done&q=beta&order=progress';
    const epics = [
      epicRow('epic-1', { title: 'Alpha', status: 'done' }),
      epicRow('epic-2', { title: 'Beta', status: 'done' }),
      epicRow('epic-3', { title: 'Beta two', status: 'todo' }),
    ];
    const container = render(baseState({ epics } as unknown as Partial<MsqWebState>));
    const visible = rows(container);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain('Beta');
    expect((container.querySelector('select[aria-label="Epic status"]') as HTMLSelectElement).value).toBe('done');
    expect((container.querySelector('select[aria-label="Epic order"]') as HTMLSelectElement).value).toBe('progress');
    expect((container.querySelector('input[aria-label="Search Epics"]') as HTMLInputElement).value).toBe('beta');
  });

  it('degrades an invalid status in the query to the default without crashing', () => {
    window.location.hash = '#/projects/proj-1?status=banana&order=sideways';
    const container = render(baseState());
    expect((container.querySelector('select[aria-label="Epic status"]') as HTMLSelectElement).value).toBe('all');
    expect((container.querySelector('select[aria-label="Epic order"]') as HTMLSelectElement).value).toBe('position');
    expect(rows(container)).toHaveLength(1);
  });

  it('writes select filter changes into the hash query', () => {
    window.location.hash = '#/projects/proj-1';
    const container = render(baseState());
    const statusSelect = container.querySelector('select[aria-label="Epic status"]') as HTMLSelectElement;
    act(() => {
      statusSelect.value = 'done';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(window.location.hash).toContain('status=done');
  });
});
