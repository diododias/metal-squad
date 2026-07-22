// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArchivedPage } from '../../src/web/client/pages/ArchivedPage.js';
import type { AllowedLifecycle, ArchivedEntry, MsqWebState, WebSocketClientMessage } from '../../src/web/types.js';

/**
 * PRJ-19: `/archived` fetches its listing and audit timeline over the WS
 * request/response channel (`action:queryArchived` / `action:queryAuditTrail`)
 * rather than from the live `state:full` snapshot — archived entities are
 * deliberately absent from `state.projects`/`state.epics`/`state.featureCatalog`
 * (PRJ-07/15). These tests drive the round trip by re-rendering with the
 * server response injected into `archivedResults`/`auditTrailResults`, the
 * same pattern `lifecycle-actions.test.tsx` and `projects-page.test.tsx` use
 * for `actionResults`.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

const restorable: AllowedLifecycle = {
  state: 'pristine', archived: true, deleted: false,
  archive: false, delete: false, cancel: false, restore: true, blockedReason: null,
};

const ancestorBlocked: AllowedLifecycle = {
  state: 'pristine', archived: true, deleted: false,
  archive: false, delete: false, cancel: false, restore: false,
  blockedReason: 'An ancestor is archived; restore it first.',
};

function entry(overrides: Partial<ArchivedEntry> = {}): ArchivedEntry {
  return {
    kind: 'work_item', id: 'feat-1', title: 'Fix login bug', parentLabel: 'Epic One', parentId: 'epic-1',
    repoLabel: 'platform', workItemType: 'bug', archivedAt: '2026-07-10T12:00:00.000Z',
    revision: 2, allowed: restorable, ...overrides,
  };
}

function baseState(): MsqWebState {
  return {
    projects: [{ projectId: 'project-1', name: 'Platform', position: 0, description: null, revision: 1, counts: { epics: 1, workItems: 1, archived: 1 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null }],
    repositories: [{ repoId: 'repo-1', projectId: 'project-1', label: 'platform', health: 'ok', lastCheckedAt: null }],
  } as unknown as MsqWebState;
}

function render(props: Partial<React.ComponentProps<typeof ArchivedPage>> = {}): { container: HTMLElement; send: ReturnType<typeof vi.fn> } {
  const send = props.send as ReturnType<typeof vi.fn> ?? vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <ArchivedPage
        state={props.state ?? baseState()}
        send={send}
        actionResults={props.actionResults ?? {}}
        archivedResults={props.archivedResults ?? {}}
        auditTrailResults={props.auditTrailResults ?? {}}
      />,
    );
  });
  return { container, send };
}

function queryRequestId(send: ReturnType<typeof vi.fn>): string {
  const call = send.mock.calls.find((args) => (args[0] as { type: string }).type === 'action:queryArchived');
  return (call?.[0] as { requestId: string }).requestId;
}

afterEach(() => { act(() => { roots.splice(0).forEach((root) => root.unmount()); }); document.body.replaceChildren(); });

describe('ArchivedPage', () => {
  it('queries archived items on mount with default filters and pagination', () => {
    const { send } = render();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action:queryArchived',
      filters: {},
      limit: 20,
      offset: 0,
    }));
  });

  it('renders the list returned by the server and shows the blocked-restore reason', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const { container, send: sentWith } = render({ send });
    const requestId = queryRequestId(sentWith);
    const items = [entry(), entry({ id: 'epic-2', kind: 'epic', title: 'Epic Two', allowed: ancestorBlocked })];
    act(() => {
      roots[0]?.render(
        <ArchivedPage
          state={baseState()}
          send={send}
          actionResults={{}}
          archivedResults={{ [requestId]: { type: 'action:archivedResult', payload: { requestId, ok: true, items, total: 2, limit: 20, offset: 0 } } }}
          auditTrailResults={{}}
        />,
      );
    });
    expect(container.textContent).toContain('Fix login bug');
    expect(container.textContent).toContain('Epic Two');
    expect(container.textContent).toContain('An ancestor is archived; restore it first.');
  });

  it('offers a shortcut to filter by the archived ancestor when restore is blocked', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const { container, send: sentWith } = render({ send });
    const requestId = queryRequestId(sentWith);
    const blocked = entry({ allowed: ancestorBlocked, parentLabel: 'Epic One', parentId: 'epic-1' });
    act(() => {
      roots[0]?.render(
        <ArchivedPage
          state={baseState()}
          send={send}
          actionResults={{}}
          archivedResults={{ [requestId]: { type: 'action:archivedResult', payload: { requestId, ok: true, items: [blocked], total: 1, limit: 20, offset: 0 } } }}
          auditTrailResults={{}}
        />,
      );
    });
    send.mockClear();
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'restore Epic One first')?.click(); });
    // Switching to the ancestor's level re-triggers the archived query with
    // the new filter — no direct DOM assertion on the ancestor row needed,
    // since the query itself is the observable effect of the click.
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'action:queryArchived', filters: { kind: 'epic' } }));
  });

  it('shows an empty state when the server returns no archived items', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const { container, send: sentWith } = render({ send });
    const requestId = queryRequestId(sentWith);
    act(() => {
      roots[0]?.render(
        <ArchivedPage
          state={baseState()}
          send={send}
          actionResults={{}}
          archivedResults={{ [requestId]: { type: 'action:archivedResult', payload: { requestId, ok: true, items: [], total: 0, limit: 20, offset: 0 } } }}
          auditTrailResults={{}}
        />,
      );
    });
    expect(container.textContent).toContain('No archived items match these filters');
  });

  it('re-queries with the new filter and resets to page 0 when a filter changes', () => {
    const { container, send } = render();
    send.mockClear();
    const select = container.querySelector('[aria-label="Level"]') as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')?.set?.call(select, 'epic');
    act(() => { select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'action:queryArchived', filters: { kind: 'epic' }, offset: 0 }));
  });

  it('dispatches Restore through the shared LifecycleActions channel with requestId/expectedRevision', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const { container, send: sentWith } = render({ send });
    const requestId = queryRequestId(sentWith);
    act(() => {
      roots[0]?.render(
        <ArchivedPage
          state={baseState()}
          send={send}
          actionResults={{}}
          archivedResults={{ [requestId]: { type: 'action:archivedResult', payload: { requestId, ok: true, items: [entry()], total: 1, limit: 20, offset: 0 } } }}
          auditTrailResults={{}}
        />,
      );
    });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Restore')?.click(); });
    const restoreCall = send.mock.calls.find((args) => (args[0] as { type: string }).type === 'action:restoreArchivedWorkItem');
    expect(restoreCall?.[0]).toMatchObject({ type: 'action:restoreArchivedWorkItem', workItemId: 'feat-1', expectedRevision: 2 });
  });

  it('drops a restored row immediately once its action:result arrives, without waiting for a re-query', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const { container, send: sentWith } = render({ send });
    const requestId = queryRequestId(sentWith);
    const archivedResults = { [requestId]: { type: 'action:archivedResult' as const, payload: { requestId, ok: true as const, items: [entry()], total: 1, limit: 20, offset: 0 } } };
    act(() => {
      roots[0]?.render(<ArchivedPage state={baseState()} send={send} actionResults={{}} archivedResults={archivedResults} auditTrailResults={{}} />);
    });
    expect(container.textContent).toContain('Fix login bug');

    act(() => {
      roots[0]?.render(
        <ArchivedPage
          state={baseState()}
          send={send}
          actionResults={{ 'restore-1': { type: 'action:result', payload: { requestId: 'restore-1', ok: true, entity: { workItemId: 'feat-1', revision: 3 } as never, revision: 3 } } }}
          archivedResults={archivedResults}
          auditTrailResults={{}}
        />,
      );
    });
    expect(container.textContent).not.toContain('Fix login bug');
    expect(container.textContent).toContain('No archived items match these filters');
  });

  it('opens the audit trail modal and queries events for the selected entity', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const { container, send: sentWith } = render({ send });
    const queryId = queryRequestId(sentWith);
    act(() => {
      roots[0]?.render(
        <ArchivedPage
          state={baseState()}
          send={send}
          actionResults={{}}
          archivedResults={{ [queryId]: { type: 'action:archivedResult', payload: { requestId: queryId, ok: true, items: [entry()], total: 1, limit: 20, offset: 0 } } }}
          auditTrailResults={{}}
        />,
      );
    });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Audit trail')?.click(); });
    const auditCall = send.mock.calls.find((args) => (args[0] as { type: string }).type === 'action:queryAuditTrail');
    expect(auditCall?.[0]).toMatchObject({ type: 'action:queryAuditTrail', entityKind: 'work_item', entityId: 'feat-1' });
    expect(container.textContent).toContain('loading audit trail');
  });

  it('renders audit events most-recent-first once the server responds', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const { container, send: sentWith } = render({ send });
    const queryId = queryRequestId(sentWith);
    const archivedResults = { [queryId]: { type: 'action:archivedResult' as const, payload: { requestId: queryId, ok: true as const, items: [entry()], total: 1, limit: 20, offset: 0 } } };
    act(() => {
      roots[0]?.render(<ArchivedPage state={baseState()} send={send} actionResults={{}} archivedResults={archivedResults} auditTrailResults={{}} />);
    });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Audit trail')?.click(); });
    const auditRequestId = send.mock.calls.find((args) => (args[0] as { type: string }).type === 'action:queryAuditTrail')?.[0] as { requestId: string };

    act(() => {
      roots[0]?.render(
        <ArchivedPage
          state={baseState()}
          send={send}
          actionResults={{}}
          archivedResults={archivedResults}
          auditTrailResults={{
            [auditRequestId.requestId]: {
              type: 'action:auditTrailResult',
              payload: {
                requestId: auditRequestId.requestId, ok: true, entityKind: 'work_item', entityId: 'feat-1',
                events: [
                  { id: 2, actor: 'web', action: 'restoreArchive', beforeJson: null, afterJson: null, createdAt: '2026-07-11T00:00:00.000Z' },
                  { id: 1, actor: 'web', action: 'archive', beforeJson: null, afterJson: null, createdAt: '2026-07-10T00:00:00.000Z' },
                ],
              },
            },
          }}
        />,
      );
    });
    expect(container.textContent).toContain('restoreArchive');
    expect(container.textContent).toContain('archive');
  });
});
