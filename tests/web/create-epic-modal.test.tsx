// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateEpicModal } from '../../src/web/client/components/project/CreateEpicModal.js';
import type { WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

const roots: Root[] = [];

interface View {
  container: HTMLDivElement;
  root: Root;
  rerender: (actionResults: Record<string, ActionResult>) => void;
}

function render(props: {
  open?: boolean;
  send?: (message: WebSocketClientMessage) => void;
  onClose?: () => void;
  onCreated?: (title: string) => void;
}): View {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const element = (actionResults: Record<string, ActionResult>): React.JSX.Element => (
    <CreateEpicModal
      open={props.open ?? true}
      projectId="proj-1"
      send={props.send ?? (() => undefined)}
      actionResults={actionResults}
      onClose={props.onClose ?? (() => undefined)}
      onCreated={props.onCreated}
    />
  );
  act(() => { root.render(element({})); });
  return { container, root, rerender: (actionResults) => { act(() => { root.render(element(actionResults)); }); } };
}

function setValue(control: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function titleInput(container: HTMLDivElement): HTMLInputElement {
  return container.querySelector('#create-epic-title') as HTMLInputElement;
}

function buttonByText(container: HTMLDivElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  if (!button) throw new Error(`button "${text}" not found`);
  return button;
}

afterEach(() => {
  roots.splice(0).forEach((root) => { act(() => { root.unmount(); }); });
  document.body.innerHTML = '';
});

describe('CreateEpicModal', () => {
  it('renders nothing when closed', () => {
    const view = render({ open: false });
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('disables create without a title and does not send', () => {
    const send = vi.fn();
    const view = render({ send });
    const create = buttonByText(view.container, 'create');
    expect(create.disabled).toBe(true);
    act(() => { create.click(); });
    expect(send).not.toHaveBeenCalled();
  });

  it('cancel closes without emitting action:createEpic', () => {
    const send = vi.fn();
    const onClose = vi.fn();
    const view = render({ send, onClose });
    act(() => { setValue(titleInput(view.container), 'Drafted title'); });
    act(() => { buttonByText(view.container, 'cancel').click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends action:createEpic with trimmed title and null description, then shows creating…', () => {
    const send = vi.fn();
    const view = render({ send });
    act(() => { setValue(titleInput(view.container), '  Epic title  '); });
    act(() => { buttonByText(view.container, 'create').click(); });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as Extract<WebSocketClientMessage, { type: 'action:createEpic' }>;
    expect(message.type).toBe('action:createEpic');
    expect(message.projectId).toBe('proj-1');
    expect(message.title).toBe('Epic title');
    expect(message.description).toBeNull();
    expect(buttonByText(view.container, 'creating…').disabled).toBe(true);
    expect(titleInput(view.container).disabled).toBe(true);
  });

  it('includes the description when provided', () => {
    const send = vi.fn();
    const view = render({ send });
    act(() => { setValue(titleInput(view.container), 'Epic'); });
    act(() => { setValue(view.container.querySelector('#create-epic-description') as HTMLInputElement, 'Scope notes'); });
    act(() => { buttonByText(view.container, 'create').click(); });
    const message = send.mock.calls[0]?.[0] as Extract<WebSocketClientMessage, { type: 'action:createEpic' }>;
    expect(message.description).toBe('Scope notes');
  });

  it('closes and fires onCreated on success', () => {
    const send = vi.fn();
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const view = render({ send, onClose, onCreated });
    act(() => { setValue(titleInput(view.container), 'Epic'); });
    act(() => { buttonByText(view.container, 'create').click(); });
    const { requestId } = send.mock.calls[0]?.[0] as { requestId: string };
    view.rerender({ [requestId]: { type: 'action:result', payload: { requestId, ok: true, entity: {} } } as unknown as ActionResult });
    expect(onCreated).toHaveBeenCalledWith('Epic');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open showing the server error message on failure', () => {
    const send = vi.fn();
    const onClose = vi.fn();
    const view = render({ send, onClose });
    act(() => { setValue(titleInput(view.container), 'Epic'); });
    act(() => { buttonByText(view.container, 'create').click(); });
    const { requestId } = send.mock.calls[0]?.[0] as { requestId: string };
    view.rerender({ [requestId]: { type: 'action:result', payload: { requestId, ok: false, error: { code: 'validation', message: 'title already exists in project' } } } as unknown as ActionResult });
    expect(onClose).not.toHaveBeenCalled();
    const alert = view.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('title already exists in project');
    expect(buttonByText(view.container, 'create').disabled).toBe(false);
  });

  it('closes on Escape while idle', () => {
    const onClose = vi.fn();
    render({ onClose });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
