import React from 'react';
import { formatTokens } from '../lib/format.js';

export function Header({ state, connected }) {
  const stats = state?.stats || {};
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
      React.createElement('span', null, connected ? 'connected' : 'offline'),
    ),
  );
}
