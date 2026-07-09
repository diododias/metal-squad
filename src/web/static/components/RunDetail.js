import React from 'react';
import {
  STATUS_ICON,
  formatElapsed,
  formatTokens,
  formatPercent,
  formatDurationMs,
  formatHeartbeatLine,
  getRunStatusLabel,
  getRunStageLabel,
  truncateText,
} from '../lib/format.js';
import { summarizeTaskRuns } from '../lib/workflow.js';

const DETAIL_SECTION_ORDER = ['summary', 'spec', 'workflow', 'config', 'skills', 'tasks', 'output'];

const DETAIL_SECTION_LABEL = {
  summary: 'Run Summary',
  spec: 'Feature Spec',
  workflow: 'Workflow',
  config: 'Feature Config',
  skills: 'Declared Skills',
  tasks: 'Tasks',
  output: 'Live Output',
};

const DEFAULT_STEPPER_STAGES = ['specify', 'plan', 'tasks', 'implement', 'validate'];

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

function getStatusToneClass(status) {
  if (status === 'running') return 'status-running';
  if (status === 'done') return 'status-done';
  if (status === 'failed') return 'status-failed';
  if (status === 'blocked') return 'status-blocked';
  if (status === 'aborted') return 'status-aborted';
  return 'status-default';
}

function DetailMetric({ label, value, statusTone, children }) {
  return React.createElement(
    'div',
    { className: `metric ${statusTone ? getStatusToneClass(statusTone) : ''}` },
    React.createElement('div', { className: 'metric-label' }, label),
    React.createElement('div', { className: 'metric-value' }, value),
    children,
  );
}

function markerFor(stage, currentStage, summary) {
  if (stage === currentStage) return 'current';
  if (summary && summary.total > 0 && summary.done === summary.total) return 'done';
  if (!currentStage) return summary && summary.total > 0 && summary.done === summary.total ? 'done' : 'next';
  return 'next';
}

const MARKER_ICON = {
  done: '✓',
  current: '▸',
  next: '·',
};

function WorkflowStepper({ stages, workflowStages, currentStage }) {
  const summaryByStage = new Map(workflowStages.map((summary) => [summary.stage, summary]));
  const allStagesComplete =
    stages.length > 0 &&
    currentStage === null &&
    stages.every((stage) => {
      const summary = summaryByStage.get(stage);
      return summary !== undefined && summary.total > 0 && summary.done === summary.total;
    });

  return React.createElement(
    'div',
    { className: 'workflow-stepper' },
    stages.map((stage, index) => {
      const summary = summaryByStage.get(stage);
      const marker = markerFor(stage, currentStage, summary);
      const countLabel = summary && summary.total > 0 ? ` ${summary.done}/${summary.total}` : '';
      return React.createElement(
        'span',
        { key: stage, className: `stepper-step ${marker}` },
        `${MARKER_ICON[marker]} ${stage}${countLabel}`,
        index < stages.length - 1 ? React.createElement('span', { className: 'stepper-arrow' }, ' → ') : null,
      );
    }),
    allStagesComplete ? React.createElement('span', { className: 'stepper-step done' }, ' → ✓ Done') : null,
  );
}

function TabBar({ sections, activeTab, labels, onSelect }) {
  return React.createElement(
    'div',
    { className: 'tab-bar' },
    sections.map((id, index) =>
      React.createElement(
        'button',
        {
          key: id,
          className: `tab ${activeTab === index ? 'active' : ''}`,
          onClick: () => onSelect(index),
        },
        activeTab === index ? `[${labels[id]}]` : labels[id],
      ),
    ),
  );
}

function DetailSection({ title, children }) {
  return React.createElement(
    'div',
    { className: 'detail-section' },
    React.createElement('h3', null, title),
    React.createElement('div', { className: 'detail-section-body' }, children),
  );
}

function renderOutputEntry(entry, maxWidth) {
  if (entry.source === 'tool') {
    return React.createElement(
      'div',
      { key: entry.id, className: 'output-entry tool' },
      truncateText(entry.line, maxWidth),
    );
  }
  if (entry.source === 'heartbeat') {
    return React.createElement(
      'div',
      { key: entry.id, className: 'output-entry heartbeat' },
      formatHeartbeatLine(entry.line, maxWidth),
    );
  }
  if (entry.source === 'stderr') {
    return React.createElement(
      'div',
      { key: entry.id, className: 'output-entry stderr' },
      `ERR> ${truncateText(entry.line, maxWidth - 5)}`,
    );
  }
  return React.createElement(
    'div',
    { key: entry.id, className: `output-entry ${entry.source || 'stdout'}` },
    truncateText(entry.line, maxWidth),
  );
}

