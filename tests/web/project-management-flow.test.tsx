// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailPage } from '../../src/web/client/pages/ProjectDetailPage.js';
import { EpicDetailPage } from '../../src/web/client/pages/EpicDetailPage.js';
import { parseHash } from '../../src/web/client/lib/routes.js';
import { readHashParams } from '../../src/web/client/lib/hashState.js';
import type { MsqWebState, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;
type ArchivedResult = Extract<WebSocketServerMessage, { type: 'action:archivedResult' }>;

function epicEntry(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    epicId: id,
    projectId: 'proj-1',
    repoId: null,
    title: `Epic ${id}`,
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
    epics: [epicEntry('epic-1', { title: 'Epic One', status: 'in_progress' })],
    runs: [{ featureId: 'feat-1', status: 'done', runId: 1 }],
    lifecycle: {},
    workflowTemplates: [],
    workflowTemplateMappings: {},
    ...overrides,
  } as unknown as MsqWebState;
}

function newContainer(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  return el;
}

function epicRows(container: HTMLDivElement): HTMLElement[] {
  return [...container.querySelectorAll('[role="link"]')] as HTMLElement[];
}

beforeEach(() => { window.location.hash = ''; });

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

// ─── 1. Full navigation chain ─────────────────────────────────────────────────

describe('navigation chain — Projects → Epic → Work Item (PF-01, PF-02, PF-03, PF-14)', () => {
  it('epic row click in ProjectDetailPage produces a parseable epic-detail hash', () => {
    const el = newContainer();
    act(() => {
      roots[roots.length - 1]!.render(
        <ProjectDetailPage
          state={baseState()}
          projectId="proj-1"
          send={() => undefined}
          actionResults={{}}
          onBack={() => undefined}
        />,
      );
    });
    act(() => { epicRows(el)[0]?.click(); });
    expect(parseHash(window.location.hash)).toEqual({ page: 'epic-detail', projectId: 'proj-1', epicId: 'epic-1' });
  });

  it('work item row click in EpicDetailPage triggers onOpenBacklogItem and hash routes to epic-item-detail', () => {
    const onOpenBacklogItem = vi.fn((featureId: string) => {
      window.location.hash = `#/projects/proj-1/epics/epic-1/items/${featureId}`;
    });
    const el = newContainer();
    act(() => {
      roots[roots.length - 1]!.render(
        <EpicDetailPage
          state={baseState()}
          projectId="proj-1"
          epicId="epic-1"
          send={() => undefined}
          actionResults={{}}
          onBack={() => undefined}
          onOpenBacklogItem={onOpenBacklogItem}
        />,
      );
    });
    act(() => { epicRows(el)[0]?.click(); });
    expect(onOpenBacklogItem).toHaveBeenCalledWith('feat-1');
    expect(parseHash(window.location.hash)).toEqual({
      page: 'epic-item-detail',
      projectId: 'proj-1',
      epicId: 'epic-1',
      featureId: 'feat-1',
    });
  });

  it('epic-item-detail route carries projectId, epicId and featureId needed for the 3-level breadcrumb', () => {
    // Verify that the route produced after epic drill-down contains all data
    // the App needs to build the Projects › Project › Epic breadcrumb in BacklogItemDetail.
    const hash = '#/projects/proj-1/epics/epic-1/items/feat-1';
    const route = parseHash(hash);
    expect(route).toEqual({ page: 'epic-item-detail', projectId: 'proj-1', epicId: 'epic-1', featureId: 'feat-1' });
    // Confirm the route has the shape required for 3-level breadcrumb construction
    if (route.page !== 'epic-item-detail') throw new Error('Unexpected route page');
    expect(route.projectId).toBe('proj-1');
    expect(route.epicId).toBe('epic-1');
    expect(route.featureId).toBe('feat-1');
  });

  it('project breadcrumb in EpicDetailPage restores the saved project filter', () => {
    window.location.hash = '#/projects/proj-1?status=in_progress';
    readHashParams(); // stores the query in hashState memory before drill-down
    window.location.hash = '#/projects/proj-1/epics/epic-1';
    const el = newContainer();
    act(() => {
      roots[roots.length - 1]!.render(
        <EpicDetailPage
          state={baseState()}
          projectId="proj-1"
          epicId="epic-1"
          send={() => undefined}
          actionResults={{}}
          onBack={() => undefined}
          onOpenBacklogItem={() => undefined}
        />,
      );
    });
    const projectCrumb = [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Project One · P-'));
    act(() => { projectCrumb?.click(); });
    expect(window.location.hash).toBe('#/projects/proj-1?status=in_progress');
  });
});

// ─── 2. Create Epic via modal + server error (PF-04, PF-07) ──────────────────

describe('Create Epic modal from ProjectDetailPage (PF-04, PF-07)', () => {
  function setupProject(): {
    el: HTMLDivElement;
    send: ReturnType<typeof vi.fn>;
    rerender: (ar: Record<string, ActionResult>) => void;
  } {
    const el = newContainer();
    const root = roots[roots.length - 1]!;
    const send = vi.fn();
    const element = (actionResults: Record<string, ActionResult>): React.JSX.Element => (
      <ProjectDetailPage
        state={baseState()}
        projectId="proj-1"
        send={send}
        actionResults={actionResults}
        onBack={() => undefined}
        onToast={vi.fn()}
        connected
      />
    );
    act(() => { root.render(element({})); });
    return { el, send, rerender: (ar) => { act(() => { root.render(element(ar)); }); } };
  }

  function openCreateEpicModal(el: HTMLDivElement): void {
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent === '+ New Epic');
    act(() => { btn?.click(); });
  }

  function fillTitle(el: HTMLDivElement, value: string): void {
    const input = el.querySelector('#create-epic-title') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, value);
    act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
  }

  it('opens CreateEpicModal and dispatches action:createEpic with the typed title', () => {
    const { el, send } = setupProject();
    openCreateEpicModal(el);
    expect(el.querySelector('[aria-label="Create Epic"]')).not.toBeNull();
    fillTitle(el, 'My New Epic');
    const save = [...el.querySelectorAll('button')].find((b) => b.textContent === 'create');
    act(() => { save?.click(); });
    const msg = send.mock.calls
      .map((c) => c[0] as { type: string; title?: string })
      .find((m) => m.type === 'action:createEpic');
    expect(msg?.title).toBe('My New Epic');
  });

  it('shows real server error message inside the modal on failure', () => {
    const { el, send, rerender } = setupProject();
    openCreateEpicModal(el);
    fillTitle(el, 'Fail Epic');
    const save = [...el.querySelectorAll('button')].find((b) => b.textContent === 'create');
    act(() => { save?.click(); });
    const requestId = send.mock.calls
      .map((c) => c[0] as { type: string; requestId?: string })
      .find((m) => m.type === 'action:createEpic')?.requestId;
    rerender({
      [requestId!]: {
        type: 'action:result',
        payload: { requestId: requestId!, ok: false, error: { code: 'VALIDATION_ERROR', message: 'Title must be unique.' } },
      } as unknown as ActionResult,
    });
    expect(el.querySelector('[aria-label="Create Epic"]')).not.toBeNull();
    expect(el.textContent).toContain('Title must be unique.');
  });
});

