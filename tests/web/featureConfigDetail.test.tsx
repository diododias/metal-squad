// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeatureSchema } from '../../src/core/backlog/schema.js';
import type { BacklogSettings, FeatureCatalogEntry } from '../../src/ui/catalog.js';
import { FeatureConfigDetail } from '../../src/web/client/components/FeatureConfigDetail.js';
import type { FeatureConfigSaveResult } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];

function makeFeature(overrides: Partial<FeatureCatalogEntry> = {}): FeatureCatalogEntry {
  return {
    ...FeatureSchema.parse({
    id: 'feat-1',
    title: 'Feature One',
    tool: 'claude',
    model: 'sonnet',
    effort: 'medium',
    maxTokens: 4000,
    autoStart: false,
    dependsOn: [],
    tasks: [],
    workflow: {
      mode: 'staged',
      stages: ['specify'],
      approvals: { channel: 'telegram', autoAdvance: false },
      syncTasksToBacklog: true,
      sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
    },
    }),
    skills: [],
    pendingDependencies: [],
    ...overrides,
  } as FeatureCatalogEntry;
}

const backlogSettings = { stageSkills: {} } as BacklogSettings;

function mount(): { container: HTMLElement; rerender: (feature: FeatureCatalogEntry, onSaveConfig: ReturnType<typeof vi.fn>, workflowSaveResult?: FeatureConfigSaveResult) => void } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  return {
    container,
    rerender(feature, onSaveConfig, workflowSaveResult) {
      act(() => {
        root.render(<FeatureConfigDetail feature={feature} backlogSettings={backlogSettings} onSaveConfig={onSaveConfig} workflowSaveResult={workflowSaveResult} />);
      });
    },
  };
}

function dispatchChange(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value');
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function executionControl(container: HTMLElement, id: string): HTMLInputElement | HTMLSelectElement {
  const control = container.querySelector(`#${id}`);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
    throw new Error(`Missing execution control: ${id}`);
  }
  return control;
}

function saveButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save execution');
}

function workflowControl(container: HTMLElement, id: string): HTMLInputElement | HTMLSelectElement {
  return executionControl(container, id);
}

function workflowSaveButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save workflow');
}

afterEach(() => {
  act(() => {
    roots.forEach((root) => { root.unmount(); });
  });
  roots = [];
  document.body.replaceChildren();
});

describe('FeatureConfigDetail execution card', () => {
  it('saves only changed execution values and adopts the refreshed saved baseline', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature();
    const view = mount();
    view.rerender(feature, onSaveConfig);

    act(() => { dispatchChange(executionControl(view.container, 'execution-effort'), 'high'); });
    expect(view.container.textContent).toContain('modified');

    act(() => { saveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ effort: 'high' });

    view.rerender(makeFeature({ effort: 'high' }), onSaveConfig);
    expect(view.container.textContent).not.toContain('modified');
    expect((executionControl(view.container, 'execution-effort') as HTMLSelectElement).value).toBe('high');
  });

  it('builds sparse patches for the remaining individual execution fields', () => {
    const scenarios: Array<{ id: string; value: string; expected: Record<string, string | number> }> = [
      { id: 'execution-tool', value: 'codex', expected: { tool: 'codex' } },
      { id: 'execution-model', value: 'new-model', expected: { model: 'new-model' } },
      { id: 'execution-max-tokens', value: '5000', expected: { maxTokens: 5000 } },
    ];

    for (const scenario of scenarios) {
      const onSaveConfig = vi.fn();
      const view = mount();
      view.rerender(makeFeature(), onSaveConfig);
      act(() => { dispatchChange(executionControl(view.container, scenario.id), scenario.value); });
      act(() => { saveButton(view.container)?.click(); });
      expect(onSaveConfig).toHaveBeenCalledWith(scenario.expected);
    }

    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);
    act(() => { (executionControl(view.container, 'execution-auto-start') as HTMLInputElement).click(); });
    act(() => { saveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ autoStart: true });
  });

  it('clears per-field pending state when a value is restored and emits no empty patch', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);

    act(() => { dispatchChange(executionControl(view.container, 'execution-tool'), 'codex'); });
    expect(view.container.textContent).toContain('modified');
    expect(saveButton(view.container)).toBeDefined();

    act(() => { dispatchChange(executionControl(view.container, 'execution-tool'), 'claude'); });
    expect(view.container.textContent).not.toContain('modified');
    expect(saveButton(view.container)).toBeUndefined();
    expect(onSaveConfig).not.toHaveBeenCalled();
  });

  it('keeps invalid token drafts visible and blocks dispatch until corrected', () => {
    for (const value of ['', 'not-a-number', '1.5', '-1']) {
      const onSaveConfig = vi.fn();
      const view = mount();
      view.rerender(makeFeature(), onSaveConfig);

      act(() => { dispatchChange(executionControl(view.container, 'execution-max-tokens'), value); });
      expect(view.container.textContent).toContain('Enter a positive whole number for maxTokens.');
      expect(saveButton(view.container)).toBeUndefined();
      expect(onSaveConfig).not.toHaveBeenCalled();
    }
  });

  it('keeps an unavailable saved tool understandable and blocks saving until replaced', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature({ tool: 'legacy-tool' as FeatureCatalogEntry['tool'] }), onSaveConfig);

    expect(view.container.textContent).toContain('legacy-tool (unavailable)');
    act(() => { dispatchChange(executionControl(view.container, 'execution-model'), 'new-model'); });
    expect(view.container.textContent).toContain('Select an available tool before saving execution settings.');
    expect(saveButton(view.container)).toBeUndefined();
    expect(onSaveConfig).not.toHaveBeenCalled();
  });
});

