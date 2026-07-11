import React, { useEffect, useState } from 'react';
import { formatTokens } from '../lib/format.js';

function connectionLabel(connectionState, elapsedSeconds) {
  if (connectionState === 'live') return 'live';
  if (connectionState === 'reconnecting') return `reconnecting (${elapsedSeconds}s)`;
  if (connectionState === 'disconnected') return `disconnected (${elapsedSeconds}s)`;
  return 'never connected';
}

export function Header({ state, connectionState, connectionSince }) {
  const stats = state?.stats || {};
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (connectionState === 'live') return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [connectionState]);

  const elapsedSeconds = connectionSince ? Math.max(0, Math.round((Date.now() - connectionSince) / 1000)) : 0;

  return React.createElement(
    'header',
    { className: 'header' },
    React.createElement('h1', null, `msq web — ${state?.repoLabel || 'loading...'}`),
    React.createElement(
      'div',
      { className: 'stats' },
      React.createElement('span', null, React.createElement('strong', null, stats.executionCount || 0), ' running'),
      React.createElement('span', null, React.createElement('strong', null, stats.doneRuns || 0), ' done'),
      React.createElement('span', null, React.createElement('strong', null, stats.falhaCount || 0), ' failed'),
      React.createElement('span', null, React.createElement('strong', null, stats.totalRuns || 0), ' total'),
      React.createElement(
        'span',
        null,
        'tokens: ',
        React.createElement('strong', null, formatTokens(stats.tokenStats?.totalTokens)),
      ),
      React.createElement('span', { className: `connection-state ${connectionState || 'never-connected'}` }, connectionLabel(connectionState, elapsedSeconds)),
    ),
  );
}
