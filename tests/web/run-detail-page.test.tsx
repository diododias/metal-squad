// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunDetailPage } from '../../src/web/client/pages/RunDetailPage.js';
import { ActiveProjectContext } from '../../src/web/client/hooks/useActiveProject.js';
import type { MsqWebState, WebSocketClientMessage } from '../../src/web/types.js';
import type { RunSummary } from '../../src/db/repo.js';
import type { OutputLine } from '../../src/web/client/hooks/useLocalOutput.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 1,
    repoId: 'repo-1',
    featureId: 'feat-1',
    tool: 'codex',
    pipelineId: 7,
    stage: 'implement',
    rawStatus: 'blocked',
    status: 'blocked',
    startedAt: '2026-07-15T12:00:00.000Z',
    endedAt: null,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    gateId: null,
    gateDecision: null,
    pipelineStatus: 'paused',
    pipelineCurrentStage: 'implement',
    pipelineResumeSummary: null,
    pendingStageRequestId: null,
    pendingStageRequestKind: null,
    pendingStageRequestPrompt: null,
    pendingStageRequestCreatedAt: null,
    ...overrides,
  };
}

function makeState(run: RunSummary): MsqWebState {
  return {
    runs: [run],
    featureCatalog: {},
    runtimeConfig: { web: { statusSpinner: false }, tools: [{ id: 'claude' }, { id: 'codex' }, { id: 'opencode' }] },
  } as unknown as MsqWebState;
}

function renderPage(run: RunSummary, send: (message: WebSocketClientMessage) => void): HTMLElement {
  return renderPageWithLines(run, {}, send);
}

function renderPageWithLines(
  run: RunSummary,
  linesByRun: Record<number, OutputLine[]>,
  send: (message: WebSocketClientMessage) => void,
): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <RunDetailPage
        state={makeState(run)}
        featureId="feat-1"
        runDetails={{}}
        linesByRun={linesByRun}
        onSubscribeRun={() => () => undefined}
        onBack={() => undefined}
        send={send}
      />,
    );
  });
  return container;
}

function setControlValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value');
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  act(() => {
    roots.forEach((root) => { root.unmount(); });
  });
  roots.length = 0;
  document.body.replaceChildren();
});

describe('RunDetailPage resume with override', () => {
  it('displays accumulated tokens across resumed sessions', () => {
    const container = renderPage(makeRun({ totalTokens: 125, pipelineTotalTokens: 900 }), vi.fn());

    expect(container.textContent).toContain('900 tok');
  });

  it('labels a publish note as a notice (not an error) when the publication is already verified', () => {
    const note = 'note: post-run could not verify whether HEAD descends from the declared base develop. A verified GitHub PR already confirms this publication; treat this only as informational.';
    const container = renderPage(makeRun({ publishVerified: true, publishError: note, prNumber: 230, prUrl: 'https://example.test/pr/230' }), vi.fn());

    expect(container.textContent).toContain('Publish warning');
    expect(container.textContent).not.toContain('Publish check');
    expect(container.textContent).toContain(note);
  });

  it('labels an unverified publish error as a check failure', () => {
    const error = 'publish: no pull request is open for the current branch against develop.';
    const container = renderPage(makeRun({ publishVerified: false, publishError: error }), vi.fn());

    expect(container.textContent).toContain('Publish check');
    expect(container.textContent).not.toContain('Publish warning');
    expect(container.textContent).toContain(error);
  });

  it('renders the override controls for a resumable paused pipeline and dispatches overrides', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const container = renderPage(makeRun(), send);

    const tool = container.querySelector('[aria-label="Resume tool override"]') as HTMLSelectElement;
    const model = container.querySelector('[aria-label="Resume model override"]') as HTMLInputElement;
    const effort = container.querySelector('[aria-label="Resume effort override"]') as HTMLSelectElement;
    act(() => {
      setControlValue(tool, 'claude');
      setControlValue(model, 'sonnet');
      setControlValue(effort, 'high');
    });
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'resume with override');
    expect(button).toBeDefined();

    act(() => { button?.click(); });

    expect(send).toHaveBeenCalledWith({
      type: 'action:resumeWithOverride',
      pipelineId: 7,
      featureId: 'feat-1',
      tool: 'claude',
      model: 'sonnet',
      effort: 'high',
    });
  });

  it('approves a pending stage and resumes with the selected tool', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const container = renderPage(makeRun({
      pendingStageRequestId: 22,
      pendingStageRequestKind: 'approval',
      pendingStageRequestPrompt: 'Approve implementation?',
    }), send);

    const tool = container.querySelector('[aria-label="Approval tool override"]') as HTMLSelectElement;
    act(() => { setControlValue(tool, 'claude'); });

    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'approve + continue');
    expect(button).toBeDefined();
    act(() => { button?.click(); });

    expect(send).toHaveBeenCalledWith({
      type: 'action:resumeWithOverride',
      pipelineId: 7,
      featureId: 'feat-1',
      tool: 'claude',
      model: undefined,
      effort: undefined,
    });
    expect(send).not.toHaveBeenCalledWith({ type: 'action:resolveStageRequest', requestId: 22, response: 'advance' });
  });

  it('keeps the original approval action when no override is selected', () => {
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const container = renderPage(makeRun({
      pendingStageRequestId: 22,
      pendingStageRequestKind: 'approval',
      pendingStageRequestPrompt: 'Approve implementation?',
    }), send);

    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'advance');
    expect(button).toBeDefined();
    act(() => { button?.click(); });

    expect(send).toHaveBeenCalledWith({ type: 'action:resolveStageRequest', requestId: 22, response: 'advance' });
  });

  it.each([
    ['running', { pipelineStatus: 'running' as const }],
    ['aborting', { pipelineStatus: 'aborting' as const }],
    ['done', { pipelineStatus: 'done' as const }],
    ['paused without pipeline id', { pipelineId: null, pipelineStatus: 'paused' as const }],
  ])('hides the override controls for a non-resumable %s run', (_label, overrides) => {
    const container = renderPage(makeRun(overrides), vi.fn());

    expect(container.querySelector('[aria-label="Resume tool override"]')).toBeNull();
    expect(container.textContent).not.toContain('resume with override');
  });
});

