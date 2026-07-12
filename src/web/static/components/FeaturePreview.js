import React, { useEffect, useState } from 'react';
import { TabBar, DetailSection } from './RunDetail.js';
import { STATUS_ICON, formatTokens } from '../lib/format.js';

const BACKLOG_TASK_ICON = {
  todo: '○',
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '!',
};

const DEFAULT_RETRY = {
  maxAttempts: 1,
  backoffMs: 5000,
  onFail: 'stop',
};

const DEFAULT_WORKFLOW = {
  mode: 'staged',
  stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
  approvals: { channel: 'telegram', autoAdvance: false },
  syncTasksToBacklog: true,
  sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
};

const PREVIEW_SECTION_ORDER = ['spec', 'config', 'tasks', 'previous', 'dependencies'];
const PREVIEW_SECTION_LABEL = {
  spec: 'Feature Spec',
  config: 'Feature Config',
  tasks: 'Tasks',
  previous: 'Previous Attempts',
  dependencies: 'Dependencies',
};

const TOOL_OPTIONS = ['claude', 'codex', 'opencode'];
const EFFORT_OPTIONS = ['low', 'medium', 'high'];
const WORKFLOW_MODE_OPTIONS = ['single', 'staged'];
const ON_FAIL_OPTIONS = ['stop', 'continue', 'gate'];
const TASK_STATUS_OPTIONS = ['todo', 'running', 'done', 'failed', 'blocked'];

function configGroup(title, ...children) {
  return React.createElement(
    'div',
    { className: 'config-group' },
    React.createElement('h4', null, title),
    ...children,
  );
}

function configRow(label, value, muted = false) {
  return React.createElement('div', { className: muted ? 'muted' : '' }, `${label}: ${value}`);
}

/** Add-on-enter, remove-on-click chip editor for array fields (skills,
 * workflow.stages, dependsOn) — shared between the feature config form and
 * the per-task edit rows. */
function ChipListEditor({ items, onChange, placeholder, listId, suggestions }) {
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    const value = draft.trim();
    setDraft('');
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
  };

  return React.createElement(
    'div',
    { className: 'chip-list-editor' },
    React.createElement(
      'div',
      { className: 'chip-list' },
      items.map((item) =>
        React.createElement(
          'span',
          { key: item, className: 'chip' },
          item,
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'chip-remove',
              'aria-label': `remove ${item}`,
              onClick: () => onChange(items.filter((existing) => existing !== item)),
            },
            '×',
          ),
        ),
      ),
    ),
    React.createElement('input', {
      type: 'text',
      value: draft,
      placeholder: placeholder ?? 'add and press enter',
      list: listId,
      onChange: (e) => setDraft(e.target.value),
      onKeyDown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitDraft();
        }
      },
      onBlur: commitDraft,
    }),
    listId && suggestions && suggestions.length > 0
      ? React.createElement(
          'datalist',
          { id: listId },
          suggestions.map((s) => React.createElement('option', { key: s, value: s })),
        )
      : null,
  );
}

function buildFeatureFormState(feature) {
  const workflow = feature.workflow ?? DEFAULT_WORKFLOW;
  const resolvedRetry = { ...DEFAULT_RETRY, ...feature.retry };
  return {
    tool: feature.tool,
    model: feature.model ?? '',
    effort: feature.effort,
    maxTokens: feature.maxTokens !== undefined ? String(feature.maxTokens) : '',
    skills: feature.skills ?? [],
    workflowMode: workflow.mode,
    workflowStages: workflow.stages,
    syncTasksToBacklog: workflow.syncTasksToBacklog,
    autoAdvance: workflow.approvals?.autoAdvance ?? false,
    retryMaxAttempts: String(resolvedRetry.maxAttempts),
    retryBackoffMs: String(resolvedRetry.backoffMs),
    retryOnFail: resolvedRetry.onFail,
  };
}

