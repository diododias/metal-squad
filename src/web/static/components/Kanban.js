import React, { useMemo, useState } from 'react';
import { KanbanCard } from './KanbanCard.js';

const GROUP_ORDER = ['todo', 'execution', 'done', 'canceled'];
const GROUP_LABELS = {
  todo: 'TODO',
  execution: 'IN PROGRESS / BLOCKED',
  done: 'DONE',
  canceled: 'FALHA / CANCELED',
};

const STATUS_FILTER_OPTIONS = ['todo', 'running', 'blocked', 'done', 'failed', 'aborted'];

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

function matchesSearch(searchLower, id, title) {
  if (!searchLower) return true;
  return id.toLowerCase().includes(searchLower) || (title || '').toLowerCase().includes(searchLower);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter((v) => v != null && v !== ''))).sort();
}

// F34 item 4: 100% client-side search/filter over state.runs + pendingFeatures
// — no new endpoint, matches what F34 item 4 requires.
function FilterBar({ search, onSearch, filters, onFilterChange, toolOptions, modelOptions, priorityOptions }) {
  return React.createElement(
    'div',
    { className: 'kanban-filter-bar' },
    React.createElement('input', {
      type: 'text',
      className: 'kanban-filter-search',
      placeholder: 'Search feature id or title...',
      value: search,
      onChange: (e) => onSearch(e.target.value),
    }),
    React.createElement(
      'select',
      { value: filters.tool, onChange: (e) => onFilterChange('tool', e.target.value) },
      React.createElement('option', { value: '' }, 'All tools'),
      toolOptions.map((tool) => React.createElement('option', { key: tool, value: tool }, tool)),
    ),
    React.createElement(
      'select',
      { value: filters.model, onChange: (e) => onFilterChange('model', e.target.value) },
      React.createElement('option', { value: '' }, 'All models'),
      modelOptions.map((model) => React.createElement('option', { key: model, value: model }, model)),
    ),
    React.createElement(
      'select',
      { value: filters.status, onChange: (e) => onFilterChange('status', e.target.value) },
      React.createElement('option', { value: '' }, 'All statuses'),
      STATUS_FILTER_OPTIONS.map((status) => React.createElement('option', { key: status, value: status }, status)),
    ),
    priorityOptions.length > 0 &&
      React.createElement(
        'select',
        { value: filters.priority, onChange: (e) => onFilterChange('priority', e.target.value) },
        React.createElement('option', { value: '' }, 'All priorities'),
        priorityOptions.map((priority) => React.createElement('option', { key: priority, value: priority }, priority)),
      ),
  );
}

export function Kanban({ state, selectedId, selectedColumn, onSelectRun, onSelectColumn, linesByRun }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ tool: '', model: '', status: '', priority: '' });

  const featureCatalog = state?.featureCatalog || {};
  const searchLower = search.trim().toLowerCase();

  const toolOptions = useMemo(
    () => uniqueSorted(Object.values(featureCatalog).map((f) => f.tool)),
    [featureCatalog],
  );
  const modelOptions = useMemo(
    () => uniqueSorted(Object.values(featureCatalog).map((f) => f.model ?? f.tool)),
    [featureCatalog],
  );
  const priorityOptions = useMemo(
    () => uniqueSorted(Object.values(featureCatalog).map((f) => f.priority)),
    [featureCatalog],
  );

  const runs = useMemo(() => sortRunsByGroup(state?.runs || []), [state?.runs]);
  const pendingAll = state?.pendingFeatures || [];

  const pending = useMemo(() => pendingAll.filter((feature) => {
    if (!matchesSearch(searchLower, feature.id, feature.title)) return false;
    if (filters.tool && feature.tool !== filters.tool) return false;
    if (filters.model && (feature.model ?? feature.tool) !== filters.model) return false;
    if (filters.priority && feature.priority !== filters.priority) return false;
    if (filters.status && filters.status !== 'todo') return false;
    return true;
  }), [pendingAll, searchLower, filters]);

  const byGroup = useMemo(() => {
    const groups = { execution: [], done: [], canceled: [] };
    for (const run of runs) {
      const feature = featureCatalog[run.featureId];
      if (!matchesSearch(searchLower, run.featureId, feature?.title)) continue;
      if (filters.tool && run.tool !== filters.tool) continue;
      if (filters.model && (feature?.model ?? run.tool) !== filters.model) continue;
      if (filters.priority && feature?.priority !== filters.priority) continue;
      if (filters.status && run.status !== filters.status) continue;
      groups[getRunGroup(run.status)].push(run);
    }
    return groups;
  }, [runs, searchLower, filters, featureCatalog]);

  const handleFilterChange = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return React.createElement(
    'div',
    { className: 'kanban-wrapper' },
    React.createElement(FilterBar, {
      search,
      onSearch: setSearch,
      filters,
      onFilterChange: handleFilterChange,
      toolOptions,
      modelOptions,
      priorityOptions,
    }),
    React.createElement(
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
                    outputLines: linesByRun?.[run.runId],
                    onClick: (e) => {
                      e.stopPropagation();
                      onSelectRun(run.runId, group);
                    },
                  }),
                ),
          ),
        ),
      ),
    ),
  );
}
