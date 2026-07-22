// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BacklogItemDetail } from '../../src/web/client/pages/BacklogItemDetail.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../src/web/types.js';

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

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
    runs: [],
    ...overrides,
  } as unknown as MsqWebState;
}

function render(state: MsqWebState, breadcrumb?: Array<{ label: string; href: string }>): string {
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
      breadcrumb={breadcrumb}
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

describe('BacklogItemDetail contextual breadcrumb (PF-14)', () => {
  it('keeps the default Board breadcrumb when no override is given', () => {
    const html = render(baseState());
    expect(html).toContain('Board');
    expect(html).not.toContain('›');
  });

  it('renders the Projects › Project › Epic trail when a breadcrumb override is given', () => {
    const html = render(baseState(), [
      { label: 'Projects', href: '/projects' },
      { label: 'Project One', href: '/projects/proj-1' },
      { label: 'Epic One', href: '/projects/proj-1/epics/epic-1' },
    ]);
    expect(html).toContain('Projects');
    expect(html).toContain('Project One');
    expect(html).toContain('Epic One');
    expect(html).toContain('›');
    expect(html).not.toContain('>Board<');
  });
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

describe('BacklogItemDetail dependency guard', () => {
  it('disables start when dependencies are not done', () => {
    const state = baseState({
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
          dependsOn: ['dep-a', 'dep-b'],
          pendingDependencies: ['dep-a', 'dep-b'],
          workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, autoAdvance: false, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
        },
      },
      doneFeatureIds: [],
    } as unknown as Partial<MsqWebState>);
    const html = render(state);
    const button = startButtonMarkup(html);
    expect(button).toContain('disabled=""');
    expect(button).toContain('title="Pending dependencies: dep-a, dep-b"');
  });

  it('enables start when all dependencies are done', () => {
    const state = baseState({
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
          dependsOn: ['dep-a'],
          pendingDependencies: [],
          workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, autoAdvance: false, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
        },
      },
      doneFeatureIds: ['dep-a'],
    } as unknown as Partial<MsqWebState>);
    const html = render(state);
    const button = startButtonMarkup(html);
    expect(button).toContain('title="Start feature"');
    expect(button).not.toContain('disabled');
  });

  it('disables start when only some dependencies are done', () => {
    const state = baseState({
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
          dependsOn: ['dep-a', 'dep-b'],
          pendingDependencies: ['dep-b'],
          workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, autoAdvance: false, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
        },
      },
      doneFeatureIds: ['dep-a'],
    } as unknown as Partial<MsqWebState>);
    const html = render(state);
    const button = startButtonMarkup(html);
    expect(button).toContain('disabled=""');
    expect(button).toContain('title="Pending dependencies: dep-b"');
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

describe('BacklogItemDetail Work Item type change', () => {
  function stateWithType(overrides: { workItemType?: string; templateId?: string; templateVersion?: number; runs?: unknown[] } = {}): MsqWebState {
    return baseState({
      runs: overrides.runs ?? [],
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
          workItemType: overrides.workItemType ?? 'feature',
          revision: 4,
          templateId: overrides.templateId,
          templateVersion: overrides.templateVersion,
          workflow: {
            mode: 'staged',
            stages: ['specify', 'implement'],
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

  function renderInteractive(
    state: MsqWebState,
    send: (message: WebSocketClientMessage) => void,
    actionResults: Record<string, ActionResult>,
  ): { container: HTMLDivElement; rerender: (nextActionResults: Record<string, ActionResult>) => void } {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const doRender = (nextActionResults: Record<string, ActionResult>): void => {
      act(() => {
        root.render(
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
            send={send}
            actionResults={nextActionResults}
          />,
        );
      });
    };
    doRender(actionResults);
    return { container, rerender: doRender };
  }

  function findButton(container: HTMLDivElement, text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
    if (!button) throw new Error(`Could not find button with text "${text}"`);
    return button;
  }

  it('shows the type and template/version badges', () => {
    const html = renderToStaticMarkup(
      <BacklogItemDetail
        state={stateWithType({ workItemType: 'bug', templateId: 'tmpl-bug', templateVersion: 2 })}
        featureId="feat-1"
        runHistories={{}}
        onSubscribeHistory={() => () => undefined}
        onBack={() => undefined}
        onStart={() => undefined}
        onSaveConfig={() => undefined}
        onSaveTaskConfig={() => undefined}
        onOpenRun={() => undefined}
        send={() => undefined}
        actionResults={{}}
      />,
    );
    expect(html).toContain('title="type: bug"');
    expect(html).toContain('title="workflow template: tmpl-bug v2"');
  });

  it('requests a preview and shows the current/new workflow diff when a type change is requested', () => {
    const send = vi.fn();
    const { container } = renderInteractive(stateWithType(), send, {});

    act(() => { findButton(container, 'change to bug').click(); });

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as Extract<WebSocketClientMessage, { type: 'action:changeWorkItemType' }>;
    expect(message.type).toBe('action:changeWorkItemType');
    expect(message.workItemId).toBe('feat-1');
    expect(message.workItemType).toBe('bug');
    expect(message.expectedRevision).toBe(4);
    expect(message.preview).toBe(true);

    expect(container.textContent).toContain('Change type: feature → bug');
    expect(findButton(container, 'applying…').disabled).toBe(true);
  });

  it('confirms the type change after a valid preview resolves', () => {
    const send = vi.fn();
    const { container, rerender } = renderInteractive(stateWithType(), send, {});

    act(() => { findButton(container, 'change to bug').click(); });
    const previewMessage = send.mock.calls[0]?.[0] as Extract<WebSocketClientMessage, { type: 'action:changeWorkItemType' }>;

    rerender({
      [previewMessage.requestId]: {
        type: 'action:result',
        payload: { requestId: previewMessage.requestId, ok: true, preview: { templateId: 'tmpl-bug', templateVersion: 1, origin: 'builtin', stages: ['triage', 'fix'] } },
      } as unknown as ActionResult,
    });

    expect(container.textContent).toContain('New template: tmpl-bug v1');
    expect(findButton(container, 'confirm change').disabled).toBe(false);

    act(() => { findButton(container, 'confirm change').click(); });
    const confirmMessage = send.mock.calls[send.mock.calls.length - 1]?.[0] as Extract<WebSocketClientMessage, { type: 'action:changeWorkItemType' }>;
    expect(confirmMessage.preview).toBeUndefined();
    expect(confirmMessage.workItemType).toBe('bug');
  });

  it('shows the server error and keeps the diff open when the type change is rejected', () => {
    const send = vi.fn();
    const { container, rerender } = renderInteractive(stateWithType(), send, {});
    act(() => { findButton(container, 'change to bug').click(); });
    const previewMessage = send.mock.calls[0]?.[0] as Extract<WebSocketClientMessage, { type: 'action:changeWorkItemType' }>;

    rerender({
      [previewMessage.requestId]: {
        type: 'action:result',
        payload: { requestId: previewMessage.requestId, ok: false, error: { code: 'SKILL_MISSING', message: 'Target repository is missing a required skill.' } },
      } as unknown as ActionResult,
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('Target repository is missing a required skill.');
    expect(container.textContent).toContain('Change type: feature → bug');
  });

  it('disables the type change controls and explains why when the Work Item has run history', () => {
    const html = renderToStaticMarkup(
      <BacklogItemDetail
        state={stateWithType({ runs: [{ featureId: 'feat-1', status: 'done' }] })}
        featureId="feat-1"
        runHistories={{}}
        onSubscribeHistory={() => () => undefined}
        onBack={() => undefined}
        onStart={() => undefined}
        onSaveConfig={() => undefined}
        onSaveTaskConfig={() => undefined}
        onOpenRun={() => undefined}
        send={() => undefined}
        actionResults={{}}
      />,
    );
    expect(html).toContain('type locked (has run history)');
    expect(html).toContain('title="This Work Item has run history — its type is locked."');
    expect(html).not.toContain('change to bug');
  });
});

describe('BacklogItemDetail spec markdown editor', () => {
  function stateWithSpec(description: string | null): MsqWebState {
    return baseState({
      featureCatalog: {
        'feat-1': {
          id: 'feat-1',
          title: 'Feature One',
          description,
          repoId: 'repo-1',
          projectId: null,
          repoLabel: null,
          tool: 'claude',
          effort: 'medium',
          skills: [],
          dependsOn: [],
          pendingDependencies: [],
          workItemType: 'feature',
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

  function renderInteractive(state: MsqWebState): { container: HTMLDivElement; findButton: (text: string) => HTMLButtonElement; findTextarea: () => HTMLTextAreaElement; findPreview: () => HTMLElement | null } {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(
        <ActiveProjectContext.Provider value={{ activeProjectId: null, activeProject: null, setActiveProject: () => undefined, selectionInvalidated: false }}>
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
            send={() => undefined}
            actionResults={{}}
          />
        </ActiveProjectContext.Provider>,
      );
    });
    return {
      container,
      findButton: (text: string) => {
        const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
        if (!button) throw new Error(`Could not find button with text "${text}"`);
        return button as HTMLButtonElement;
      },
      findTextarea: () => {
        const textarea = container.querySelector('textarea[aria-label="Feature specification"]');
        if (!textarea) throw new Error('Could not find the spec textarea');
        return textarea as HTMLTextAreaElement;
      },
      findPreview: () => container.querySelector('[data-testid="spec-preview"]') as HTMLElement | null,
    };
  }

  it('renders the spec as markdown in the preview tab and reflects unsaved edits', () => {
    const { container, findButton, findTextarea, findPreview } = renderInteractive(
      stateWithSpec('# Goal\n\nA paragraph with **bold** and `inline` code.'),
    );

    expect(findPreview()).toBeNull();
    expect(findTextarea().value).toBe('# Goal\n\nA paragraph with **bold** and `inline` code.');

    act(() => { findButton('Preview').click(); });
    const preview = findPreview();
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain('Goal');
    expect(preview?.querySelector('h1')?.textContent).toBe('Goal');
    expect(preview?.querySelector('strong')?.textContent).toBe('bold');
    expect(preview?.querySelector('code')?.textContent).toBe('inline');
    expect(preview?.textContent).not.toContain('previewing unsaved changes');
  });

  it('previews unsaved draft changes with the dirty banner, and the save button enables only when dirty', () => {
    const { container, findButton, findTextarea, findPreview } = renderInteractive(stateWithSpec('initial spec'));
    const saveButton = findButton('save spec');
    expect(saveButton.disabled).toBe(true);

    act(() => {
      const textarea = findTextarea();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, '## new spec\n\n- [ ] task one');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(saveButton.disabled).toBe(false);

    act(() => { findButton('Preview').click(); });
    const preview = findPreview();
    expect(preview?.querySelector('h2')?.textContent).toBe('new spec');
    expect(preview?.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(preview?.textContent).toContain('previewing unsaved changes');
  });

  it('renders GFM tables and code blocks in the preview', () => {
    const markdown = [
      '| col | value |',
      '| --- | --- |',
      '| foo | 1 |',
      '',
      '```ts',
      'const x: number = 1;',
      '```',
    ].join('\n');
    const { findButton, findPreview } = renderInteractive(stateWithSpec(markdown));
    act(() => { findButton('Preview').click(); });
    const preview = findPreview();
    expect(preview?.querySelector('table')).not.toBeNull();
    expect(preview?.querySelector('th')?.textContent).toBe('col');
    expect(preview?.querySelector('pre code')?.textContent).toContain('const x');
    expect(preview?.querySelector('pre code')?.className).toContain('language-ts');
  });

  it('shows an empty-state message when there is no spec', () => {
    const { findButton, findPreview } = renderInteractive(stateWithSpec(null));
    act(() => { findButton('Preview').click(); });
    const preview = findPreview();
    expect(preview?.textContent).toContain('Nothing to preview yet');
  });
});