function buildFeatureConfigPatch(form, feature) {
  const workflow = feature.workflow ?? DEFAULT_WORKFLOW;
  const resolvedRetry = { ...DEFAULT_RETRY, ...feature.retry };
  const patch = {};

  if (form.tool !== feature.tool) patch.tool = form.tool;
  if (form.model.trim() && form.model.trim() !== (feature.model ?? '')) patch.model = form.model.trim();
  if (form.effort !== feature.effort) patch.effort = form.effort;

  const maxTokensCurrent = feature.maxTokens !== undefined ? String(feature.maxTokens) : '';
  if (form.maxTokens.trim() !== maxTokensCurrent) {
    const parsed = Number(form.maxTokens.trim());
    if (form.maxTokens.trim() && Number.isFinite(parsed) && parsed > 0) patch.maxTokens = parsed;
  }

  if (JSON.stringify(form.skills) !== JSON.stringify(feature.skills ?? [])) patch.skills = form.skills;

  const workflowPatch = {};
  if (form.workflowMode !== workflow.mode) workflowPatch.mode = form.workflowMode;
  if (JSON.stringify(form.workflowStages) !== JSON.stringify(workflow.stages)) workflowPatch.stages = form.workflowStages;
  if (form.syncTasksToBacklog !== workflow.syncTasksToBacklog) workflowPatch.syncTasksToBacklog = form.syncTasksToBacklog;
  if (form.autoAdvance !== (workflow.approvals?.autoAdvance ?? false)) {
    workflowPatch.approvals = { autoAdvance: form.autoAdvance };
  }
  if (Object.keys(workflowPatch).length > 0) patch.workflow = workflowPatch;

  const retryPatch = {};
  if (Number(form.retryMaxAttempts) !== resolvedRetry.maxAttempts) retryPatch.maxAttempts = Number(form.retryMaxAttempts);
  if (Number(form.retryBackoffMs) !== resolvedRetry.backoffMs) retryPatch.backoffMs = Number(form.retryBackoffMs);
  if (form.retryOnFail !== resolvedRetry.onFail) retryPatch.onFail = form.retryOnFail;
  if (Object.keys(retryPatch).length > 0) patch.retry = retryPatch;

  return patch;
}