describe('RunDetailPage Live Output ordering', () => {
  it('interleaves tool calls and output lines chronologically even when output timestamps lack a timezone marker', () => {
    const run = makeRun();
    const send = vi.fn<(message: WebSocketClientMessage) => void>();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <RunDetailPage
          state={makeState(run)}
          featureId="feat-1"
          runDetails={{
            1: {
              taskRuns: [],
              breakdown: null,
              sessionStatus: null,
              statusHistory: [],
              toolCalls: [
                {
                  id: 'tool-a',
                  runId: 1,
                  featureId: 'feat-1',
                  tool: 'codex',
                  sequence: 1,
                  phase: 'completed',
                  name: 'shell',
                  arguments: null,
                  output: null,
                  step: null,
                  // Tool call rows already use the fixed ISO-with-Z format.
                  startedAt: '2026-07-16T13:50:37.000Z',
                  completedAt: null,
                  error: null,
                },
              ],
            },
          } as unknown as Parameters<typeof RunDetailPage>[0]['runDetails']}
          linesByRun={{
            // Legacy output rows written before the ISO created_at fix have no
            // timezone marker and must still be treated as UTC, not local time.
            1: [
              { runId: 1, source: 'agent', line: 'before the tool call', createdAt: '2026-07-16 13:50:21' },
              { runId: 1, source: 'agent', line: 'after the tool call', createdAt: '2026-07-16 13:50:52' },
            ],
          }}
          onSubscribeRun={() => () => undefined}
          onBack={() => undefined}
          send={send}
        />,
      );
    });

    const outputTab = Array.from(container.querySelectorAll('button, [role="tab"]')).find((el) => el.textContent === 'Live Output');
    act(() => { (outputTab as HTMLElement)?.click(); });

    const text = container.textContent ?? '';
    const beforeIdx = text.indexOf('before the tool call');
    const toolIdx = text.indexOf('tool:shell');
    const afterIdx = text.indexOf('after the tool call');

    expect(beforeIdx).toBeGreaterThanOrEqual(0);
    expect(toolIdx).toBeGreaterThanOrEqual(0);
    expect(afterIdx).toBeGreaterThanOrEqual(0);
    expect(beforeIdx).toBeLessThan(toolIdx);
    expect(toolIdx).toBeLessThan(afterIdx);
  });
});