// ─── 3. not_started pill + Templates tab isolation (PF-10, PF-11) ─────────────

describe('not_started pill and Templates tab isolation (PF-10, PF-11)', () => {
  it('work item without a run shows "not started" pill in EpicDetailPage, never "aborted"', () => {
    const state = baseState({ runs: [] } as unknown as Partial<MsqWebState>);
    const el = newContainer();
    act(() => {
      roots[roots.length - 1]!.render(
        <EpicDetailPage
          state={state}
          projectId="proj-1"
          epicId="epic-1"
          send={() => undefined}
          actionResults={{}}
          onBack={() => undefined}
          onOpenBacklogItem={() => undefined}
        />,
      );
    });
    expect(el.textContent).toContain('not started');
    expect(el.textContent).not.toContain('aborted');
  });

  it('Templates tab shows workflow section and hides epic rows; switching back to Epics restores the list', () => {
    const el = newContainer();
    act(() => {
      roots[roots.length - 1]!.render(
        <ProjectDetailPage
          state={baseState()}
          projectId="proj-1"
          send={() => undefined}
          actionResults={{}}
          onBack={() => undefined}
        />,
      );
    });
    expect(epicRows(el)).toHaveLength(1);
    const templatesTab = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Templates');
    act(() => { templatesTab?.click(); });
    expect(epicRows(el)).toHaveLength(0);
    expect(el.textContent).toContain('Workflow Templates');
    const epicsTab = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Epics');
    act(() => { epicsTab?.click(); });
    expect(epicRows(el)).toHaveLength(1);
    expect(el.textContent).not.toContain('Workflow Templates');
  });
});