describe('FeatureConfigDetail workflow card', () => {
  it('builds sparse patches for every editable workflow value', () => {
    const scenarios: Array<{ feature?: FeatureCatalogEntry; id: string; value?: string; expected: object }> = [
      { id: 'workflow-mode', value: 'single', expected: { workflow: { mode: 'single' } } },
      { id: 'workflow-sync-tasks', expected: { workflow: { syncTasksToBacklog: false } } },
      { id: 'workflow-auto-advance', expected: { workflow: { approvals: { autoAdvance: true } } } },
      {
        feature: makeFeature({ workflow: { ...makeFeature().workflow, approvals: { channel: 'legacy-channel' as 'telegram', autoAdvance: false } } }),
        id: 'workflow-approval-channel',
        value: 'telegram',
        expected: { workflow: { approvals: { channel: 'telegram' } } },
      },
    ];

    for (const scenario of scenarios) {
      const onSaveConfig = vi.fn();
      const view = mount();
      view.rerender(scenario.feature ?? makeFeature(), onSaveConfig);
      act(() => {
        const control = workflowControl(view.container, scenario.id);
        if (scenario.value !== undefined) dispatchChange(control, scenario.value);
        else (control as HTMLInputElement).click();
      });
      act(() => { workflowSaveButton(view.container)?.click(); });
      expect(onSaveConfig).toHaveBeenCalledWith(scenario.expected);
    }
  });

  it('keeps an unavailable approval destination and rejected draft visible for correction', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature({ workflow: { ...makeFeature().workflow, approvals: { channel: 'legacy-channel' as 'telegram', autoAdvance: false } } });
    const view = mount();
    view.rerender(feature, onSaveConfig);

    expect(view.container.textContent).toContain('legacy-channel (unavailable)');
    act(() => { dispatchChange(workflowControl(view.container, 'workflow-mode'), 'single'); });
    expect(view.container.textContent).toContain('Choose an available approval destination before saving.');
    expect(workflowSaveButton(view.container)).toBeUndefined();

    act(() => { dispatchChange(workflowControl(view.container, 'workflow-approval-channel'), 'telegram'); });
    act(() => { workflowSaveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({
      workflow: { mode: 'single', approvals: { channel: 'telegram' } },
    });

    view.rerender(feature, onSaveConfig, {
      type: 'featureConfig:saveResult',
      payload: { featureId: 'feat-1', ok: false, issues: [{ path: 'workflow.mode', message: 'Mode cannot be saved yet.' }] },
    });
    expect(view.container.textContent).toContain('Mode cannot be saved yet.');
    expect((workflowControl(view.container, 'workflow-mode') as HTMLSelectElement).value).toBe('single');
  });

  it('ignores a prior rejected result while a corrected retry is in flight', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature();
    const rejected: FeatureConfigSaveResult = {
      type: 'featureConfig:saveResult',
      payload: { featureId: 'feat-1', ok: false, issues: [{ path: 'workflow.mode', message: 'Choose a supported mode.' }] },
    };
    const retryRejected: FeatureConfigSaveResult = {
      type: 'featureConfig:saveResult',
      payload: { featureId: 'feat-1', ok: false, issues: [{ path: 'workflow.syncTasksToBacklog', message: 'Retry response.' }] },
    };
    const view = mount();
    view.rerender(feature, onSaveConfig);

    act(() => { dispatchChange(workflowControl(view.container, 'workflow-mode'), 'single'); });
    act(() => { workflowSaveButton(view.container)?.click(); });
    view.rerender(feature, onSaveConfig, rejected);

    act(() => { (workflowControl(view.container, 'workflow-sync-tasks') as HTMLInputElement).click(); });
    act(() => { workflowSaveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenLastCalledWith({
      workflow: { mode: 'single', syncTasksToBacklog: false },
    });
    expect(view.container.textContent).not.toContain('Choose a supported mode.');

    view.rerender(feature, onSaveConfig, retryRejected);
    expect(view.container.textContent).toContain('Retry response.');
  });

  it('resets the workflow baseline only after the accepted save receives refreshed state', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature();
    const accepted: FeatureConfigSaveResult = { type: 'featureConfig:saveResult', payload: { featureId: 'feat-1', ok: true } };
    const view = mount();
    view.rerender(feature, onSaveConfig);

    act(() => { dispatchChange(workflowControl(view.container, 'workflow-mode'), 'single'); });
    act(() => { workflowSaveButton(view.container)?.click(); });
    view.rerender(feature, onSaveConfig, accepted);
    expect(view.container.textContent).toContain('modified');

    view.rerender(makeFeature({ workflow: { ...feature.workflow, mode: 'single' } }), onSaveConfig, accepted);
    expect(view.container.textContent).not.toContain('modified');
    expect((workflowControl(view.container, 'workflow-mode') as HTMLSelectElement).value).toBe('single');
  });

  it('never sends stages, step guidance, or session policy for a mode-only save', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);
    act(() => { dispatchChange(workflowControl(view.container, 'workflow-mode'), 'single'); });
    act(() => { workflowSaveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ workflow: { mode: 'single' } });
  });
});