describe('RunDetailPage error output', () => {
  it('surfaces a raw stderr error line as a collapsible red tool card even when the run has other tool calls', () => {
    const run = makeRun();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    const errorLine = 'ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines';

    act(() => {
      root.render(
        <RunDetailPage
          state={makeState(run)}
          featureId="feat-1"
          runDetails={{
            1: {
              taskRuns: [],
              breakdown: null,
              sessionStatus: null,
              statusHistory: [],
              // A run almost always has structured tool calls; the error line must
              // still surface even though it has no matching ToolCallRecord.
              toolCalls: [
                {
                  id: 'tool-a',
                  runId: 1,
                  featureId: 'feat-1',
                  tool: 'codex',
                  sequence: 1,
                  phase: 'completed',
                  name: 'shell',
                  arguments: null,
                  output: null,
                  step: null,
                  startedAt: '2026-07-16T13:50:37.000Z',
                  completedAt: null,
                  error: null,
                },
              ],
            },
          } as unknown as Parameters<typeof RunDetailPage>[0]['runDetails']}
          linesByRun={{
            1: [
              { runId: 1, source: 'stderr', level: 'error', line: errorLine, createdAt: '2026-07-16T13:56:06.000Z' },
            ],
          }}
          onSubscribeRun={() => () => undefined}
          onBack={() => undefined}
          send={vi.fn()}
        />,
      );
    });

    const outputTab = Array.from(container.querySelectorAll('button, [role="tab"]')).find((el) => el.textContent === 'Live Output');
    act(() => { (outputTab as HTMLElement)?.click(); });

    // Collapsed by default: the error text lives in the collapsible output panel,
    // not inlined as a truncated one-liner next to the tool badge.
    expect(container.textContent ?? '').not.toContain(errorLine);
    const toggle = Array.from(container.querySelectorAll('div')).find(
      (el) => el.children.length === 0 && el.textContent?.startsWith('▸ show output'),
    );
    expect(toggle).toBeDefined();

    act(() => { (toggle as HTMLElement).click(); });

    expect(container.textContent ?? '').toContain(errorLine);
  });

  it('detects error lines from raw stderr log text even when no `level` was persisted', () => {
    // Rows written before run:output carried a `level` column (or any producer that
    // forgets to tag it) still have the raw "<ts> ERROR ..." log line as `line.line`.
    // The transcript must recognize these from the text itself, not only via `level`.
    const run = makeRun();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    const rawLine = '2026-07-16T13:59:08.225109Z ERROR codex_core::tools::router: error=apply_patch verification failed: invalid hunk at line 44, Expected update';

    act(() => {
      root.render(
        <RunDetailPage
          state={makeState(run)}
          featureId="feat-1"
          runDetails={{
            1: {
              taskRuns: [],
              breakdown: null,
              sessionStatus: null,
              statusHistory: [],
              toolCalls: [
                {
                  id: 'tool-a',
                  runId: 1,
                  featureId: 'feat-1',
                  tool: 'codex',
                  sequence: 1,
                  phase: 'completed',
                  name: 'command_execution',
                  arguments: null,
                  output: null,
                  step: null,
                  startedAt: '2026-07-16T13:58:44.000Z',
                  completedAt: null,
                  error: null,
                },
              ],
            },
          } as unknown as Parameters<typeof RunDetailPage>[0]['runDetails']}
          linesByRun={{
            1: [
              { runId: 1, source: 'stderr', line: rawLine, createdAt: '2026-07-16 13:59:08' },
            ],
          }}
          onSubscribeRun={() => () => undefined}
          onBack={() => undefined}
          send={vi.fn()}
        />,
      );
    });

    const outputTab = Array.from(container.querySelectorAll('button, [role="tab"]')).find((el) => el.textContent === 'Live Output');
    act(() => { (outputTab as HTMLElement)?.click(); });

    expect(container.textContent ?? '').not.toContain(rawLine);
    const toggle = Array.from(container.querySelectorAll('div')).find(
      (el) => el.children.length === 0 && el.textContent?.startsWith('▸ show output'),
    );
    expect(toggle).toBeDefined();

    act(() => { (toggle as HTMLElement).click(); });

    expect(container.textContent ?? '').toContain(rawLine);
  });
});

