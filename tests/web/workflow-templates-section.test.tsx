// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowTemplatesSection } from '../../src/web/client/components/WorkflowTemplatesSection.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage, WorkflowTemplateSummary } from '../../src/web/types.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

function builtinTemplate(overrides: Partial<WorkflowTemplateSummary> = {}): WorkflowTemplateSummary {
  return {
    templateId: 'builtin:feature-spec-kit',
    name: 'Feature Spec Kit',
    version: 1,
    revision: 1,
    builtin: true,
    archived: false,
    scopeProjectId: null,
    stageCount: 3,
    ...overrides,
  };
}

function customTemplate(overrides: Partial<WorkflowTemplateSummary> = {}): WorkflowTemplateSummary {
  return {
    templateId: 'tpl-custom-1',
    name: 'Custom Template',
    version: 1,
    revision: 1,
    builtin: false,
    archived: false,
    scopeProjectId: 'proj-1',
    stageCount: 2,
    ...overrides,
  };
}

function baseState(overrides: Partial<MsqWebState> = {}): MsqWebState {
  return {
    workflowTemplates: [],
    workflowTemplateMappings: {},
    ...overrides,
  } as unknown as MsqWebState;
}

function mount(): {
  container: HTMLElement;
  send: ReturnType<typeof vi.fn>;
  rerender: (state: MsqWebState, actionResults?: Record<string, ActionResult>) => void;
} {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const send = vi.fn<(message: WebSocketClientMessage) => void>();

  return {
    container,
    send,
    rerender(state, actionResults = {}) {
      act(() => {
        root.render(
          <WorkflowTemplatesSection state={state} projectId="proj-1" send={send} actionResults={actionResults} />,
        );
      });
    },
  };
}

function actionResult(requestId: string, payload: Record<string, unknown>): ActionResult {
  return { type: 'action:result', payload: { ...payload, requestId } } as unknown as ActionResult;
}

function dispatchChange(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value');
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('WorkflowTemplatesSection list + mapping', () => {
  it('renders builtin as read-only and custom templates with duplicate/archive controls', () => {
    const { container, rerender } = mount();
    rerender(baseState({ workflowTemplates: [builtinTemplate(), customTemplate()] }));

    expect(container.textContent).toContain('Feature Spec Kit');
    expect(container.textContent).toContain('Custom Template');
    expect(container.textContent).toContain('builtin');

    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent);
    // builtin row has no "archive" button, only "duplicate"
    expect(buttons.filter((t) => t === 'archive')).toHaveLength(1);
    expect(buttons.filter((t) => t === 'duplicate')).toHaveLength(2);
  });

  it('shows "using builtin" fallback when a type has no explicit mapping', () => {
    const { container, rerender } = mount();
    rerender(baseState({ workflowTemplates: [customTemplate()], workflowTemplateMappings: {} }));

    expect(container.textContent).toContain('using builtin');
  });

  it('does not show the fallback tag once a type is mapped to a custom template', () => {
    const { container, rerender } = mount();
    rerender(baseState({
      workflowTemplates: [customTemplate()],
      workflowTemplateMappings: { 'proj-1': { feature: 'tpl-custom-1' } },
    }));

    const featureSelect = container.querySelector('select[aria-label="Template for feature"]') as HTMLSelectElement;
    const featureRow = featureSelect.closest('div')!;
    expect(featureRow.textContent).not.toContain('using builtin');
  });

  it('sends action:setTypeTemplate when a mapping select changes', () => {
    const { container, send, rerender } = mount();
    rerender(baseState({ workflowTemplates: [customTemplate()] }));

    const select = container.querySelector('select[aria-label="Template for feature"]') as HTMLSelectElement;
    act(() => {
      select.value = 'tpl-custom-1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action:setTypeTemplate',
      workItemType: 'feature',
      templateId: 'tpl-custom-1',
      projectId: 'proj-1',
    }));
  });
});