function stageStatusLabel(stage) {
  if (stage.running > 0) return 'executing';
  if (stage.failed > 0) return 'failed';
  if (stage.blocked > 0) return 'blocked';
  if (stage.total > 0 && stage.done === stage.total) return 'done';
  return 'pending';
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
  const dependsOn = feature.dependsOn ?? [];
  const stageSkillEntries = Object.entries(settings.stageSkills ?? {});

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(ConfigGroup, { title: 'Execução' },
      configRow('tool', feature.tool),
      configRow('model', feature.model ?? `${feature.tool} (default)`, !feature.model),
      configRow('effort', feature.effort),
    ),
    React.createElement(ConfigGroup, { title: 'Workflow' },
      configRow('mode', workflow.mode),
      configRow('stages', workflow.stages.join(' → ')),
      configRow('syncTasksToBacklog', String(workflow.syncTasksToBacklog)),
    ),
    React.createElement(ConfigGroup, { title: 'Aprovações' },
      configRow('channel', workflow.approvals.channel),
      configRow('autoAdvance', String(workflow.approvals.autoAdvance)),
    ),
    React.createElement(ConfigGroup, { title: 'Skills' },
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
    React.createElement(ConfigGroup, { title: 'Dependências' },
      React.createElement('div', { className: 'muted' }, dependsOn.length > 0 ? dependsOn.join(', ') : 'nenhuma'),
    ),
    React.createElement(ConfigGroup, { title: 'Retry' },
      configRow('maxAttempts', String(resolvedRetry.maxAttempts), !retryExplicit),
      configRow('backoffMs', String(resolvedRetry.backoffMs), !retryExplicit),
      configRow('onFail', resolvedRetry.onFail, !retryExplicit),
    ),
    settings.budget &&
      React.createElement(ConfigGroup, { title: 'Budget (backlog)' },
        settings.budget.maxTokens !== undefined && configRow('maxTokens', String(settings.budget.maxTokens)),
        settings.budget.perFeatureMaxTokens !== undefined && configRow('perFeatureMaxTokens', String(settings.budget.perFeatureMaxTokens)),
      ),
    React.createElement(ConfigGroup, { title: 'Arquivos' },
      configRow('specFile', feature.specFile ?? 'não declarado', !feature.specFile),
      configRow('context', feature.context && feature.context.length > 0 ? feature.context.join(', ') : 'nenhum', !feature.context?.length),
    ),
  );
}

function ConfigGroup({ title, children }) {
  return React.createElement(
    'div',
    { className: 'config-group' },
    React.createElement('h4', null, title),
    children,
  );
}

function configRow(label, value, muted = false) {
  return React.createElement('div', { className: muted ? 'muted' : '' }, `${label}: ${value}`);
}