describe('RunDetailPage complete live output', () => {
  it('keeps full agent, tool-call, and error messages available in the transcript', () => {
    const run = makeRun();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const agentMessage = `agent ${'progress '.repeat(40)}`;
    const command = `command ${'argument '.repeat(40)}`;
    const toolOutput = `tool-output ${'detail '.repeat(40)}`;
    const errorMessage = `ERROR ${'failure detail '.repeat(40)}`;

    act(() => {
      root.render(
        <RunDetailPage
          state={makeState(run)}
          featureId="feat-1"
          runDetails={{
            1: {
              taskRuns: [], breakdown: null, sessionStatus: null, statusHistory: [],
              toolCalls: [
                { id: 'tool-output', runId: 1, featureId: 'feat-1', tool: 'codex', sequence: 1, phase: 'completed', name: 'shell', arguments: { command }, output: toolOutput, step: null, startedAt: '2026-07-16T13:50:37.000Z', completedAt: null, error: null },
                { id: 'tool-error', runId: 1, featureId: 'feat-1', tool: 'codex', sequence: 2, phase: 'failed', name: 'apply_patch', arguments: null, output: null, step: null, startedAt: '2026-07-16T13:50:38.000Z', completedAt: null, error: errorMessage },
              ],
            },
          } as unknown as Parameters<typeof RunDetailPage>[0]['runDetails']}
          linesByRun={{ 1: [{ runId: 1, source: 'agent', line: agentMessage, createdAt: '2026-07-16T13:50:36.000Z' }] }}
          onSubscribeRun={() => () => undefined}
          onBack={() => undefined}
          send={vi.fn()}
        />,
      );
    });

    const outputTab = Array.from(container.querySelectorAll('button, [role="tab"]')).find((el) => el.textContent === 'Live Output');
    act(() => { (outputTab as HTMLElement)?.click(); });

    expect(container.textContent).toContain(agentMessage);
    expect(container.textContent).toContain(command);
    for (const toggle of Array.from(container.querySelectorAll('div')).filter((el) => el.children.length === 0 && el.textContent?.startsWith('▸ show output'))) {
      act(() => { (toggle as HTMLElement).click(); });
    }
    expect(container.textContent).toContain(toolOutput);
    expect(container.textContent).toContain(errorMessage);
  });
});

describe('RunDetailPage mobile close control', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('replaces the header close button with a compact top-right ✕ on mobile', () => {
    window.history.replaceState(null, '', '/?mobile=1');
    const container = renderPage(makeRun(), vi.fn());

    const closeIcon = container.querySelector('[aria-label="Close run detail"]');
    expect(closeIcon).not.toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'close')).toBe(false);
  });

  it('dispatches onBack when the mobile ✕ is clicked', () => {
    window.history.replaceState(null, '', '/?mobile=1');
    const onBack = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(
        <RunDetailPage
          state={makeState(makeRun())}
          featureId="feat-1"
          runDetails={{}}
          linesByRun={{}}
          onSubscribeRun={() => () => undefined}
          onBack={onBack}
          send={vi.fn()}
        />,
      );
    });

    const closeIcon = container.querySelector('[aria-label="Close run detail"]') as HTMLButtonElement;
    act(() => { closeIcon.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the regular close button in the header actions on desktop', () => {
    const container = renderPage(makeRun(), vi.fn());

    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'close')).toBe(true);
    expect(container.querySelector('[aria-label="Close run detail"]')).toBeNull();
  });
});

describe('RunDetailPage Project/repo context', () => {
  function stateWithItemContext(run: RunSummary): MsqWebState {
    return {
      runs: [run],
      projects: [{ projectId: 'project-a', name: 'Project A', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null }],
      featureCatalog: {
        'feat-1': {
          id: 'feat-1',
          title: 'Feature One',
          projectId: 'project-a',
          repoLabel: 'repo-one',
          workflow: { stages: ['implement'], stepGuidance: {} },
        },
      },
      backlogSettings: { stageSkills: {} },
      runtimeConfig: { web: { statusSpinner: false }, tools: [{ id: 'claude' }, { id: 'codex' }, { id: 'opencode' }], notifications: { channels: [] } },
    } as unknown as MsqWebState;
  }

  it('shows the item Project name and repo label in the breadcrumb', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(
        <RunDetailPage
          state={stateWithItemContext(makeRun())}
          featureId="feat-1"
          runDetails={{}}
          linesByRun={{}}
          onSubscribeRun={() => () => undefined}
          onBack={() => undefined}
          send={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Project A · repo-one · feat-1');
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
          <RunDetailPage
            state={stateWithItemContext(makeRun())}
            featureId="feat-1"
            runDetails={{}}
            linesByRun={{}}
            onSubscribeRun={() => () => undefined}
            onBack={onBack}
            send={vi.fn()}
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
          <RunDetailPage
            state={stateWithItemContext(makeRun())}
            featureId="feat-1"
            runDetails={{}}
            linesByRun={{}}
            onSubscribeRun={() => () => undefined}
            onBack={() => undefined}
            send={vi.fn()}
          />
        </ActiveProjectContext.Provider>,
      );
    });

    const closeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'close');
    act(() => { closeButton?.click(); });

    expect(setActiveProject).not.toHaveBeenCalled();
  });
});

