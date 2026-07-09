import React from 'react';
import { formatTokens } from '../lib/format.js';

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

export function Dashboard({ rows, periods, selectedPeriod, onSelectPeriod }) {
  return React.createElement(
    'div',
    { className: 'dashboard' },
    React.createElement(
      'div',
      { style: { marginBottom: 12 } },
      periods.map((period, index) =>
        React.createElement(
          'button',
          {
            key: period.label,
            className: selectedPeriod === index ? 'primary' : '',
            style: { marginRight: 8 },
            onClick: () => onSelectPeriod(index),
          },
          period.label,
        ),
      ),
    ),
    React.createElement(
      'table',
      { style: { width: '100%', borderCollapse: 'collapse' } },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          React.createElement('th', { style: { textAlign: 'left' } }, 'feature'),
          React.createElement('th', { style: { textAlign: 'left' } }, 'tool'),
          React.createElement('th', { style: { textAlign: 'left' } }, 'status'),
          React.createElement('th', { style: { textAlign: 'right' } }, 'tokens'),
          React.createElement('th', { style: { textAlign: 'left' } }, 'started'),
        ),
      ),
      React.createElement(
        'tbody',
        null,
        rows.length === 0
          ? React.createElement(
              'tr',
              null,
              React.createElement('td', { colSpan: 5, className: 'empty' }, 'No runs for this period'),
            )
          : rows.map((row) =>
              React.createElement(
                'tr',
                { key: row.id },
                React.createElement('td', null, row.featureId),
                React.createElement('td', null, row.tool),
                React.createElement('td', null, row.status),
                React.createElement('td', { style: { textAlign: 'right' } }, formatTokens(row.totalTokens)),
                React.createElement('td', null, formatDate(row.startedAt)),
              ),
            ),
      ),
    ),
  );
}
