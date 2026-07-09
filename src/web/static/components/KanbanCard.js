import React from 'react';
import { STATUS_ICON, getRunStageLabel } from '../lib/format.js';

export function KanbanCard({ run, selected, onClick }) {
  const stageLabel = getRunStageLabel(run);
  return React.createElement(
    'div',
    { className: `card ${selected ? 'selected' : ''}`, onClick },
    React.createElement(
      'div',
      { className: 'title' },
      `${STATUS_ICON[run.status]} ${run.featureId}`,
    ),
    React.createElement(
      'div',
      { className: 'meta' },
      React.createElement('span', null, run.tool),
      stageLabel ? React.createElement('span', null, stageLabel) : null,
      run.pipelineStatus ? React.createElement('span', null, `pipeline ${run.pipelineStatus}`) : null,
      run.totalTokens != null ? React.createElement('span', null, `${run.totalTokens.toLocaleString()} tok`) : null,
    ),
  );
}
