// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoriesSection } from '../../src/web/client/components/project/RepositoriesSection.js';
import type { MsqWebState, ProjectSummary, WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

const roots: Root[] = [];

const project = {
  projectId: 'proj-1',
  name: 'Project One',
  position: 0,
  description: null,
  revision: 1,
  counts: { epics: 0, workItems: 0, archived: 0 },
  activeRuns: 0,
  tokens: { status: 'ready' },
  archivedAt: null,
} as unknown as ProjectSummary;

interface View {
  container: HTMLDivElement;
  send: ReturnType<typeof vi.fn>;
  rerender: (actionResults: Record<string, ActionResult>) => void;
}

function render(repositories: MsqWebState['repositories'] = []): View {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const send = vi.fn();
  const element = (actionResults: Record<string, ActionResult>): React.JSX.Element => (
    <RepositoriesSection
      project={project}
      repositories={repositories}
      actionResults={actionResults}
      send={send as (message: WebSocketClientMessage) => void}
    />
  );
  act(() => { root.render(element({})); });
  return { container, send, rerender: (actionResults) => { act(() => { root.render(element(actionResults)); }); } };
}

function pathInput(container: HTMLDivElement): HTMLInputElement {
  return container.querySelector('input[aria-label="Repository path"]') as HTMLInputElement;
}

function buttonByText(container: HTMLDivElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === text);
}

function typePath(container: HTMLDivElement, value: string): void {
  const input = pathInput(container);
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, value);
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
}

function confirmationRequired(requestId: string): ActionResult {
  return { type: 'action:result', payload: { requestId, ok: false, error: { code: 'REPO_PATH_CONFIRMATION_REQUIRED', message: 'Explicit confirmation is required before registering a repository path.' } } } as unknown as ActionResult;
}

afterEach(() => {
  roots.splice(0).forEach((root) => { act(() => { root.unmount(); }); });
  document.body.innerHTML = '';
});

describe('RepositoriesSection add-by-path (PF-13)', () => {
  it('renders a repository short ID with the R prefix', () => {
    const view = render([{ repoId: 'repo-1', projectId: 'proj-1', label: 'repo-one', health: 'ok', lastCheckedAt: null }]);
    expect(view.container.textContent).toMatch(/R-[0-9A-F]{8}/);
  });

  it('shows the add CTA when the project has no repository', () => {
    const view = render([]);
    expect(view.container.textContent).toContain('Add one by path below');
    expect(pathInput(view.container)).not.toBeNull();
  });

  it('keeps add disabled for relative or empty paths', () => {
    const view = render();
    expect(buttonByText(view.container, 'add')?.disabled).toBe(true);
    typePath(view.container, 'relative/path');
    expect(buttonByText(view.container, 'add')?.disabled).toBe(true);
    typePath(view.container, '/abs/path');
    expect(buttonByText(view.container, 'add')?.disabled).toBe(false);
  });

  it('probes without confirm, then confirms with confirm: true', () => {
    const view = render();
    typePath(view.container, '/repos/my-app ');
    act(() => { buttonByText(view.container, 'add')?.click(); });
    const probe = view.send.mock.calls[0]?.[0] as { type: string; requestId: string; path: string; confirm?: boolean };
    expect(probe).toMatchObject({ type: 'action:linkRepo', path: '/repos/my-app' });
    expect(probe.confirm).toBeUndefined();

    view.rerender({ [probe.requestId]: confirmationRequired(probe.requestId) });
    expect(view.container.textContent).toContain('Register and link');
    expect(view.container.querySelector('[role="alert"]')).toBeNull();

    act(() => { buttonByText(view.container, 'confirm add')?.click(); });
    const confirm = view.send.mock.calls[1]?.[0] as { type: string; requestId: string; path: string; confirm?: boolean };
    expect(confirm).toMatchObject({ type: 'action:linkRepo', path: '/repos/my-app', confirm: true });

    view.rerender({
      [probe.requestId]: confirmationRequired(probe.requestId),
      [confirm.requestId]: { type: 'action:result', payload: { requestId: confirm.requestId, ok: true, entity: { repoId: 'my-app' } } } as unknown as ActionResult,
    });
    expect(pathInput(view.container).value).toBe('');
    expect(view.container.textContent).not.toContain('Register and link');
  });

  it('cancel on the confirmation step sends nothing further', () => {
    const view = render();
    typePath(view.container, '/repos/my-app');
    act(() => { buttonByText(view.container, 'add')?.click(); });
    const probe = view.send.mock.calls[0]?.[0] as { requestId: string };
    view.rerender({ [probe.requestId]: confirmationRequired(probe.requestId) });
    act(() => { buttonByText(view.container, 'cancel')?.click(); });
    expect(view.send).toHaveBeenCalledTimes(1);
    expect(pathInput(view.container)).not.toBeNull();
    expect(pathInput(view.container).value).toBe('/repos/my-app');
  });

  it('shows the server refusal verbatim when the confirmed path is rejected', () => {
    const view = render();
    typePath(view.container, '/outside/allowlist');
    act(() => { buttonByText(view.container, 'add')?.click(); });
    const probe = view.send.mock.calls[0]?.[0] as { requestId: string };
    view.rerender({ [probe.requestId]: confirmationRequired(probe.requestId) });
    act(() => { buttonByText(view.container, 'confirm add')?.click(); });
    const confirm = view.send.mock.calls[1]?.[0] as { requestId: string };
    view.rerender({
      [probe.requestId]: confirmationRequired(probe.requestId),
      [confirm.requestId]: { type: 'action:result', payload: { requestId: confirm.requestId, ok: false, error: { code: 'REPO_PATH_NOT_ALLOWED', message: 'Repository path is outside the allowed roots.' } } } as unknown as ActionResult,
    });
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('Repository path is outside the allowed roots.');
    expect(view.container.textContent).not.toContain('Register and link');
  });
});
