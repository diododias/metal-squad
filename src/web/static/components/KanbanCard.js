import React, { useEffect, useState } from 'react';
import { STATUS_ICON, getRunStageLabel, formatElapsed, truncateText } from '../lib/format.js';

// F34 item 3: running/blocked cards tick their own elapsed time locally
// (no round-trip) and show the latest streamed output line, so the kanban
// overview reflects live progress without opening the run detail overlay.
export function KanbanCard({ run, selected, onClick, outputLines }) {
  const stageLabel = getRunStageLabel(run);
  const isLive = run.status === 'running' || run.status === 'blocked';
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!isLive) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  const lastVisibleLine = isLive
    ? [...(outputLines || [])].reverse().find((entry) => entry.source !== 'heartbeat')
    : null;

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
      isLive ? React.createElement('span', null, formatElapsed(run.startedAt, run.endedAt)) : null,
    ),
    lastVisibleLine
      ? React.createElement('div', { className: 'card-output-line' }, truncateText(lastVisibleLine.line, 60))
      : null,
  );
}
