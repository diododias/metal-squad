// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_LOST_MESSAGE, readActionOutcome, toastId } from '../../src/web/client/lib/actionFeedback.js';
import { CreateEpicModal } from '../../src/web/client/components/project/CreateEpicModal.js';
import { LifecycleActions } from '../../src/web/client/components/LifecycleActions.js';
import { ToastStack } from '../../src/web/client/components/feedback/ToastStack.js';
import type { WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

const roots: Root[] = [];

function mount(element: React.JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(element); });
  return { container, root };
}

afterEach(() => {
  roots.splice(0).forEach((root) => { act(() => { root.unmount(); }); });
  document.body.innerHTML = '';
});

describe('readActionOutcome', () => {
  it('returns null while the result is missing (pending)', () => {
    expect(readActionOutcome(undefined)).toBeNull();
  });

  it('passes through the ok payload', () => {
    const result = { type: 'action:result', payload: { requestId: 'r1', ok: true, entity: { epicId: 'e1' } } } as unknown as ActionResult;
    expect(readActionOutcome(result)).toMatchObject({ ok: true, payload: { entity: { epicId: 'e1' } } });
  });

  it('extracts the exact server error message', () => {
    const result = { type: 'action:result', payload: { requestId: 'r1', ok: false, error: { code: 'validation', message: 'title already exists in project' } } } as unknown as ActionResult;
    expect(readActionOutcome(result)).toEqual({ ok: false, message: 'title already exists in project' });
  });
});

describe('toastId', () => {
  it('starts with an epoch prefix so ToastStack TTL parsing works', () => {
    const id = toastId('epic-created');
    expect(Number.isFinite(Number(id.split('-')[0]))).toBe(true);
    expect(id.endsWith('epic-created')).toBe(true);
  });
});

describe('CreateEpicModal on WS disconnect (PF-07)', () => {
  it('leaves pending with an actionable error and retries with a fresh requestId', () => {
    const send = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const element = (connected: boolean): React.JSX.Element => (
      <CreateEpicModal open projectId="proj-1" send={send} actionResults={{}} onClose={() => undefined} connected={connected} />
    );
    act(() => { root.render(element(true)); });

    const input = container.querySelector('#create-epic-title') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, 'Epic');
    act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
    const criar = [...container.querySelectorAll('button')].find((item) => item.textContent === 'criar');
    act(() => { criar?.click(); });
    expect(send).toHaveBeenCalledTimes(1);
    const firstRequestId = (send.mock.calls[0]?.[0] as { requestId: string }).requestId;
    expect(container.textContent).toContain('creating…');

    act(() => { root.render(element(false)); });
    expect(container.textContent).not.toContain('creating…');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(CONNECTION_LOST_MESSAGE);

    act(() => { root.render(element(true)); });
    const retry = [...container.querySelectorAll('button')].find((item) => item.textContent === 'criar');
    expect(retry?.disabled).toBe(false);
    act(() => { retry?.click(); });
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1]?.[0] as { requestId: string }).requestId).not.toBe(firstRequestId);
  });
});

describe('LifecycleActions success toast (PF-07)', () => {
  it('emits an ok toast when an archive succeeds', () => {
    const send = vi.fn();
    const onToast = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const element = (actionResults: Record<string, ActionResult>): React.JSX.Element => (
      <LifecycleActions
        kind="epic"
        id="epic-1"
        name="Epic One"
        revision={3}
        allowed={{ archive: true, restore: false, delete: false, cancel: false, deleted: false }}
        send={send as (message: WebSocketClientMessage) => void}
        actionResults={actionResults}
        onToast={onToast}
      />
    );
    act(() => { root.render(element({})); });
    const archive = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Archive');
    act(() => { archive?.click(); });
    const { requestId } = send.mock.calls[0]?.[0] as { requestId: string };
    act(() => { root.render(element({ [requestId]: { type: 'action:result', payload: { requestId, ok: true, entity: { epicId: 'epic-1' }, revision: 4 } } as unknown as ActionResult })); });
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast.mock.calls[0]?.[0]).toMatchObject({ tone: 'ok', message: 'Epic "Epic One" archived.', source: 'Lifecycle' });
  });
});

describe('ToastStack action button (PF-07)', () => {
  it('renders the action, fires onSelect and dismisses', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const { container } = mount(
      <ToastStack
        items={[{ id: `${String(Date.now())}-t1`, tone: 'ok', message: 'Work Item created.', action: { label: 'abrir detalhe', onSelect } }]}
        onDismiss={onDismiss}
      />,
    );
    const action = [...container.querySelectorAll('button')].find((item) => item.textContent === 'abrir detalhe');
    expect(action).toBeDefined();
    act(() => { action?.click(); });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
