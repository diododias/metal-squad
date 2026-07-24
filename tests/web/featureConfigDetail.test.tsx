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
      approvals: { channel: 'telegram' },
      autoAdvance: false,
      syncTasksToBacklog: true,
      sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
    },
    }),
    skills: [],
    pendingDependencies: [],
    ...overrides,
  } as FeatureCatalogEntry;
}

const backlogSettings = {
  stageSkills: {},
  toolCapabilities: {
    claude: { model: true, effort: true, thinking: true },
    codex: { model: true, effort: true, thinking: false },
    opencode: { model: true, effort: false, thinking: false },
  },
} as BacklogSettings;

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

function behaviourSaveButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save behaviour');
}

function workflowControl(container: HTMLElement, id: string): HTMLInputElement | HTMLSelectElement {
  return executionControl(container, id);
}

function workflowSaveButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save workflow');
}

function stepControl(container: HTMLElement, id: string): HTMLInputElement {
  const control = container.querySelector(`#${id}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`Missing step control: ${id}`);
  }
  return control;
}

function addStepButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'add step');
}

function removeStepButton(container: HTMLElement, stage: string): HTMLButtonElement {
  const control = container.querySelector(`button[aria-label="Remove ${stage}"]`);
  if (!(control instanceof HTMLButtonElement)) {
    throw new Error(`Missing remove control for step: ${stage}`);
  }
  return control;
}

function moveStepButton(container: HTMLElement, stage: string, direction: 'up' | 'down'): HTMLButtonElement {
  const control = container.querySelector(`button[aria-label="Move ${stage} ${direction}"]`);
  if (!(control instanceof HTMLButtonElement)) {
    throw new Error(`Missing move-${direction} control for step: ${stage}`);
  }
  return control;
}

function stepOrderSaveButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save step order');
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
    act(() => { (executionControl(view.container, 'behaviour-auto-start') as HTMLInputElement).click(); });
    act(() => { behaviourSaveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ autoStart: true });
  });

  it('saves thinking independently from effort and model', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);

    act(() => { (executionControl(view.container, 'execution-thinking') as HTMLInputElement).click(); });
    act(() => { saveButton(view.container)?.click(); });

    expect(onSaveConfig).toHaveBeenCalledWith({ thinking: 'on' });
  });

  it('disables unsupported thinking and keeps supported effort independent', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature({ tool: 'codex' }), onSaveConfig);

    const thinking = executionControl(view.container, 'execution-thinking') as HTMLInputElement;
    expect(thinking.disabled).toBe(true);
    expect(view.container.textContent).toContain('codex does not support thinking; it will be ignored.');

    act(() => { dispatchChange(executionControl(view.container, 'execution-effort'), 'high'); });
    act(() => { saveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ effort: 'high' });
  });

  it('does not leak an unsupported draft field when the selected tool changes', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);

    act(() => { (executionControl(view.container, 'execution-thinking') as HTMLInputElement).click(); });
    act(() => { dispatchChange(executionControl(view.container, 'execution-tool'), 'opencode'); });
    act(() => { saveButton(view.container)?.click(); });

    expect(onSaveConfig).toHaveBeenCalledWith({ tool: 'opencode' });
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
    const workflowScenarios: Array<{ feature?: FeatureCatalogEntry; id: string; value?: string; expected: object }> = [
      { id: 'workflow-mode', value: 'single', expected: { workflow: { mode: 'single' } } },
      { id: 'workflow-sync-tasks', expected: { workflow: { syncTasksToBacklog: false } } },
    ];

    for (const scenario of workflowScenarios) {
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

    // auto-advance is in the Behaviour card and only visible when mode === staged
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig); // mode defaults to staged
    act(() => { (workflowControl(view.container, 'behaviour-auto-advance') as HTMLInputElement).click(); });
    act(() => { behaviourSaveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ workflow: { autoAdvance: true } });
  });

  it('displays the inherited approvals channel as read-only and does not send it in workflow patches', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature({ workflow: { ...makeFeature().workflow, approvals: { channel: 'legacy-channel' as 'telegram' }, autoAdvance: false } });
    const view = mount();
    view.rerender(feature, onSaveConfig);

    // approvals.channel is shown read-only — no editable control with that id
    expect(view.container.textContent).toContain('legacy-channel');
    expect(view.container.querySelector('#workflow-approval-channel')).toBeNull();

    // a workflow change does not include approvals in the patch
    act(() => { dispatchChange(workflowControl(view.container, 'workflow-mode'), 'single'); });
    act(() => { workflowSaveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ workflow: { mode: 'single' } });

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



describe('FeatureConfigDetail steps', () => {
  it('previews adjacent reordering, disables boundary controls, and saves only a changed complete stages permutation', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature({
      workflow: {
        ...makeFeature().workflow,
        stages: ['specify', 'plan', 'implement'],
      },
    });
    const view = mount();
    view.rerender(feature, onSaveConfig);

    expect(moveStepButton(view.container, 'specify', 'up').disabled).toBe(true);
    expect(moveStepButton(view.container, 'implement', 'down').disabled).toBe(true);
    expect(stepOrderSaveButton(view.container)).toBeUndefined();

    act(() => { moveStepButton(view.container, 'plan', 'up').click(); });
    expect(view.container.textContent).toContain('Proposed order: plan → specify → implement');
    expect(onSaveConfig).not.toHaveBeenCalled();

    act(() => { stepOrderSaveButton(view.container)?.click(); });
    expect(onSaveConfig).toHaveBeenCalledWith({ workflow: { stages: ['plan', 'specify', 'implement'] } });
    expect(moveStepButton(view.container, 'plan', 'up').disabled).toBe(true);

    const accepted: FeatureConfigSaveResult = { type: 'featureConfig:saveResult', payload: { featureId: 'feat-1', ok: true } };
    view.rerender(feature, onSaveConfig, accepted);
    view.rerender(makeFeature({
      workflow: { ...feature.workflow, stages: ['plan', 'specify', 'implement'] },
    }), onSaveConfig, accepted);
    expect(stepOrderSaveButton(view.container)).toBeUndefined();
  });

  it('retains a reordered draft and shows actionable feedback when saving fails', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature({
      workflow: {
        ...makeFeature().workflow,
        stages: ['specify', 'plan', 'implement'],
      },
    });
    const view = mount();
    view.rerender(feature, onSaveConfig);

    act(() => { moveStepButton(view.container, 'plan', 'up').click(); });
    act(() => { stepOrderSaveButton(view.container)?.click(); });

    const rejected: FeatureConfigSaveResult = {
      type: 'featureConfig:saveResult',
      payload: { featureId: 'feat-1', ok: false, issues: [{ path: 'workflow.stages', message: 'Keep each step exactly once.' }] },
    };
    view.rerender(feature, onSaveConfig, rejected);

    expect(view.container.textContent).toContain('Proposed order: plan → specify → implement');
    expect(view.container.textContent).toContain('workflow.stages: Keep each step exactly once.');
    expect(stepOrderSaveButton(view.container)).toBeDefined();
  });

  it('adds a step and optional guidance skill in one workflow patch', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature();
    const view = mount();
    view.rerender(feature, onSaveConfig);

    act(() => {
      dispatchChange(stepControl(view.container, 'new-step-name'), ' review ');
      dispatchChange(stepControl(view.container, 'new-step-guidance-skill'), ' review-skill ');
      addStepButton(view.container)?.click();
    });

    expect(onSaveConfig).toHaveBeenCalledWith({
      workflow: {
        stages: ['specify', 'review'],
        stepGuidance: { review: { skills: ['review-skill'] } },
      },
    });

    view.rerender(makeFeature({
      workflow: { ...feature.workflow, stages: ['specify', 'review'], stepGuidance: { review: { skills: ['review-skill'] } } },
    }), onSaveConfig);
    expect(Array.from(view.container.querySelectorAll('button')).some((button) => button.textContent === 'review')).toBe(true);
  });

  it('adds an unguided step without creating step guidance', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);

    act(() => {
      dispatchChange(stepControl(view.container, 'new-step-name'), 'verify');
      addStepButton(view.container)?.click();
    });

    expect(onSaveConfig).toHaveBeenCalledWith({
      workflow: { stages: ['specify', 'verify'], stepGuidance: {} },
    });
  });

  it('rejects blank and duplicate step names with feedback', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);

    act(() => {
      dispatchChange(stepControl(view.container, 'new-step-name'), '   ');
      addStepButton(view.container)?.click();
    });
    expect(view.container.textContent).toContain('Enter a step name.');

    act(() => {
      dispatchChange(stepControl(view.container, 'new-step-name'), 'specify');
      addStepButton(view.container)?.click();
    });
    expect(view.container.textContent).toContain('Step "specify" already exists.');
    expect(onSaveConfig).not.toHaveBeenCalled();
  });

  it('removes one stage with its guidance and isolation in one composed patch', () => {
    const onSaveConfig = vi.fn();
    const feature = makeFeature({
      workflow: {
        ...makeFeature().workflow,
        stages: ['specify', 'implement', 'validate'],
        stepGuidance: {
          specify: { prompt: 'Keep this.' },
          implement: { skills: ['implement-skill'], prompt: 'Remove this.' },
          validate: { skills: ['validate-skill'] },
        },
        sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: ['implement', 'validate'] },
      },
    });
    const view = mount();
    view.rerender(feature, onSaveConfig);

    act(() => { removeStepButton(view.container, 'implement').click(); });

    expect(onSaveConfig).toHaveBeenCalledWith({
      workflow: {
        stages: ['specify', 'validate'],
        stepGuidance: {
          specify: { prompt: 'Keep this.' },
          validate: { skills: ['validate-skill'] },
        },
        sessionPolicy: { alwaysIsolatedStages: ['validate'] },
      },
    });

    const accepted: FeatureConfigSaveResult = { type: 'featureConfig:saveResult', payload: { featureId: 'feat-1', ok: true } };
    view.rerender(feature, onSaveConfig, accepted);
    view.rerender(makeFeature({
      workflow: {
        ...feature.workflow,
        stages: ['specify', 'validate'],
        stepGuidance: { specify: { prompt: 'Keep this.' }, validate: { skills: ['validate-skill'] } },
        sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: ['validate'] },
      },
    }), onSaveConfig, accepted);
    expect(view.container.textContent).toContain('Resolved skills (validate)');
  });

  it('disables the final step removal control without dispatching a patch', () => {
    const onSaveConfig = vi.fn();
    const view = mount();
    view.rerender(makeFeature(), onSaveConfig);

    expect(removeStepButton(view.container, 'specify').disabled).toBe(true);
    expect(view.container.textContent).toContain('A workflow must keep at least one step.');
    expect(onSaveConfig).not.toHaveBeenCalled();
  });
});
