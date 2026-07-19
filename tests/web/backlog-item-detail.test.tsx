// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BacklogItemDetail } from '../../src/web/client/pages/BacklogItemDetail.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function baseState(overrides: Partial<MsqWebState> = {}): MsqWebState {
  return {
    featureCatalog: {
      'feat-1': {
        id: 'feat-1',
        title: 'Feature One',
        repoId: 'repo-1',
        projectId: null,
        repoLabel: null,
        tool: 'claude',
        effort: 'medium',
        skills: [],
        dependsOn: [],
        pendingDependencies: [],
        workflow: {
          mode: 'staged',
          stages: ['specify'],
          approvals: { channel: 'telegram', autoAdvance: false },
          autoAdvance: false,
          syncTasksToBacklog: true,
          sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
        },
      },
    },
    projects: [],
    repositories: [],
    backlogSettings: {
      stageSkills: {},
      toolCapabilities: {
        claude: { model: true, effort: true, thinking: true },
        codex: { model: true, effort: true, thinking: false },
        opencode: { model: true, effort: false, thinking: false },
      },
    },
    runtimeConfig: { notifications: { channels: [] }, tools: [{ id: 'claude' }] },
    ...overrides,
  } as unknown as MsqWebState;
}

function render(state: MsqWebState): string {
  return renderToStaticMarkup(
    <BacklogItemDetail
      state={state}
      featureId="feat-1"
      runHistories={{}}
      onSubscribeHistory={() => () => undefined}
      onBack={() => undefined}
      onStart={() => undefined}
      onSaveConfig={() => undefined}
      onSaveTaskConfig={() => undefined}
      onOpenRun={() => undefined}
    />,
  );
}

function startButtonMarkup(html: string): string {
  const match = /<button[^>]*>start feature<\/button>/.exec(html);
  if (!match) throw new Error('Could not find the "start feature" button in the rendered markup.');
  return match[0];
}

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

describe('BacklogItemDetail repo health guard', () => {
  it('keeps start enabled when the repository is healthy or unchecked', () => {
    const html = render(baseState({ repositories: [{ repoId: 'repo-1', projectId: null, label: 'repo-1', health: 'unchecked', lastCheckedAt: null }] } as Partial<MsqWebState>));
    const button = startButtonMarkup(html);
    expect(button).toContain('title="Start feature"');
    expect(button).not.toContain('disabled');
  });

  it('disables start and explains why when the repository is unavailable', () => {
    const html = render(baseState({ repositories: [{ repoId: 'repo-1', projectId: null, label: 'repo-1', health: 'unavailable', lastCheckedAt: null }] } as Partial<MsqWebState>));
    const button = startButtonMarkup(html);
    expect(button).toContain('disabled=""');
    expect(button).toContain('title="Repository unavailable — cannot start."');
  });
});

describe('BacklogItemDetail Project/repo context', () => {
  function stateWithItemContext(): MsqWebState {
    return baseState({
      projects: [{ projectId: 'project-a', name: 'Project A', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null }],
      featureCatalog: {
        'feat-1': {
          id: 'feat-1',
          title: 'Feature One',
          repoId: 'repo-1',
          projectId: 'project-a',
          repoLabel: 'repo-one',
          tool: 'claude',
          effort: 'medium',
          skills: [],
          dependsOn: [],
          pendingDependencies: [],
          workflow: {
            mode: 'staged',
            stages: ['specify'],
            approvals: { channel: 'telegram', autoAdvance: false },
            autoAdvance: false,
            syncTasksToBacklog: true,
            sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
            stepGuidance: {},
          },
        },
      },
    } as unknown as Partial<MsqWebState>);
  }

  it('shows the item Project name and repo label in the breadcrumb', () => {
    const html = render(stateWithItemContext());
    expect(html).toContain('Project A · repo-one · feat-1');
  });

  it('omits Project/repo from the breadcrumb when the item has no known context', () => {
    const html = render(baseState());
    expect(html).toContain('feat-1 · not started yet');
    expect(html).not.toContain(' · feat-1');
  });

  it('switches the active project context to the item Project before returning from a mismatched selection', () => {
    const setActiveProject = vi.fn();
    const onBack = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ActiveProjectContext.Provider value={{ activeProjectId: 'project-other', activeProject: null, setActiveProject, selectionInvalidated: false }}>
          <BacklogItemDetail
            state={stateWithItemContext()}
            featureId="feat-1"
            runHistories={{}}
            onSubscribeHistory={() => () => undefined}
            onBack={onBack}
            onStart={() => undefined}
            onSaveConfig={() => undefined}
            onSaveTaskConfig={() => undefined}
            onOpenRun={() => undefined}
          />
        </ActiveProjectContext.Provider>,
      );
    });

    const closeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'close');
    act(() => { closeButton?.click(); });

    expect(setActiveProject).toHaveBeenCalledWith('project-a');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not switch context when the item already belongs to the active Project', () => {
    const setActiveProject = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <ActiveProjectContext.Provider value={{ activeProjectId: 'project-a', activeProject: null, setActiveProject, selectionInvalidated: false }}>
          <BacklogItemDetail
            state={stateWithItemContext()}
            featureId="feat-1"
            runHistories={{}}
            onSubscribeHistory={() => () => undefined}
            onBack={() => undefined}
            onStart={() => undefined}
            onSaveConfig={() => undefined}
            onSaveTaskConfig={() => undefined}
            onOpenRun={() => undefined}
          />
        </ActiveProjectContext.Provider>,
      );
    });

    const closeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'close');
    act(() => { closeButton?.click(); });

    expect(setActiveProject).not.toHaveBeenCalled();
  });
});