function renderSectionContent(sectionId, ctx) {
  const {
    run,
    feature,
    backlogSettings,
    taskRuns,
    breakdown,
    outputLines,
    outputPaused,
    logsVisible,
    dense,
  } = ctx;

  switch (sectionId) {
    case 'summary': {
      const statusGlyph = STATUS_ICON[run.status];
      const elapsed = formatElapsed(run.startedAt, run.endedAt);
      const ctxLabel = run.contextWindowTokens
        ? `${formatPercent(run.contextWindowPercent)} ctx`
        : '— ctx';
      const pipelineTokens = run.pipelineTotalTokens ?? run.totalTokens ?? null;
      const sessionTokens = run.totalTokens ?? null;
      const head = [
        `${statusGlyph} ${getRunStatusLabel(run)}`,
        `tool ${run.tool}`,
        `${formatTokens(sessionTokens)} session`,
        `${formatTokens(pipelineTokens)} pipeline`,
        `${elapsed} elapsed`,
        ctxLabel,
      ].join(' | ');
      return React.createElement(
        DetailSection,
        { title: DETAIL_SECTION_LABEL.summary },
        React.createElement('div', null, head),
        run.pendingStageRequestPrompt &&
          React.createElement('div', { className: 'muted' }, `wait ${run.pendingStageRequestPrompt}`),
        breakdown?.wallMs != null &&
          React.createElement(
            React.Fragment,
            null,
            React.createElement('div', { className: 'muted' }, `agent ${formatDurationMs(breakdown.agentMs)}`),
            breakdown.gateWaitMs > 0 && React.createElement('div', { className: 'muted' }, `gate wait ${formatDurationMs(breakdown.gateWaitMs)}`),
            breakdown.retryCount > 0 &&
              React.createElement(
                'div',
                { className: 'muted' },
                `retry wait ${formatDurationMs(breakdown.retryWaitMs)} (${breakdown.retryCount}x)`,
              ),
          ),
      );
    }

    case 'spec': {
      const specLines = feature?.description ? feature.description.split('\n') : [];
      return React.createElement(
        DetailSection,
        { title: DETAIL_SECTION_LABEL.spec },
        specLines.length > 0
          ? specLines.slice(0, dense ? 4 : specLines.length).map((line, index) =>
              React.createElement('div', { key: index, className: 'muted spec-line' }, line || ' '),
            )
          : React.createElement('div', { className: 'muted' }, `No spec or specFile declared for ${run.featureId} in the backlog.`),
      );
    }

    case 'workflow': {
      const stages = feature?.workflow?.stages ?? DEFAULT_STEPPER_STAGES;
      const workflowStages = summarizeTaskRuns(taskRuns, stages);
      return React.createElement(
        DetailSection,
        { title: DETAIL_SECTION_LABEL.workflow },
        React.createElement(
          'div',
          { className: 'muted' },
          workflowStages.length > 0
            ? 'Per-stage task breakdown:'
            : run.pipelineResumeSummary
              ? run.pipelineResumeSummary
              : 'No workflow steps recorded for this run yet.',
        ),
        workflowStages.length > 0 &&
          workflowStages.map((stage) =>
            React.createElement(
              'div',
              { key: stage.stage, className: 'workflow-stage' },
              React.createElement(
                'div',
                { className: 'muted' },
                [
                  stage.totalTokens > 0 ? `${formatTokens(stage.totalTokens)} tokens` : null,
                  stage.maxContextPercent !== null ? `${formatPercent(stage.maxContextPercent)} ctx` : null,
                  stage.running > 0 ? `${stage.running} active` : null,
                  stage.pending > 0 ? `${stage.pending} pending` : null,
                  stage.blocked > 0 ? `${stage.blocked} blocked` : null,
                  stage.failed > 0 ? `${stage.failed} failed` : null,
                  stage.skipped > 0 ? `${stage.skipped} skipped` : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ') || `${stage.stage}: completed`,
              ),
              stage.tasks.slice(0, dense ? 1 : 6).map((task, index) =>
                React.createElement(
                  'div',
                  { key: `${stage.stage}:${task.taskId}:${index}`, className: 'muted workflow-task' },
                  `${task.status === 'running' ? '>' : '-'} ${[
                    task.title,
                    task.totalTokens ? `${formatTokens(task.totalTokens)} tokens` : null,
                    task.contextWindowPercent !== null && task.contextWindowPercent !== undefined
                      ? `${formatPercent(task.contextWindowPercent)} ctx`
                      : null,
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}`,
                ),
              ),
            ),
          ),
      );
    }

    case 'config':
      return React.createElement(
        DetailSection,
        { title: DETAIL_SECTION_LABEL.config },
        feature
          ? React.createElement(FeatureConfigSection, { feature, settings: backlogSettings })
          : React.createElement('div', { className: 'muted' }, `No feature catalog entry found for ${run.featureId}.`),
      );

    case 'skills':
      return React.createElement(
        DetailSection,
        { title: DETAIL_SECTION_LABEL.skills },
        feature?.skills?.length
          ? feature.skills.map((skill, index) => React.createElement('div', { key: `${skill}:${index}`, className: 'skill-item' }, `- ${skill}`))
          : React.createElement('div', { className: 'muted' }, 'No backlog skill metadata found for this run.'),
      );

    case 'tasks': {
      const declaredTasks = feature?.tasks ?? [];
      return React.createElement(
        DetailSection,
        { title: DETAIL_SECTION_LABEL.tasks },
        declaredTasks.length > 0
          ? declaredTasks.slice(0, dense ? 5 : declaredTasks.length).map((task) =>
              React.createElement(
                'div',
                { key: task.id, className: 'muted' },
                `${BACKLOG_TASK_ICON[task.status] ?? '○'} ${task.id} — ${task.title}`,
              ),
            )
          : React.createElement('div', { className: 'muted' }, `No task breakdown declared for ${run.featureId} in the backlog.`),
      );
    }

    case 'output': {
      const outputToRender = outputLines.length > 0
        ? (dense ? outputLines.slice(-6) : outputLines.slice(-120))
        : [];
      return React.createElement(
        DetailSection,
        { title: DETAIL_SECTION_LABEL.output },
        logsVisible
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                'div',
                { className: 'muted' },
                run.status === 'running'
                  ? outputPaused
                    ? 'Auto-scroll paused. Press Ctrl+S to resume live tailing.'
                    : outputLines[outputLines.length - 1]?.source === 'heartbeat'
                      ? 'Agent thinking... heartbeat received while waiting for the next visible event.'
                      : 'Streaming latest run events in real time.'
                  : 'Run finished. Tail below shows the latest captured output.',
              ),
              React.createElement(
                'div',
                { className: 'output-log' },
                outputToRender.length > 0
                  ? outputToRender.map((entry) => renderOutputEntry(entry, 1000))
                  : React.createElement(
                      'div',
                      { className: 'muted' },
                      run.status === 'running'
                        ? 'Agent thinking... waiting for the first streamed line.'
                        : 'No output captured for this run yet.',
                    ),
              ),
            )
          : React.createElement('div', { className: 'muted' }, 'Logs hidden. Press Ctrl+L to reopen the live output view.'),
      );
    }

    default:
      return React.createElement('div', { className: 'muted' }, 'Unknown section.');
  }
}

