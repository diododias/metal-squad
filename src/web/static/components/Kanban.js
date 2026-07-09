import React, { useMemo } from 'react';
import { KanbanCard } from './KanbanCard.js';

const GROUP_ORDER = ['todo', 'execution', 'done', 'canceled'];
const GROUP_LABELS = {
  todo: 'TODO',
  execution: 'IN PROGRESS / BLOCKED',
  done: 'DONE',
  canceled: 'FALHA / CANCELED',
};

function getRunGroup(status) {
  if (status === 'running' || status === 'blocked') return 'execution';
  if (status === 'done') return 'done';
  return 'canceled';
}

function sortRunsByGroup(runs) {
  return [...runs]
    .map((run, index) => ({ run, index }))
    .sort((a, b) => {
      const orderA = GROUP_ORDER.indexOf(getRunGroup(a.run.status));
      const orderB = GROUP_ORDER.indexOf(getRunGroup(b.run.status));
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    })
    .map((entry) => entry.run);
}

export function Kanban({ state, selectedId, selectedColumn, onSelectRun, onSelectColumn }) {
  const runs = useMemo(() => sortRunsByGroup(state?.runs || []), [state?.runs]);
  const pending = state?.pendingFeatures || [];
  const byGroup = useMemo(() => {
    const groups = { execution: [], done: [], canceled: [] };
    for (const run of runs) {
      groups[getRunGroup(run.status)].push(run);
    }
    return groups;
  }, [runs]);

  return React.createElement(
    'div',
    { className: 'columns' },
    React.createElement(
      'div',
      { className: `column ${selectedColumn === 'todo' ? 'active' : ''}`, onClick: () => onSelectColumn('todo') },
      React.createElement('h2', null, `${GROUP_LABELS.todo} (${pending.length})`),
      React.createElement(
        'div',
        { className: 'list' },
        pending.length === 0
          ? React.createElement('div', { className: 'empty' }, 'No pending features')
          : pending.map((feature) =>
              React.createElement(
                'div',
                {
                  key: feature.id,
                  className: `card ${selectedId === feature.id ? 'selected' : ''}`,
                  onClick: (e) => {
                    e.stopPropagation();
                    onSelectRun(feature.id, 'todo');
                  },
                },
                React.createElement('div', { className: 'title' }, feature.id),
                React.createElement(
                  'div',
                  { className: 'meta' },
                  React.createElement('span', null, feature.title),
                  React.createElement('span', null, `${feature.tool} · ${feature.model ?? feature.tool} · ${feature.effort}`),
                ),
              ),
            ),
      ),
    ),
    ...['execution', 'done', 'canceled'].map((group) =>
      React.createElement(
        'div',
        {
          key: group,
          className: `column ${selectedColumn === group ? 'active' : ''}`,
          onClick: () => onSelectColumn(group),
        },
        React.createElement('h2', null, `${GROUP_LABELS[group]} (${byGroup[group].length})`),
        React.createElement(
          'div',
          { className: 'list' },
          byGroup[group].length === 0
            ? React.createElement('div', { className: 'empty' }, 'No runs')
            : byGroup[group].map((run) =>
                React.createElement(KanbanCard, {
                  key: run.runId,
                  run,
                  selected: selectedId === run.runId,
                  onClick: (e) => {
                    e.stopPropagation();
                    onSelectRun(run.runId, group);
                  },
                }),
              ),
        ),
      ),
    ),
  );
}
