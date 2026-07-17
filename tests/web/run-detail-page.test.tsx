// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunDetailPage } from '../../src/web/client/pages/RunDetailPage.js';
import type { MsqWebState, WebSocketClientMessage } from '../../src/web/types.js';
import type { RunSummary } from '../../src/db/repo.js';

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
        linesByRun={{}}
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
