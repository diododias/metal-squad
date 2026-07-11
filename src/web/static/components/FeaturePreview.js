import React, { useState } from 'react';
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

function FeatureConfigSection({ feature, settings }) {
  const retry = feature.retry;
  const retryExplicit = Boolean(retry);
  const resolvedRetry = { ...DEFAULT_RETRY, ...retry };
  const workflow = feature.workflow ?? {
    mode: 'staged',
    stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
    approvals: { channel: 'telegram', autoAdvance: false },
    syncTasksToBacklog: true,
  };
  const skills = feature.skills ?? [];
  const stageSkillEntries = Object.entries(settings.stageSkills ?? {});

  return React.createElement(
    React.Fragment,
    null,
    configGroup('Execução',
      configRow('tool', feature.tool),
      configRow('model', feature.model ?? `${feature.tool} (default)`, !feature.model),
      configRow('effort', feature.effort),
    ),
    configGroup('Workflow',
      configRow('mode', workflow.mode),
      configRow('stages', workflow.stages.join(' → ')),
      configRow('syncTasksToBacklog', String(workflow.syncTasksToBacklog)),
    ),
    configGroup('Aprovações',
      configRow('channel', workflow.approvals.channel),
      configRow('autoAdvance', String(workflow.approvals.autoAdvance)),
    ),
    configGroup('Skills',
      skills.length > 0
        ? skills.map((skill) => React.createElement('div', { key: skill, className: 'skill-item' }, `- ${skill}`))
        : React.createElement('div', { className: 'muted' }, 'Nenhuma skill declarada na feature.'),
      stageSkillEntries.length > 0 &&
        React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'muted' }, 'stageSkills (defaults):'),
          stageSkillEntries.map(([stage, stageSkills]) =>
            React.createElement('div', { key: stage, className: 'muted' }, `  ${stage}: ${stageSkills.join(', ')}`),
          ),
        ),
    ),
    configGroup('Retry',
      configRow('maxAttempts', String(resolvedRetry.maxAttempts), !retryExplicit),
      configRow('backoffMs', String(resolvedRetry.backoffMs), !retryExplicit),
      configRow('onFail', resolvedRetry.onFail, !retryExplicit),
    ),
    settings.budget &&
      configGroup('Budget (backlog)',
        settings.budget.maxTokens !== undefined && configRow('maxTokens', String(settings.budget.maxTokens)),
        settings.budget.perFeatureMaxTokens !== undefined && configRow('perFeatureMaxTokens', String(settings.budget.perFeatureMaxTokens)),
      ),
    configGroup('Arquivos',
      configRow('specFile', feature.specFile ?? 'não declarado', !feature.specFile),
      configRow('context', feature.context && feature.context.length > 0 ? feature.context.join(', ') : 'nenhum', !feature.context?.length),
    ),
  );
}

function OverrideSection({ overrides, onChange, tokenEstimate }) {
  return configGroup(
    'Override pontual (não grava no backlog.yaml)',
    React.createElement(
      'div',
      { className: 'override-fields' },
      React.createElement(
        'label',
        null,
        'tool ',
        React.createElement(
          'select',
          { value: overrides.tool, onChange: (e) => onChange('tool', e.target.value) },
          TOOL_OPTIONS.map((tool) => React.createElement('option', { key: tool, value: tool }, tool)),
        ),
      ),
      React.createElement(
        'label',
        null,
        'model ',
        React.createElement('input', {
          type: 'text',
          value: overrides.model,
          placeholder: `${overrides.tool} (default)`,
          onChange: (e) => onChange('model', e.target.value),
        }),
      ),
      React.createElement(
        'label',
        null,
        'effort ',
        React.createElement(
          'select',
          { value: overrides.effort, onChange: (e) => onChange('effort', e.target.value) },
          EFFORT_OPTIONS.map((effort) => React.createElement('option', { key: effort, value: effort }, effort)),
        ),
      ),
    ),
    tokenEstimate &&
      React.createElement(
        'div',
        { className: 'muted token-estimate' },
        tokenEstimate.sampleSize > 0
          ? `~${formatTokens(tokenEstimate.avgTotalTokens)} avg tokens (median ${formatTokens(tokenEstimate.medianTotalTokens)}, n=${tokenEstimate.sampleSize} completed ${overrides.tool} runs) — model/effort not tracked per run, treat as a rough estimate.`
          : `No completed ${overrides.tool} runs yet to estimate cost from.`,
      ),
  );
}

export function FeaturePreview({
  feature,
  settings,
  runHistory,
  doneFeatureIds,
  tokenEstimatesByTool,
  onStart,
  onClose,
  onOpenRun,
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [overrides, setOverrides] = useState({
    tool: feature.tool,
    model: feature.model ?? '',
    effort: feature.effort,
  });
  const [confirmStart, setConfirmStart] = useState(false);

  const specLines = feature.description ? feature.description.split('\n') : [];
  const declaredTasks = feature.tasks ?? [];
  const dependsOn = feature.dependsOn ?? [];
  const history = runHistory ?? [];
  const previousFailed = history.find((run) => run.status === 'failed' || run.status === 'aborted');
  const unsatisfiedDeps = dependsOn.filter((dep) => !doneFeatureIds?.has(dep));
  const tokenEstimate = tokenEstimatesByTool?.[overrides.tool] ?? null;

  const handleOverrideChange = (key, value) => {
    setOverrides((current) => ({ ...current, [key]: value }));
    setConfirmStart(false);
  };

  const handleStartClick = () => {
    if (unsatisfiedDeps.length > 0 && !confirmStart) {
      setConfirmStart(true);
      return;
    }
    const cleanOverrides = {};
    if (overrides.tool && overrides.tool !== feature.tool) cleanOverrides.tool = overrides.tool;
    if (overrides.model && overrides.model !== (feature.model ?? '')) cleanOverrides.model = overrides.model;
    if (overrides.effort && overrides.effort !== feature.effort) cleanOverrides.effort = overrides.effort;
    onStart(cleanOverrides);
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
          React.createElement(FeatureConfigSection, { feature, settings }),
          React.createElement(OverrideSection, { overrides, onChange: handleOverrideChange, tokenEstimate }),
        );

      case 'tasks':
        return React.createElement(
          DetailSection,
          { title: PREVIEW_SECTION_LABEL.tasks },
          declaredTasks.length > 0
            ? declaredTasks.map((task) =>
                React.createElement(
                  'div',
                  { key: task.id, className: 'muted' },
                  `${BACKLOG_TASK_ICON[task.status] ?? '○'} ${task.id} — ${task.title}`,
                ),
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
        'Use the buttons above to start (with optional overrides) or close · Esc goes back without starting',
      ),
    ),
  );
}