describe('RunDetailPage heartbeat display', () => {
  const heartbeatLine = '[msq] opencode running for 47s (stdout 1500B stderr 0B idle 12s) polishing the README';

  function openLiveOutput(container: HTMLElement): void {
    const tab = Array.from(container.querySelectorAll('button, [role="tab"]')).find((el) => el.textContent === 'Live Output');
    act(() => { (tab as HTMLElement)?.click(); });
  }

  it('renders heartbeats as a thinking… style system line while the run is active', () => {
    const container = renderPageWithLines(
      makeRun({ status: 'running', rawStatus: 'running', pipelineStatus: 'running' as never }),
      { 1: [{ runId: 1, source: 'heartbeat', line: heartbeatLine, createdAt: '2026-07-16T13:50:21.000Z' }] },
      vi.fn(),
    );

    openLiveOutput(container);
    // The verbose diagnostic payload should be hidden; the readable suffix surfaces instead.
    expect(container.textContent ?? '').not.toContain('running for 47s');
    expect(container.textContent ?? '').toContain('polishing the README');
  });

  it('collapses a heartbeat with no activity suffix to a thinking… placeholder while running', () => {
    const container = renderPageWithLines(
      makeRun({ status: 'running', rawStatus: 'running', pipelineStatus: 'running' as never }),
      { 1: [{ runId: 1, source: 'heartbeat', line: '[msq] opencode running for 1s (stdout 0B stderr 0B idle 0s)', createdAt: '2026-07-16T13:50:22.000Z' }] },
      vi.fn(),
    );

    openLiveOutput(container);
    expect(container.textContent ?? '').toContain('thinking');
  });

  it('drops heartbeat lines once the run is terminal so they don\'t linger on the Live Output tab', () => {
    for (const terminal of ['done', 'failed', 'aborted', 'blocked'] as const) {
      const container = renderPageWithLines(
        makeRun({ status: terminal, rawStatus: terminal as never, pipelineStatus: 'done' as never }),
        { 1: [
          { runId: 1, source: 'agent', line: 'real agent output', createdAt: '2026-07-16T13:50:21.000Z' },
          { runId: 1, source: 'heartbeat', line: heartbeatLine, createdAt: '2026-07-16T13:50:30.000Z' },
        ] },
        vi.fn(),
      );

      openLiveOutput(container);
      expect(container.textContent ?? '').toContain('real agent output');
      expect(container.textContent ?? '').not.toContain('polishing the README');
      expect(container.textContent ?? '').not.toContain('running for 47s');

      act(() => {
        for (const root of roots) root.unmount();
      });
      roots.length = 0;
      document.body.replaceChildren();
    }
  });
});

describe('RunDetailPage spec tab', () => {
  function makeStateWithSpec(run: RunSummary, description: string | null): MsqWebState {
    return {
      runs: [run],
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
      backlogSettings: { stageSkills: {} },
      runtimeConfig: {
        web: { statusSpinner: false },
        tools: [{ id: 'claude' }, { id: 'codex' }, { id: 'opencode' }],
        notifications: { channels: [] },
      },
    } as unknown as MsqWebState;
  }

  function openSpecTab(container: HTMLElement): void {
    const tab = Array.from(container.querySelectorAll('button, [role="tab"]')).find((el) => el.textContent === 'Feature Spec');
    act(() => { (tab as HTMLElement)?.click(); });
  }

  it('renders the Feature Spec as markdown on the run detail page', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(
        <RunDetailPage
          state={makeStateWithSpec(makeRun(), '# Spec Title\n\n- [ ] todo one\n- [x] todo two')}
          featureId="feat-1"
          runDetails={{}}
          linesByRun={{}}
          onSubscribeRun={() => () => undefined}
          onBack={() => undefined}
          send={vi.fn()}
        />,
      );
    });

    openSpecTab(container);
    const spec = container.querySelector('[data-testid="run-spec-readonly"]');
    expect(spec).not.toBeNull();
    expect(spec?.querySelector('h1')?.textContent).toBe('Spec Title');
    expect(spec?.querySelectorAll('input[type="checkbox"]').length).toBe(2);
    const checkboxes = Array.from(spec?.querySelectorAll('input[type="checkbox"]') ?? []);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('falls back to a clear message when no spec was declared for the run', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(
        <RunDetailPage
          state={makeStateWithSpec(makeRun(), null)}
          featureId="feat-1"
          runDetails={{}}
          linesByRun={{}}
          onSubscribeRun={() => () => undefined}
          onBack={() => undefined}
          send={vi.fn()}
        />,
      );
    });

    openSpecTab(container);
    expect(container.textContent).toContain('No spec declared for feat-1.');
  });
});
