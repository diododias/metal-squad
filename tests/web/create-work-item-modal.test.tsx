// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateWorkItemModal } from '../../src/web/client/components/project/CreateWorkItemModal.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

const roots: Root[] = [];

function baseState(overrides: Partial<MsqWebState> = {}): MsqWebState {
  return {
    featureCatalog: {},
    projects: [],
    repositories: [
      { repoId: 'repo-1', projectId: 'proj-1', label: 'repo-one', health: 'ok', lastCheckedAt: null },
      { repoId: 'repo-2', projectId: 'proj-1', label: 'repo-two', health: 'unavailable', lastCheckedAt: null },
    ],
    epics: [
      { epicId: 'epic-1', projectId: 'proj-1', repoId: null, title: 'Epic One', description: null, status: 'todo', position: 0, archivedAt: null, deletedAt: null, revision: 1, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
      { epicId: 'epic-2', projectId: 'proj-1', repoId: null, title: 'Epic Two', description: null, status: 'todo', position: 1, archivedAt: null, deletedAt: null, revision: 1, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
    ],
    runs: [],
    workflowTemplates: [],
    workflowTemplateMappings: {},
    ...overrides,
  } as unknown as MsqWebState;
}

interface View {
  container: HTMLDivElement;
  rerender: (actionResults: Record<string, ActionResult>) => void;
}

function render(props: {
  state?: MsqWebState;
  defaultEpicId?: string;
  initialDraft?: React.ComponentProps<typeof CreateWorkItemModal>['initialDraft'];
  send?: (message: WebSocketClientMessage) => void;
  onClose?: () => void;
  onCreated?: (workItemId: string, title: string) => void;
}): View {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const element = (actionResults: Record<string, ActionResult>): React.JSX.Element => (
    <CreateWorkItemModal
      open
      projectId="proj-1"
      defaultEpicId={props.defaultEpicId}
      initialDraft={props.initialDraft}
      state={props.state ?? baseState()}
      send={props.send ?? (() => undefined)}
      actionResults={actionResults}
      onClose={props.onClose ?? (() => undefined)}
      onCreated={props.onCreated}
    />
  );
  act(() => { root.render(element({})); });
  return { container, rerender: (actionResults) => { act(() => { root.render(element(actionResults)); }); } };
}

function setValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function select(container: HTMLDivElement, label: string): HTMLSelectElement {
  return container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
}

function buttonByText(container: HTMLDivElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  if (!button) throw new Error(`button "${text}" not found`);
  return button;
}

function previewOk(requestId: string): ActionResult {
  return {
    type: 'action:result',
    payload: { requestId, ok: true, preview: { stages: ['implement', 'validate'], templateId: 'tpl-1', templateVersion: 2, origin: 'project' } },
  } as unknown as ActionResult;
}

afterEach(() => {
  roots.splice(0).forEach((root) => { act(() => { root.unmount(); }); });
  document.body.innerHTML = '';
});

describe('CreateWorkItemModal', () => {
  it('explains the missing-repo block instead of rendering the form', () => {
    const view = render({ state: baseState({ repositories: [] }) });
    expect(view.container.textContent).toContain('Link a repository before creating a Work Item');
    expect(select(view.container, 'Epic')).toBeNull();
  });

  it('pre-selects the epic when opened with defaultEpicId and keeps it editable', () => {
    const view = render({ defaultEpicId: 'epic-2' });
    expect(select(view.container, 'Epic').value).toBe('epic-2');
    act(() => { setValue(select(view.container, 'Epic'), 'epic-1'); });
    expect(select(view.container, 'Epic').value).toBe('epic-1');
  });

  it('pre-selects the repository when only one healthy repo exists', () => {
    const view = render({});
    expect(select(view.container, 'Repository').value).toBe('repo-1');
  });

  it('disables unavailable repositories in the select', () => {
    const view = render({});
    const option = [...select(view.container, 'Repository').options].find((item) => item.value === 'repo-2');
    expect(option?.disabled).toBe(true);
  });

  it('resolves the preview once epic+repo are set and re-resolves on type change', () => {
    const send = vi.fn();
    const view = render({ send, defaultEpicId: 'epic-1' });
    const previews = send.mock.calls.map((call) => call[0] as { type: string }).filter((message) => message.type === 'action:resolveWorkflowTemplate');
    expect(previews).toHaveLength(1);
    act(() => { setValue(select(view.container, 'Work Item type'), 'bug'); });
    const after = send.mock.calls.map((call) => call[0] as { type: string; workItemType?: string }).filter((message) => message.type === 'action:resolveWorkflowTemplate');
    expect(after).toHaveLength(2);
    expect(after[1]?.workItemType).toBe('bug');
  });

  it('keeps criar disabled until title + valid preview, then sends action:createWorkItem', () => {
    const send = vi.fn();
    const view = render({ send, defaultEpicId: 'epic-1' });
    act(() => { setValue(view.container.querySelector('#create-work-item-title') as HTMLInputElement, 'My feature'); });
    expect(buttonByText(view.container, 'criar').disabled).toBe(true);
    const previewRequest = send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((message) => message.type === 'action:resolveWorkflowTemplate');
    view.rerender({ [previewRequest!.requestId]: previewOk(previewRequest!.requestId) });
    expect(view.container.textContent).toContain('template: tpl-1 v2 (project)');
    const criar = buttonByText(view.container, 'criar');
    expect(criar.disabled).toBe(false);
    act(() => { criar.click(); });
    const create = send.mock.calls.map((call) => call[0] as { type: string; title?: string; epicId?: string; repoId?: string }).find((message) => message.type === 'action:createWorkItem');
    expect(create).toMatchObject({ epicId: 'epic-1', repoId: 'repo-1', title: 'My feature' });
  });

  it('pre-fills a clone draft and preserves its description and dependencies on create', () => {
    const send = vi.fn();
    const view = render({ send, initialDraft: { title: 'Original (copy)', epicId: 'epic-1', repoId: 'repo-1', workItemType: 'bug', description: 'Copied spec', dependsOn: ['feat-0'] } });
    const previewRequest = send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((message) => message.type === 'action:resolveWorkflowTemplate');
    view.rerender({ [previewRequest!.requestId]: previewOk(previewRequest!.requestId) });
    expect((view.container.querySelector('#create-work-item-title') as HTMLInputElement).value).toBe('Original (copy)');
    act(() => { buttonByText(view.container, 'criar').click(); });
    const create = send.mock.calls.map((call) => call[0] as Record<string, unknown>).find((message) => message.type === 'action:createWorkItem');
    expect(create).toMatchObject({ title: 'Original (copy)', workItemType: 'bug', description: 'Copied spec', dependsOn: ['feat-0'] });
  });

  it('shows the preview error from the server in the modal', () => {
    const send = vi.fn();
    const view = render({ send, defaultEpicId: 'epic-1' });
    const previewRequest = send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((message) => message.type === 'action:resolveWorkflowTemplate');
    view.rerender({ [previewRequest!.requestId]: { type: 'action:result', payload: { requestId: previewRequest!.requestId, ok: false, error: { code: 'not_found', message: 'no template mapped for bug' } } } as unknown as ActionResult });
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('no template mapped for bug');
    expect(buttonByText(view.container, 'criar').disabled).toBe(true);
  });

  it('closes and reports the created Work Item id on success; error keeps it open', () => {
    const send = vi.fn();
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const view = render({ send, onClose, onCreated, defaultEpicId: 'epic-1' });
    act(() => { setValue(view.container.querySelector('#create-work-item-title') as HTMLInputElement, 'My feature'); });
    const previewRequest = send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((message) => message.type === 'action:resolveWorkflowTemplate');
    view.rerender({ [previewRequest!.requestId]: previewOk(previewRequest!.requestId) });
    act(() => { buttonByText(view.container, 'criar').click(); });
    const create = send.mock.calls.map((call) => call[0] as { type: string; requestId: string }).find((message) => message.type === 'action:createWorkItem');
    view.rerender({
      [previewRequest!.requestId]: previewOk(previewRequest!.requestId),
      [create!.requestId]: { type: 'action:result', payload: { requestId: create!.requestId, ok: true, workItem: { workItemId: 'wi-9' }, revision: 1 } } as unknown as ActionResult,
    });
    expect(onCreated).toHaveBeenCalledWith('wi-9', 'My feature', 'epic-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
