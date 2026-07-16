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
