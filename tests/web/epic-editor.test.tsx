// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpicEditor } from '../../src/web/client/pages/EpicEditor.js';
import type { PageDirtyRegistration } from '../../src/web/client/hooks/usePageDirtyState.js';
import type { EpicRow } from '../../src/db/repo.js';
import type { EpicActionResult, WebSocketClientMessage } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function epic(overrides: Partial<EpicRow> = {}): EpicRow {
  return {
    epicId: 'epic-1', projectId: 'project-1', repoId: null, title: 'Delivery', description: 'Initial scope', status: 'todo', position: 3,
    archivedAt: null, deletedAt: null, revision: 1, createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

function mount(props: Partial<React.ComponentProps<typeof EpicEditor>> = {}): { container: HTMLElement; rerender: (next: Partial<React.ComponentProps<typeof EpicEditor>>) => void } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const base = {
    epic: epic(), completedWorkItems: 1, totalWorkItems: 3, send: vi.fn<(message: WebSocketClientMessage) => void>(), actionResults: {}, requestId: vi.fn(() => 'epic-update-1'),
  };
  const rerender = (next: Partial<React.ComponentProps<typeof EpicEditor>> = {}): void => {
    act(() => { root.render(<EpicEditor {...base} {...props} {...next} />); });
  };
  rerender();
  return { container, rerender };
}

function setValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => { act(() => { roots.splice(0).forEach((root) => root.unmount()); }); document.body.replaceChildren(); });

describe('EpicEditor', () => {
  it('registers the global save and sends a sparse update with the expected revision', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    let pageSave: PageDirtyRegistration | undefined;
    const view = mount({ send, registerPageSave: (registration) => { pageSave = registration; } });
    act(() => {
      setValue(view.container.querySelector('#epic-epic-1-title') as HTMLInputElement, 'Launch');
      setValue(view.container.querySelector('#epic-epic-1-description') as HTMLInputElement, 'Updated scope');
      setValue(view.container.querySelector('#epic-epic-1-position') as HTMLInputElement, '5');
      pageSave?.save();
    });

    expect(send).toHaveBeenCalledWith({
      type: 'action:updateEpic', requestId: 'epic-update-1', epicId: 'epic-1', expectedRevision: 1,
      patch: { title: 'Launch', description: 'Updated scope', position: 5 },
    });
  });

  it('preserves a conflict draft and re-applies it against a refreshed revision', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    let pageSave: PageDirtyRegistration | undefined;
    const registerPageSave = (registration: PageDirtyRegistration): void => { pageSave = registration; };
    const view = mount({ send, registerPageSave });
    act(() => {
      setValue(view.container.querySelector('#epic-epic-1-title') as HTMLInputElement, 'Local draft');
      pageSave?.save();
    });
    const conflict: EpicActionResult = {
      type: 'action:result', payload: { requestId: 'epic-update-1', ok: false, error: { code: 'REVISION_CONFLICT', message: 'Epic was changed by another request. Refresh and try again.' } },
    };
    view.rerender({ send, registerPageSave, actionResults: { 'epic-update-1': conflict } });

    expect((view.container.querySelector('#epic-epic-1-title') as HTMLInputElement).value).toBe('Local draft');
    expect(view.container.textContent).toContain('Your draft is preserved');

    view.rerender({ send, registerPageSave, actionResults: { 'epic-update-1': conflict }, epic: epic({ title: 'Remote title', revision: 2 }) });
    act(() => { Array.from(view.container.querySelectorAll('button')).find((button) => button.textContent === 'reapply draft')?.click(); });
    expect(send).toHaveBeenLastCalledWith({
      type: 'action:updateEpic', requestId: 'epic-update-1', epicId: 'epic-1', expectedRevision: 2, patch: { title: 'Local draft' },
    });
  });

  it('keeps status read-only and exposes the server error message', () => {
    let pageSave: PageDirtyRegistration | undefined;
    const registerPageSave = (registration: PageDirtyRegistration): void => { pageSave = registration; };
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const view = mount({ epic: epic({ status: 'done' }), completedWorkItems: 1, totalWorkItems: 3, send, registerPageSave });

    expect(view.container.textContent).toContain('done');
    expect(view.container.textContent).toContain('derived progress: 1/3');
    expect(view.container.textContent).toContain('status follows Work Item execution');
    expect(view.container.querySelector('#epic-epic-1-status')).toBeNull();
    act(() => {
      setValue(view.container.querySelector('#epic-epic-1-title') as HTMLInputElement, 'Renamed');
      pageSave?.save();
    });
    const failure: EpicActionResult = {
      type: 'action:result', payload: { requestId: 'epic-update-1', ok: false, error: { code: 'SERVER_ERROR', message: 'Epic title is reserved.' } },
    };
    view.rerender({ send, registerPageSave, actionResults: { 'epic-update-1': failure }, epic: epic({ status: 'done' }) });
    expect(view.container.textContent).toContain('Epic title is reserved.');
  });
});