// ─── 4. Start eligible Work Item from epic row (PF-15) ───────────────────────

describe('start eligible Work Item from EpicDetailPage row (PF-15)', () => {
  it('dispatches action:startFeature with a toast and does not navigate away from the epic', () => {
    window.location.hash = '#/projects/proj-1/epics/epic-1';
    const send = vi.fn();
    const onToast = vi.fn();
    const el = newContainer();
    act(() => {
      roots[roots.length - 1]!.render(
        <EpicDetailPage
          state={baseState()}
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
    // feat-2 has no run → eligible
    const row = epicRows(el).find((r) => r.textContent?.includes('Item feat-2'));
    const startBtn = [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'start') as HTMLButtonElement | undefined;
    expect(startBtn?.disabled).toBe(false);
    act(() => { startBtn?.click(); });
    expect(send).toHaveBeenCalledWith({ type: 'action:startFeature', featureId: 'feat-2' });
    expect(window.location.hash).toBe('#/projects/proj-1/epics/epic-1');
    const toast = onToast.mock.calls[0]?.[0] as { tone: string; message: string } | undefined;
    expect(toast?.tone).toBe('ok');
    expect(toast?.message).toContain('feat-2');
  });
});

// ─── 5. Toggle archived epics + restore (PF-17) ──────────────────────────────

describe('toggle archived epics in ProjectDetailPage (PF-17)', () => {
  it('queries archived epics on toggle-on and renders them with a Restore action; active epic list unchanged', () => {
    const send = vi.fn();
    const el = newContainer();
    const root = roots[roots.length - 1]!;
    const archivedEntry = {
      kind: 'epic',
      id: 'epic-9',
      title: 'Old Epic',
      parentLabel: 'Project One',
      parentId: 'proj-1',
      repoLabel: null,
      workItemType: null,
      archivedAt: '2026-07-10T00:00:00.000Z',
      revision: 2,
      allowed: { archive: false, restore: true, delete: false, cancel: false, deleted: false },
    };
    const element = (archivedResults: Record<string, ArchivedResult>): React.JSX.Element => (
      <ProjectDetailPage
        state={baseState()}
        projectId="proj-1"
        send={send}
        actionResults={{}}
        archivedResults={archivedResults}
        onBack={() => undefined}
      />
    );
    act(() => { root.render(element({})); });
    expect(epicRows(el)).toHaveLength(1);
    // Toggle on
    const checkbox = el.querySelector('input[aria-label="Show archived Epics"]') as HTMLInputElement;
    act(() => { checkbox.click(); });
    const msg = send.mock.calls
      .map((c) => c[0] as { type: string; requestId: string; filters?: Record<string, string> })
      .find((m) => m.type === 'action:queryArchived');
    expect(msg?.filters).toEqual({ projectId: 'proj-1', kind: 'epic' });
    // Provide archived result
    act(() => {
      root.render(element({
        [msg!.requestId]: {
          type: 'action:archivedResult',
          payload: { requestId: msg!.requestId, ok: true, items: [archivedEntry], total: 1, limit: 50, offset: 0 },
        } as unknown as ArchivedResult,
      }));
    });
    // Active list unchanged
    expect(epicRows(el)).toHaveLength(1);
    // Archived row visible with restore
    const archivedRow = el.querySelector('[aria-label="Old Epic (archived)"]');
    expect(archivedRow).not.toBeNull();
    expect(archivedRow?.textContent).toContain('archived');
    const restore = [...(archivedRow?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Restore');
    expect(restore).toBeDefined();
  });
});
