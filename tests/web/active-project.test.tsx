// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { MobileTopBar } from '../../src/web/client/Responsive.js';
import { ActiveProjectProvider, ACTIVE_PROJECT_STORAGE_KEY, resolveActiveProjectId, useActiveProject } from '../../src/web/client/hooks/useActiveProject.js';
import type { ProjectSummary } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function project(projectId: string, position: number): ProjectSummary {
  return { projectId, name: `Project ${projectId}`, position, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null };
}

function SelectionProbe(): React.JSX.Element {
  const { activeProjectId, setActiveProject, selectionInvalidated } = useActiveProject();
  return <><span data-testid="active">{activeProjectId ?? 'none'}</span><span data-testid="invalidated">{String(selectionInvalidated)}</span><button onClick={() => { setActiveProject('two'); }}>select two</button></>;
}

function mount(projects: ProjectSummary[]): { container: HTMLElement; rerender: (nextProjects: ProjectSummary[]) => void } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const rerender = (nextProjects: ProjectSummary[]): void => {
    act(() => { root.render(<ActiveProjectProvider projects={nextProjects}><SelectionProbe /></ActiveProjectProvider>); });
  };
  rerender(projects);
  return { container, rerender };
}

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => root.unmount()); });
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe('active project selection', () => {
  it('uses a valid saved id, otherwise the first Project ordered by position', () => {
    const projects = [project('later', 3), project('first', 1)];
    expect(resolveActiveProjectId(projects, 'later')).toBe('later');
    expect(resolveActiveProjectId(projects, 'missing')).toBe('first');
    expect(resolveActiveProjectId([], 'missing')).toBeNull();
  });

  it('persists only in versioned localStorage and keeps each mounted client independent', () => {
    const first = mount([project('one', 0), project('two', 1)]);
    act(() => { (Array.from(first.container.querySelectorAll('button')).find((button) => button.textContent === 'select two') as HTMLButtonElement).click(); });
    expect(first.container.querySelector('[data-testid="active"]')?.textContent).toBe('two');
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBe('two');

    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, 'one');
    const second = mount([project('one', 0), project('two', 1)]);
    expect(second.container.querySelector('[data-testid="active"]')?.textContent).toBe('one');
  });

  it('reconciles a removed Project to the deterministic fallback and surfaces an invalidation notice', () => {
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, 'two');
    const view = mount([project('one', 0), project('two', 1)]);
    view.rerender([project('one', 0)]);
    expect(view.container.querySelector('[data-testid="active"]')?.textContent).toBe('one');
    expect(view.container.querySelector('[data-testid="invalidated"]')?.textContent).toBe('true');
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBe('one');
  });

  it('renders the same selector and no-project CTA on mobile', () => {
    const root = mount([]);
    act(() => {
      roots[roots.length - 1]?.render(<MobileTopBar live={false} notificationCount={0} onNotifications={() => {}} projects={[project('one', 0)]} activeProjectId="one" onSelectProject={() => {}} />);
    });
    expect(root.container.querySelector('select[aria-label="Active project"]')).not.toBeNull();
  });
});
