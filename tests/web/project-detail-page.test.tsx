// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailPage } from '../../src/web/client/pages/ProjectDetailPage.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function baseState(overrides: Partial<MsqWebState> = {}): MsqWebState {
  return {
    featureCatalog: {},
    projects: [{
      projectId: 'proj-1',
      name: 'Project One',
      position: 0,
      description: null,
      revision: 1,
      counts: { epics: 1, workItems: 0, archived: 0 },
      activeRuns: 0,
      tokens: { status: 'ready' },
      archivedAt: null,
    }],
    repositories: [{ repoId: 'repo-1', projectId: 'proj-1', label: 'repo-one', health: 'ok', lastCheckedAt: null }],
    epics: [{
      epicId: 'epic-1',
      projectId: 'proj-1',
      repoId: null,
      title: 'Epic One',
      description: null,
      status: 'todo',
      position: 0,
      archivedAt: null,
      deletedAt: null,
      revision: 1,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }],
    runs: [],
    ...overrides,
  } as unknown as MsqWebState;
}

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

function render(
  state: MsqWebState,
  send: (message: WebSocketClientMessage) => void,
  actionResults: Record<string, ActionResult>,
): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <ProjectDetailPage state={state} projectId="proj-1" send={send} actionResults={actionResults} onBack={() => undefined} />,
    );
  });
  return { container, root };
}

function selectByLabel(container: HTMLDivElement, label: string): HTMLSelectElement {
  const el = container.querySelector(`select[aria-label="${label}"]`);
  if (!el) throw new Error(`Could not find select with aria-label "${label}"`);
  return el as HTMLSelectElement;
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function submitButton(container: HTMLDivElement): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')];
  const button = buttons.find((candidate) => candidate.textContent === 'create Work Item');
  if (!button) throw new Error('Could not find "create Work Item" button');
  return button as HTMLButtonElement;
}

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

describe('ProjectDetailPage work item type preview', () => {
  it('requests a template preview once epic and repository are selected, and blocks submit until it resolves', () => {
    const send = vi.fn();
    let actionResults: Record<string, ActionResult> = {};
    const state = baseState();
    const { container, root } = render(state, send, actionResults);

    setSelectValue(selectByLabel(container, 'Epic'), 'epic-1');
    setSelectValue(selectByLabel(container, 'Repository'), 'repo-1');

    expect(send).toHaveBeenCalledTimes(1);
    const previewMessage = send.mock.calls[0]?.[0] as Extract<WebSocketClientMessage, { type: 'action:resolveWorkflowTemplate' }>;
    expect(previewMessage.type).toBe('action:resolveWorkflowTemplate');
    expect(previewMessage.epicId).toBe('epic-1');
    expect(previewMessage.repoId).toBe('repo-1');
    expect(previewMessage.workItemType).toBe('feature');

    expect(container.textContent).toContain('resolving template');
    expect(submitButton(container).disabled).toBe(true);

    actionResults = {
      [previewMessage.requestId]: {
        type: 'action:result',
        payload: { requestId: previewMessage.requestId, ok: true, preview: { templateId: 'tmpl-feature', templateVersion: 2, origin: 'builtin', stages: ['specify', 'implement'] } },
      },
    };
    act(() => {
      root.render(
        <ProjectDetailPage state={state} projectId="proj-1" send={send} actionResults={actionResults} onBack={() => undefined} />,
      );
    });

    expect(container.textContent).toContain('tmpl-feature');
    expect(container.textContent).toContain('specify');
    expect(submitButton(container).disabled).toBe(true);

    act(() => {
      const titleInput = container.querySelector('#new-work-item-title') as HTMLInputElement | null;
      if (!titleInput) throw new Error('title input not found');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(titleInput, 'Fix the thing');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(submitButton(container).disabled).toBe(false);
  });

  it('blocks submit and surfaces the error when the preview reports a missing skill', () => {
    const send = vi.fn();
    const state = baseState();
    const { container, root } = render(state, send, {});

    setSelectValue(selectByLabel(container, 'Epic'), 'epic-1');
    setSelectValue(selectByLabel(container, 'Repository'), 'repo-1');
    const previewMessage = send.mock.calls[0]?.[0] as Extract<WebSocketClientMessage, { type: 'action:resolveWorkflowTemplate' }>;

    const actionResults: Record<string, ActionResult> = {
      [previewMessage.requestId]: {
        type: 'action:result',
        payload: { requestId: previewMessage.requestId, ok: false, error: { code: 'WORKFLOW_TEMPLATE_INVALID', message: 'Skill "review" is not available in this repository.' } },
      },
    };
    act(() => {
      root.render(
        <ProjectDetailPage state={state} projectId="proj-1" send={send} actionResults={actionResults} onBack={() => undefined} />,
      );
    });

    expect(container.textContent).toContain('Skill "review" is not available in this repository.');
    expect(submitButton(container).disabled).toBe(true);
  });

  it('re-requests a fresh preview when the Work Item type changes', () => {
    const send = vi.fn();
    const state = baseState();
    const { container } = render(state, send, {});

    setSelectValue(selectByLabel(container, 'Epic'), 'epic-1');
    setSelectValue(selectByLabel(container, 'Repository'), 'repo-1');
    expect(send).toHaveBeenCalledTimes(1);

    setSelectValue(selectByLabel(container, 'Work Item type'), 'bug');
    expect(send).toHaveBeenCalledTimes(2);
    const secondMessage = send.mock.calls[1]?.[0] as Extract<WebSocketClientMessage, { type: 'action:resolveWorkflowTemplate' }>;
    expect(secondMessage.workItemType).toBe('bug');
  });
});
