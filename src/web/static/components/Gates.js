import React from 'react';

export function Gates({ gates, selectedGateId, onSelectGate, onResolve, onForce }) {
  return React.createElement(
    'aside',
    { className: 'gates' },
    React.createElement('h2', null, `Gates (${gates.length})`),
    React.createElement(
      'div',
      { className: 'list' },
      gates.length === 0
        ? React.createElement('div', { className: 'empty' }, 'No pending gates')
        : gates.map((gate) =>
            React.createElement(
              'div',
              {
                key: gate.id,
                className: `gate ${selectedGateId === gate.id ? 'selected' : ''}`,
                onClick: () => onSelectGate(gate.id),
              },
              React.createElement('div', { className: 'feature' }, gate.featureId),
              React.createElement('div', { className: 'meta' }, gate.kind),
              gate.prompt ? React.createElement('div', { className: 'prompt' }, gate.prompt) : null,
              selectedGateId === gate.id
                ? React.createElement(
                    'div',
                    { className: 'actions' },
                    React.createElement('button', { onClick: () => onResolve(gate, 'approved') }, 'approve'),
                    gate.kind === 'gate'
                      ? React.createElement('button', { onClick: () => onResolve(gate, 'skipped') }, 'skip')
                      : null,
                    gate.kind === 'gate'
                      ? React.createElement('button', { onClick: () => onResolve(gate, 'retried') }, 'retry')
                      : null,
                    React.createElement(
                      'button',
                      { className: 'primary', onClick: () => onForce(gate) },
                      'force',
                    ),
                  )
                : null,
            ),
          ),
    ),
  );
}