export function RunDetail({
  run,
  feature,
  backlogSettings,
  taskRuns,
  breakdown,
  outputLines,
  outputPaused,
  logsVisible,
  dense,
  activeTab,
  onTabChange,
  onToggleDensity,
  onTogglePause,
  onToggleLogs,
  onPause,
  onResume,
  onAbort,
  onClose,
}) {
  const pipelineTokens = run.pipelineTotalTokens ?? run.totalTokens ?? null;
  const sessionTokens = run.totalTokens ?? null;
  const contextLabel = run.contextWindowTokens
    ? `${formatPercent(run.contextWindowPercent)} of ${formatTokens(run.contextWindowTokens)}`
    : '—';
  const stages = feature?.workflow?.stages ?? DEFAULT_STEPPER_STAGES;
  const workflowStages = summarizeTaskRuns(taskRuns, stages);

  const canPause = run.pipelineId && run.pipelineStatus === 'running';
  const canResume = run.pipelineId && run.pipelineStatus === 'paused';
  const canAbort = run.pipelineId && (run.pipelineStatus === 'running' || run.pipelineStatus === 'paused');

  return React.createElement(
    'div',
    { className: 'run-detail-overlay' },
    React.createElement(
      'div',
      { className: 'run-detail' },
      React.createElement(
        'header',
        { className: 'run-detail-header' },
        React.createElement(
          'div',
          null,
          React.createElement('h2', null, feature?.title ?? run.featureId),
          React.createElement('div', { className: 'muted' }, `${run.featureId} · ${run.repoId}`),
        ),
        React.createElement(
          'div',
          { className: 'run-detail-actions' },
          canPause && React.createElement('button', { onClick: onPause }, 'pause'),
          canResume && React.createElement('button', { onClick: onResume }, 'resume'),
          canAbort && React.createElement('button', { className: 'danger', onClick: onAbort }, 'abort'),
          React.createElement('button', { onClick: onClose }, 'close'),
        ),
      ),
      React.createElement(
        'div',
        { className: 'metrics-grid' },
        React.createElement(DetailMetric, {
          label: 'Status',
          value: `${STATUS_ICON[run.status]} ${getRunStatusLabel(run)}`,
          statusTone: run.status,
        }),
        React.createElement(DetailMetric, { label: 'Tool', value: run.tool }),
        React.createElement(DetailMetric, { label: 'Model', value: feature?.model ?? '—' }),
        React.createElement(DetailMetric, { label: 'Session Tokens', value: formatTokens(sessionTokens) }),
        React.createElement(DetailMetric, { label: 'Pipeline Tokens', value: formatTokens(pipelineTokens) }),
        React.createElement(DetailMetric, { label: 'Context', value: contextLabel }),
        React.createElement(DetailMetric, { label: 'Elapsed', value: formatElapsed(run.startedAt, run.endedAt) }),
      ),
      React.createElement(
        'div',
        { className: 'run-detail-stepper' },
        React.createElement(WorkflowStepper, {
          stages,
          workflowStages,
          currentStage: run.pipelineCurrentStage ?? run.stage,
        }),
      ),
      React.createElement(TabBar, {
        sections: DETAIL_SECTION_ORDER,
        activeTab,
        labels: DETAIL_SECTION_LABEL,
        onSelect: onTabChange,
      }),
      React.createElement(
        'div',
        { className: 'run-detail-body' },
        renderSectionContent(DETAIL_SECTION_ORDER[activeTab], {
          run,
          feature,
          backlogSettings,
          taskRuns,
          breakdown,
          outputLines,
          outputPaused,
          logsVisible,
          dense,
        }),
      ),
      React.createElement(
        'footer',
        { className: 'run-detail-footer' },
        `Tab ${activeTab + 1}/${DETAIL_SECTION_ORDER.length} · Tab/Shift+Tab cycle · 1-7 jump · i density: ${dense ? 'dense' : 'rich'} · Ctrl+S ${outputPaused ? 'resume' : 'pause'} output · Ctrl+L toggle logs`,
      ),
    ),
  );
}