describe('WorkflowTemplatesSection CRUD', () => {
  it('creates a template from the name input', () => {
    const { container, send, rerender } = mount();
    rerender(baseState());

    const input = container.querySelector('input[aria-label="new template name"]') as HTMLInputElement;
    act(() => { dispatchChange(input, 'My New Template'); });
    const createButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'create')!;
    act(() => { createButton.click(); });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action:createWorkflowTemplate',
      projectId: 'proj-1',
      name: 'My New Template',
    }));
  });

  it('duplicates a builtin template with a "(copy)" suffixed name', () => {
    const { container, send, rerender } = mount();
    rerender(baseState({ workflowTemplates: [builtinTemplate()] }));

    const duplicateButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'duplicate')!;
    act(() => { duplicateButton.click(); });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action:duplicateWorkflowTemplate',
      templateId: 'builtin:feature-spec-kit',
      projectId: 'proj-1',
      name: 'Feature Spec Kit (copy)',
    }));
  });

  it('archives a custom template', () => {
    const { container, send, rerender } = mount();
    rerender(baseState({ workflowTemplates: [customTemplate()] }));

    const archiveButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'archive')!;
    act(() => { archiveButton.click(); });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action:archiveWorkflowTemplate',
      templateId: 'tpl-custom-1',
    }));
  });

  it('fetches the full definition when a template is opened', () => {
    const { container, send, rerender } = mount();
    rerender(baseState({ workflowTemplates: [customTemplate()] }));

    const openButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Custom Template')!;
    act(() => { openButton.click(); });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action:getWorkflowTemplateDefinition',
      templateId: 'tpl-custom-1',
    }));
    expect(container.textContent).toContain('Loading definition…');
  });
});

describe('WorkflowTemplatesSection editor: diff/version + save gating', () => {
  it('enables "save changes" once a step is added, even though the name is unchanged (regression: previously only name was compared)', () => {
    const { container, send, rerender } = mount();
    const state = baseState({ workflowTemplates: [customTemplate()] });
    rerender(state);

    const openButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Custom Template')!;
    act(() => { openButton.click(); });
    const fetchCall = send.mock.calls.find((c) => (c[0] as { type: string }).type === 'action:getWorkflowTemplateDefinition')!;
    const requestId = (fetchCall[0] as { requestId: string }).requestId;

    rerender(state, {
      [requestId]: actionResult(requestId, {
        ok: true,
        templateId: 'tpl-custom-1',
        definition: { workflow: { stages: ['specify', 'implement'] }, stageSkills: {} },
      }),
    });

    const saveButton = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'save changes') as HTMLButtonElement;
    expect(saveButton().disabled).toBe(true);

    const newStepInput = container.querySelector('input[aria-label="new step name"]') as HTMLInputElement;
    act(() => { dispatchChange(newStepInput, 'validate'); });
    const addStepButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'add step')!;
    act(() => { addStepButton.click(); });

    expect(saveButton().disabled).toBe(false);

    act(() => { saveButton().click(); });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action:updateWorkflowTemplate',
      templateId: 'tpl-custom-1',
      expectedRevision: 1,
      patch: expect.objectContaining({
        definition: { workflow: { stages: ['specify', 'implement', 'validate'] }, stageSkills: {} },
      }),
    }));
  });

  it('shows the current version and "only new Work Items" notice next to save controls', () => {
    const { container, send, rerender } = mount();
    const state = baseState({ workflowTemplates: [customTemplate({ version: 3 })] });
    rerender(state);

    const openButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Custom Template')!;
    act(() => { openButton.click(); });
    const fetchId = (send.mock.calls.find((c) => (c[0] as { type: string }).type === 'action:getWorkflowTemplateDefinition')![0] as { requestId: string }).requestId;
    rerender(state, {
      [fetchId]: actionResult(fetchId, {
        ok: true,
        templateId: 'tpl-custom-1',
        definition: { workflow: { stages: ['specify'] }, stageSkills: {} },
      }),
    });

    expect(container.textContent).toContain('version 3');
    expect(container.textContent).toContain('updating only affects new Work Items');
  });

  it('preserves the draft and surfaces a conflict banner on REVISION_CONFLICT', () => {
    const { container, send, rerender } = mount();
    const state = baseState({ workflowTemplates: [customTemplate()] });
    rerender(state);

    const openButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Custom Template')!;
    act(() => { openButton.click(); });
    const fetchId = (send.mock.calls.find((c) => (c[0] as { type: string }).type === 'action:getWorkflowTemplateDefinition')![0] as { requestId: string }).requestId;
    rerender(state, {
      [fetchId]: actionResult(fetchId, {
        ok: true,
        templateId: 'tpl-custom-1',
        definition: { workflow: { stages: ['specify'] }, stageSkills: {} },
      }),
    });

    const newStepInput = container.querySelector('input[aria-label="new step name"]') as HTMLInputElement;
    act(() => { dispatchChange(newStepInput, 'implement'); });
    const addStepButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'add step')!;
    act(() => { addStepButton.click(); });

    const saveButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'save changes')!;
    act(() => { saveButton.click(); });
    const saveId = (send.mock.calls.find((c) => (c[0] as { type: string }).type === 'action:updateWorkflowTemplate')![0] as { requestId: string }).requestId;

    rerender(state, {
      [fetchId]: actionResult(fetchId, {
        ok: true,
        templateId: 'tpl-custom-1',
        definition: { workflow: { stages: ['specify'] }, stageSkills: {} },
      }),
      [saveId]: actionResult(saveId, { ok: false, error: { code: 'REVISION_CONFLICT', message: 'stale revision' } }),
    });

    expect(container.textContent).toContain('This template changed since you opened it');
    // draft is preserved: the added step is still shown
    expect(container.textContent).toContain('implement');
  });
});

