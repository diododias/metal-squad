// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditProjectModal } from '../../src/web/client/components/project/EditProjectModal.js';
import type { ProjectSummary, WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

const roots: Root[] = [];

function projectSummary(overrides: Record<string, unknown> = {}): ProjectSummary {
  return {
    projectId: 'proj-1',
    name: 'Project One',
    position: 0,
    description: 'The original description.',
    revision: 3,
    counts: { epics: 0, workItems: 0, archived: 0 },
    activeRuns: 0,
    tokens: { status: 'ready' },
    archivedAt: null,
    ...overrides,
  } as unknown as ProjectSummary;
}

interface View {
  container: HTMLDivElement;
  send: ReturnType<typeof vi.fn>;
  rerender: (actionResults: Record<string, ActionResult>, project?: ProjectSummary) => void;
}

function render(props: { project?: ProjectSummary; onClose?: () => void; onSaved?: (name: string) => void } = {}): View {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const send = vi.fn();
  const element = (actionResults: Record<string, ActionResult>, project: ProjectSummary): React.JSX.Element => (
    <EditProjectModal
      open
      project={project}
      send={send as (message: WebSocketClientMessage) => void}
      actionResults={actionResults}
      onClose={props.onClose ?? (() => undefined)}
      onSaved={props.onSaved}
    />
  );
  const initial = props.project ?? projectSummary();
  act(() => { root.render(element({}, initial)); });
  return { container, send, rerender: (actionResults, project = initial) => { act(() => { root.render(element(actionResults, project)); }); } };
}

function input(container: HTMLDivElement, id: string): HTMLInputElement {
  return container.querySelector(`#${id}`) as HTMLInputElement;
}

function setValue(control: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function buttonByText(container: HTMLDivElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === text);
}

afterEach(() => {
  roots.splice(0).forEach((root) => { act(() => { root.unmount(); }); });
  document.body.innerHTML = '';
});

describe('EditProjectModal (PF-16)', () => {
  it('opens with the current values and salvar disabled until dirty', () => {
    const view = render({});
    expect(input(view.container, 'edit-project-name').value).toBe('Project One');
    expect(input(view.container, 'edit-project-description').value).toBe('The original description.');
    expect(buttonByText(view.container, 'salvar')?.disabled).toBe(true);
  });

  it('cancelar closes without emitting action:updateProject', () => {
    const onClose = vi.fn();
    const view = render({ onClose });
    act(() => { setValue(input(view.container, 'edit-project-name'), 'Renamed'); });
    act(() => { buttonByText(view.container, 'cancelar')?.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(view.send).not.toHaveBeenCalled();
  });

  it('saves only the changed fields with expectedRevision', () => {
    const view = render({});
    act(() => { setValue(input(view.container, 'edit-project-name'), 'Renamed project'); });
    act(() => { buttonByText(view.container, 'salvar')?.click(); });
    const message = view.send.mock.calls[0]?.[0] as { type: string; projectId: string; expectedRevision: number; patch: Record<string, unknown> };
    expect(message).toMatchObject({ type: 'action:updateProject', projectId: 'proj-1', expectedRevision: 3, patch: { name: 'Renamed project' } });
    expect(message.patch.description).toBeUndefined();
    expect(view.container.textContent).toContain('saving…');
  });

  it('closes and fires onSaved on success', () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const view = render({ onClose, onSaved });
    act(() => { setValue(input(view.container, 'edit-project-name'), 'Renamed'); });
    act(() => { buttonByText(view.container, 'salvar')?.click(); });
    const { requestId } = view.send.mock.calls[0]?.[0] as { requestId: string };
    view.rerender({ [requestId]: { type: 'action:result', payload: { requestId, ok: true, entity: { projectId: 'proj-1', revision: 4 } } } as unknown as ActionResult });
    expect(onSaved).toHaveBeenCalledWith('Renamed');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers revision-conflict recovery and reapplies against the pushed revision', () => {
    const view = render({});
    act(() => { setValue(input(view.container, 'edit-project-name'), 'Renamed'); });
    act(() => { buttonByText(view.container, 'salvar')?.click(); });
    const first = view.send.mock.calls[0]?.[0] as { requestId: string };
    const conflicted = projectSummary({ revision: 5 });
    view.rerender({
      [first.requestId]: { type: 'action:result', payload: { requestId: first.requestId, ok: false, error: { code: 'REVISION_CONFLICT', message: 'Project proj-1 has revision 5; expected 3' } } } as unknown as ActionResult,
    }, conflicted);
    expect(view.container.textContent).toContain('has revision 5');
    expect(buttonByText(view.container, 'reload current values')).toBeDefined();
    act(() => { buttonByText(view.container, 'reapply draft')?.click(); });
    const retry = view.send.mock.calls[1]?.[0] as { requestId: string; expectedRevision: number; patch: Record<string, unknown> };
    expect(retry.expectedRevision).toBe(5);
    expect(retry.patch).toMatchObject({ name: 'Renamed' });
    expect(retry.requestId).not.toBe(first.requestId);
  });
});
