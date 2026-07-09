import React from 'react';

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

function configGroup(title, children) {
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
    configGroup('Dependências',
      React.createElement('div', { className: 'muted' }, dependsOn.length > 0 ? dependsOn.join(', ') : 'nenhuma'),
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

export function FeaturePreview({ feature, settings, onStart, onClose }) {
  const specLines = feature.description ? feature.description.split('\n') : [];
  const declaredTasks = feature.tasks ?? [];

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
          React.createElement('button', { className: 'primary', onClick: onStart }, 'start feature'),
          React.createElement('button', { onClick: onClose }, 'close'),
        ),
      ),
      React.createElement(
        'div',
        { className: 'preview-grid' },
        React.createElement(
          'div',
          { className: 'preview-column' },
          React.createElement(
            'div',
            { className: 'detail-section' },
            React.createElement('h3', null, 'Feature Spec'),
            React.createElement(
              'div',
              { className: 'detail-section-body' },
              specLines.length > 0
                ? specLines.map((line, index) =>
                    React.createElement('div', { key: index, className: 'muted spec-line' }, line || ' '),
                  )
                : React.createElement('div', { className: 'muted' }, `No spec or specFile declared for ${feature.id} in the backlog.`),
            ),
          ),
          React.createElement(
            'div',
            { className: 'detail-section' },
            React.createElement('h3', null, 'Tasks'),
            React.createElement(
              'div',
              { className: 'detail-section-body' },
              declaredTasks.length > 0
                ? declaredTasks.map((task) =>
                    React.createElement(
                      'div',
                      { key: task.id, className: 'muted' },
                      `${BACKLOG_TASK_ICON[task.status] ?? '○'} ${task.id} — ${task.title}`,
                    ),
                  )
                : React.createElement('div', { className: 'muted' }, `No task breakdown declared for ${feature.id} in the backlog.`),
            ),
          ),
        ),
        React.createElement(
          'div',
          { className: 'preview-column' },
          React.createElement(
            'div',
            { className: 'detail-section' },
            React.createElement('h3', null, 'Feature Config'),
            React.createElement(
              'div',
              { className: 'detail-section-body' },
              React.createElement(FeatureConfigSection, { feature, settings }),
            ),
          ),
        ),
      ),
      React.createElement(
        'footer',
        { className: 'run-detail-footer' },
        'Enter confirms and starts this feature · Esc goes back without starting',
      ),
    ),
  );
}