describe('WorkflowTemplatesSection repo × skill validation matrix', () => {
  it('renders a per-repo pass/fail row identifying missing skills, not a generic error', () => {
    const { container, send, rerender } = mount();
    const state = baseState({ workflowTemplates: [customTemplate()] });
    rerender(state);

    const openButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Custom Template')!;
    act(() => { openButton.click(); });
    const fetchId = (send.mock.calls.find((c) => (c[0] as { type: string }).type === 'action:getWorkflowTemplateDefinition')![0] as { requestId: string }).requestId;
    rerender(state, {
      [fetchId]: actionResult(fetchId, {
        ok: true,
        templateId: 'tpl-custom-1',
        definition: { workflow: { stages: ['specify'] }, stageSkills: { specify: ['builtin:spec-kit'] } },
      }),
    });

    const validateButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'validate against active repos')!;
    act(() => { validateButton.click(); });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'action:validateWorkflowTemplate', projectId: 'proj-1' }));
    const validateId = (send.mock.calls.find((c) => (c[0] as { type: string }).type === 'action:validateWorkflowTemplate')![0] as { requestId: string }).requestId;

    rerender(state, {
      [fetchId]: actionResult(fetchId, {
        ok: true,
        templateId: 'tpl-custom-1',
        definition: { workflow: { stages: ['specify'] }, stageSkills: { specify: ['builtin:spec-kit'] } },
      }),
      [validateId]: actionResult(validateId, {
        ok: true,
        valid: false,
        matrix: [
          { repoId: 'repo-1', repoLabel: 'repo-one', missing: [] },
          { repoId: 'repo-2', repoLabel: 'repo-two', missing: ['builtin:spec-kit'] },
        ],
      }),
    });

    expect(container.textContent).toContain('repo-one');
    expect(container.textContent).toContain('repo-two');
    expect(container.textContent).toContain('missing: builtin:spec-kit');
    expect(container.textContent).not.toMatch(/generic error/i);
  });
});