function FeatureConfigForm({ feature, settings, onSaveConfig }) {
  const [form, setForm] = useState(() => buildFeatureFormState(feature));

  // F36: once a save round-trips through state:full, `feature` reflects the
  // persisted values — resync the form so it doesn't drift back to a stale
  // pre-save snapshot.
  useEffect(() => {
    setForm(buildFeatureFormState(feature));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.id, JSON.stringify(feature)]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const stageSkillEntries = Object.entries(settings.stageSkills ?? {});

  const handleSave = () => {
    const patch = buildFeatureConfigPatch(form, feature);
    if (Object.keys(patch).length === 0) return;
    onSaveConfig(patch);
  };

  return React.createElement(
    React.Fragment,
    null,
    configGroup(
      'Execução',
      React.createElement(
        'div',
        { className: 'config-form-row' },
        React.createElement(
          'label',
          null,
          'tool ',
          React.createElement(
            'select',
            { value: form.tool, onChange: (e) => set('tool')(e.target.value) },
            TOOL_OPTIONS.map((tool) => React.createElement('option', { key: tool, value: tool }, tool)),
          ),
        ),
        React.createElement(
          'label',
          null,
          'model ',
          React.createElement('input', {
            type: 'text',
            value: form.model,
            placeholder: `${form.tool} (default)`,
            onChange: (e) => set('model')(e.target.value),
          }),
        ),
        React.createElement(
          'label',
          null,
          'effort ',
          React.createElement(
            'select',
            { value: form.effort, onChange: (e) => set('effort')(e.target.value) },
            EFFORT_OPTIONS.map((effort) => React.createElement('option', { key: effort, value: effort }, effort)),
          ),
        ),
      ),
    ),
    configGroup(
      'Budget',
      React.createElement(
        'label',
        null,
        'maxTokens (esta feature) ',
        React.createElement('input', {
          type: 'number',
          min: 1,
          value: form.maxTokens,
          placeholder: settings.budget?.perFeatureMaxTokens
            ? `default: ${settings.budget.perFeatureMaxTokens}`
            : 'sem limite global',
          onChange: (e) => set('maxTokens')(e.target.value),
        }),
      ),
      settings.budget?.perFeatureMaxTokens !== undefined &&
        configRow('perFeatureMaxTokens (backlog default)', String(settings.budget.perFeatureMaxTokens), true),
    ),
    configGroup(
      'Workflow',
      React.createElement(
        'div',
        { className: 'config-form-row' },
        React.createElement(
          'label',
          null,
          'mode ',
          React.createElement(
            'select',
            { value: form.workflowMode, onChange: (e) => set('workflowMode')(e.target.value) },
            WORKFLOW_MODE_OPTIONS.map((mode) => React.createElement('option', { key: mode, value: mode }, mode)),
          ),
        ),
        React.createElement(
          'label',
          { className: 'checkbox-label' },
          React.createElement('input', {
            type: 'checkbox',
            checked: form.syncTasksToBacklog,
            onChange: (e) => set('syncTasksToBacklog')(e.target.checked),
          }),
          ' syncTasksToBacklog',
        ),
      ),
      React.createElement('div', { className: 'muted' }, 'stages'),
      React.createElement(ChipListEditor, {
        items: form.workflowStages,
        onChange: set('workflowStages'),
        placeholder: 'add stage and press enter',
      }),
    ),
    configGroup(
      'Session policy',
      configRow('mode', workflow.sessionPolicy.mode),
      configRow(
        'alwaysIsolatedStages',
        workflow.sessionPolicy.alwaysIsolatedStages.length > 0
          ? workflow.sessionPolicy.alwaysIsolatedStages.join(', ')
          : 'none',
        workflow.sessionPolicy.alwaysIsolatedStages.length === 0,
      ),
    ),
    configGroup(
      'Aprovações',
      configRow('channel', feature.workflow?.approvals?.channel ?? 'telegram', true),
      React.createElement(
        'label',
        { className: 'checkbox-label' },
        React.createElement('input', {
          type: 'checkbox',
          checked: form.autoAdvance,
          onChange: (e) => set('autoAdvance')(e.target.checked),
        }),
        ' autoAdvance',
      ),
    ),
    configGroup(
      'Skills',
      React.createElement(ChipListEditor, {
        items: form.skills,
        onChange: set('skills'),
        placeholder: 'add skill and press enter',
      }),
      stageSkillEntries.length > 0 &&
        React.createElement(
          React.Fragment,
          null,
          React.createElement('div', { className: 'muted' }, 'stageSkills (defaults):'),
          stageSkillEntries.map(([stage, stageSkills]) =>
            React.createElement('div', { key: stage, className: 'muted' }, `  ${stage}: ${stageSkills.join(', ')}`),
          ),
        ),
    ),
    configGroup(
      'Retry',
      React.createElement(
        'div',
        { className: 'config-form-row' },
        React.createElement(
          'label',
          null,
          'maxAttempts ',
          React.createElement('input', {
            type: 'number',
            min: 1,
            max: 10,
            value: form.retryMaxAttempts,
            onChange: (e) => set('retryMaxAttempts')(e.target.value),
          }),
        ),
        React.createElement(
          'label',
          null,
          'backoffMs ',
          React.createElement('input', {
            type: 'number',
            min: 0,
            value: form.retryBackoffMs,
            onChange: (e) => set('retryBackoffMs')(e.target.value),
          }),
        ),
        React.createElement(
          'label',
          null,
          'onFail ',
          React.createElement(
            'select',
            { value: form.retryOnFail, onChange: (e) => set('retryOnFail')(e.target.value) },
            ON_FAIL_OPTIONS.map((onFail) => React.createElement('option', { key: onFail, value: onFail }, onFail)),
          ),
        ),
      ),
    ),
    configGroup(
      'Arquivos',
      configRow('specFile', feature.specFile ?? 'não declarado', !feature.specFile),
      configRow('context', feature.context && feature.context.length > 0 ? feature.context.join(', ') : 'nenhum', !feature.context?.length),
    ),
    React.createElement(
      'div',
      { className: 'config-actions' },
      React.createElement('button', { className: 'primary', onClick: handleSave }, 'save config'),
    ),
  );
}

function buildTaskFormState(task) {
  return {
    title: task.title,
    status: task.status,
    skills: task.skills ?? [],
    dependsOn: task.dependsOn ?? [],
  };
}

function buildTaskConfigPatch(form, task) {
  const patch = {};
  if (form.title.trim() && form.title.trim() !== task.title) patch.title = form.title.trim();
  if (form.status !== task.status) patch.status = form.status;
  if (JSON.stringify(form.skills) !== JSON.stringify(task.skills ?? [])) patch.skills = form.skills;
  if (JSON.stringify(form.dependsOn) !== JSON.stringify(task.dependsOn ?? [])) patch.dependsOn = form.dependsOn;
  return patch;
}

function TaskEditRow({ task, otherTaskIds, onSaveTaskConfig }) {
  const [form, setForm] = useState(() => buildTaskFormState(task));

  useEffect(() => {
    setForm(buildTaskFormState(task));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, JSON.stringify(task)]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSave = () => {
    const patch = buildTaskConfigPatch(form, task);
    if (Object.keys(patch).length === 0) return;
    onSaveTaskConfig(task.id, patch);
  };

  return React.createElement(
    'div',
    { className: 'task-edit-row' },
    React.createElement(
      'div',
      { className: 'task-edit-header' },
      React.createElement('span', { className: 'muted' }, `${BACKLOG_TASK_ICON[task.status] ?? '○'} ${task.id}`),
    ),
    React.createElement(
      'div',
      { className: 'config-form-row' },
      React.createElement(
        'label',
        null,
        'title ',
        React.createElement('input', {
          type: 'text',
          value: form.title,
          onChange: (e) => set('title')(e.target.value),
        }),
      ),
      React.createElement(
        'label',
        null,
        'status ',
        React.createElement(
          'select',
          { value: form.status, onChange: (e) => set('status')(e.target.value) },
          TASK_STATUS_OPTIONS.map((status) => React.createElement('option', { key: status, value: status }, status)),
        ),
      ),
    ),
    React.createElement('div', { className: 'muted' }, 'skills'),
    React.createElement(ChipListEditor, {
      items: form.skills,
      onChange: set('skills'),
      placeholder: 'add skill and press enter',
    }),
    React.createElement('div', { className: 'muted' }, 'dependsOn'),
    React.createElement(ChipListEditor, {
      items: form.dependsOn,
      onChange: set('dependsOn'),
      placeholder: 'add task id and press enter',
      listId: `task-depends-on-${task.id}`,
      suggestions: otherTaskIds,
    }),
    React.createElement(
      'div',
      { className: 'config-actions' },
      React.createElement('button', { className: 'primary', onClick: handleSave }, 'save task'),
    ),
  );
}

export function FeaturePreview({
  feature,
  settings,
  runHistory,
  doneFeatureIds,
  onStart,
  onSaveConfig,
  onSaveTaskConfig,
  onClose,
  onOpenRun,
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [confirmStart, setConfirmStart] = useState(false);

  const specLines = feature.description ? feature.description.split('\n') : [];
  const declaredTasks = feature.tasks ?? [];
  const dependsOn = feature.dependsOn ?? [];
  const history = runHistory ?? [];
  const previousFailed = history.find((run) => run.status === 'failed' || run.status === 'aborted');
  const unsatisfiedDeps = dependsOn.filter((dep) => !doneFeatureIds?.has(dep));

  const handleStartClick = () => {
    if (unsatisfiedDeps.length > 0 && !confirmStart) {
      setConfirmStart(true);
      return;
    }
    onStart();
  };

  function renderSection(sectionId) {
    switch (sectionId) {
      case 'spec':
        return React.createElement(
          DetailSection,
          { title: PREVIEW_SECTION_LABEL.spec },
          specLines.length > 0
            ? specLines.map((line, index) =>
                React.createElement('div', { key: index, className: 'muted spec-line' }, line || ' '),
              )
            : React.createElement('div', { className: 'muted' }, `No spec or specFile declared for ${feature.id} in the backlog.`),
        );

      case 'config':
        return React.createElement(
          DetailSection,
          { title: PREVIEW_SECTION_LABEL.config },
          React.createElement(FeatureConfigForm, { feature, settings, onSaveConfig }),
        );

      case 'tasks':
        return React.createElement(
          DetailSection,
          { title: PREVIEW_SECTION_LABEL.tasks },
          declaredTasks.length > 0
            ? declaredTasks.map((task) =>
                React.createElement(TaskEditRow, {
                  key: task.id,
                  task,
                  otherTaskIds: declaredTasks.map((t) => t.id).filter((id) => id !== task.id),
                  onSaveTaskConfig,
                }),
              )
            : React.createElement('div', { className: 'muted' }, `No task breakdown declared for ${feature.id} in the backlog.`),
        );

      case 'previous':
        return React.createElement(
          DetailSection,
          { title: PREVIEW_SECTION_LABEL.previous },
          history.length === 0
            ? React.createElement('div', { className: 'muted' }, `No previous attempts recorded for ${feature.id}.`)
            : history.map((run) =>
                React.createElement(
                  'div',
                  { key: run.runId, className: 'muted previous-attempt-row' },
                  `${STATUS_ICON[run.status] ?? '·'} run #${run.runId} — ${run.status} — ${formatTokens(run.totalTokens)} tokens`,
                  React.createElement(
                    'button',
                    { className: 'link-button', onClick: () => onOpenRun(run.runId) },
                    'view',
                  ),
                ),
              ),
        );

      case 'dependencies':
        return React.createElement(
          DetailSection,
          { title: PREVIEW_SECTION_LABEL.dependencies },
          dependsOn.length === 0
            ? React.createElement('div', { className: 'muted' }, 'No declared dependencies.')
            : dependsOn.map((dep) => {
                const isDone = doneFeatureIds?.has(dep);
                return React.createElement(
                  'div',
                  { key: dep, className: `dependency-chip ${isDone ? 'done' : 'not-done'}` },
                  isDone ? `✓ ${dep} done` : `✗ ${dep} not done`,
                );
              }),
        );

      default:
        return null;
    }
  }

  return React.createElement(
    'div',
    { className: 'run-detail-overlay' },
    React.createElement(
      'div',
      { className: 'run-detail feature-preview' },
      React.createElement(
        'header',
        { className: 'run-detail-header' },
        React.createElement(
          'div',
          null,
          React.createElement('h2', null, feature.title),
          React.createElement('div', { className: 'muted' }, `${feature.id} — not started yet`),
        ),
        React.createElement(
          'div',
          { className: 'run-detail-actions' },
          React.createElement('button', { className: 'primary', onClick: handleStartClick }, 'start feature'),
          React.createElement('button', { onClick: onClose }, 'close'),
        ),
      ),
      previousFailed &&
        React.createElement(
          'div',
          { className: 'run-detail-blocked-actions' },
          React.createElement(
            'span',
            null,
            `Previous attempt failed at ${previousFailed.stage ?? 'unknown stage'} — `,
          ),
          React.createElement(
            'button',
            { className: 'link-button', onClick: () => onOpenRun(previousFailed.runId) },
            `view run #${previousFailed.runId}`,
          ),
        ),
      confirmStart &&
        React.createElement(
          'div',
          { className: 'run-detail-blocked-actions' },
          React.createElement(
            'span',
            null,
            `${unsatisfiedDeps.join(', ')} not done yet — start anyway?`,
          ),
          React.createElement('button', { className: 'primary', onClick: handleStartClick }, 'start anyway'),
          React.createElement('button', { onClick: () => setConfirmStart(false) }, 'cancel'),
        ),
      React.createElement(TabBar, {
        sections: PREVIEW_SECTION_ORDER,
        activeTab,
        labels: PREVIEW_SECTION_LABEL,
        onSelect: setActiveTab,
      }),
      React.createElement(
        'div',
        { className: 'run-detail-body' },
        renderSection(PREVIEW_SECTION_ORDER[activeTab]),
      ),
      React.createElement(
        'footer',
        { className: 'run-detail-footer' },
        'Use the buttons above to start a feature, save config/task edits, or close · Esc goes back without starting',
      ),
    ),
  );
}
