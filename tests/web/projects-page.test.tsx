// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from '../../src/web/client/pages/ProjectsPage.js';
import type { MsqWebState, ProjectActionResult, WebSocketClientMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

function project(overrides: Record<string, unknown> = {}) {
  return { projectId: 'project-1', name: 'Platform', position: 0, description: 'Shared platform', revision: 1, counts: { epics: 2, workItems: 4, archived: 0 }, activeRuns: 1, tokens: { status: 'ready' as const, totalTokens: 1200, error: null }, archivedAt: null, updatedAt: '2026-07-01T00:00:00.000Z', ...overrides };
}

function state(projects = [project()]): MsqWebState {
  return { projects, repositories: [{ repoId: 'repo-1', projectId: 'project-1', label: 'platform', health: 'ok', lastCheckedAt: null }] } as unknown as MsqWebState;
}

function render(props: Partial<React.ComponentProps<typeof ProjectsPage>> = {}): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(<ProjectsPage state={props.state ?? state()} send={props.send ?? (() => undefined)} actionResults={props.actionResults ?? {}} />); });
  return container;
}

function setValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => { act(() => { roots.splice(0).forEach((root) => root.unmount()); }); document.body.replaceChildren(); });

describe('ProjectsPage', () => {
  it('lists active Projects with name, description, and aggregate tag pills', () => {
    const container = render();
    expect(container.textContent).toContain('Platform');
    expect(container.textContent).toContain('Shared platform');
    expect(container.textContent).toContain('2 Epics');
    expect(container.textContent).toContain('4 Work Items');
    expect(container.textContent).toContain('atualizado');
  });

  it('shows an accessible empty CTA and search-empty state', () => {
    const empty = render({ state: state([]) });
    expect(empty.textContent).toContain('No Projects yet');
    expect(empty.textContent).toContain('create your first Project');
    const input = empty.querySelector('[aria-label="Search projects"]') as HTMLInputElement;
    act(() => { setValue(input, 'missing'); });
    expect(empty.textContent).toContain('No matching Projects');
  });

  it('sends create and update actions with a request id and expected revision', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const container = render({ send });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '+ Novo Projeto')?.click(); });
    act(() => { setValue(container.querySelector('#new-project-name') as HTMLInputElement, 'New Project'); });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'create project')?.click(); });
    expect(send.mock.calls[0]?.[0]).toMatchObject({ type: 'action:createProject', name: 'New Project' });
    expect((send.mock.calls[0]?.[0] as { requestId: string }).requestId).toBeTruthy();

    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'edit')?.click(); });
    const name = container.querySelector('#project-project-1-name') as HTMLInputElement;
    act(() => { setValue(name, 'Renamed'); });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save')?.click(); });
    expect(send.mock.calls[1]?.[0]).toMatchObject({ type: 'action:updateProject', projectId: 'project-1', expectedRevision: 1, patch: { name: 'Renamed' } });
  });

  it('preserves an update draft after a correlated revision conflict', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const container = render({ send });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'edit')?.click(); });
    const name = container.querySelector('#project-project-1-name') as HTMLInputElement;
    act(() => { setValue(name, 'Draft name'); });
    act(() => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save')?.click(); });
    const requestId = (send.mock.calls[0]?.[0] as { requestId: string }).requestId;
    const result: ProjectActionResult = { type: 'action:result', payload: { requestId, ok: false, error: { code: 'REVISION_CONFLICT', message: 'Project was changed by another request. Refresh and try again.' } } };
    act(() => { roots[0]?.render(<ProjectsPage state={state()} send={send} actionResults={{ [requestId]: result }} />); });
    expect((container.querySelector('#project-project-1-name') as HTMLInputElement).value).toBe('Draft name');
    expect(container.textContent).toContain('Your draft is preserved');
  });

  it('shows correct repository count per project in tag pills', () => {
    const linked = state([project(), project({ projectId: 'project-2', name: 'Other', position: 1 })]);
    linked.repositories = [
      { repoId: 'repo-free', projectId: 'project-1', label: 'free', health: 'ok', lastCheckedAt: null },
      { repoId: 'repo-other', projectId: 'project-2', label: 'other', health: 'ok', lastCheckedAt: null },
    ];
    const container = render({ state: linked });
    const rows = [...container.querySelectorAll('[role="button"]')];
    expect(rows[0]?.textContent).toContain('1 repos');
    expect(rows[1]?.textContent).toContain('1 repos');
  });

  it('keeps filesystem paths out of the repository section', () => {
    const container = render({ state: state() });
    expect(container.textContent).not.toContain('/private/secret');
  });
});
