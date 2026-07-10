import React from 'react';

export function StatusBar({ view, selectedRun, selectedGate }) {
  return React.createElement(
    'footer',
    { className: 'status-bar' },
    React.createElement('span', null, view),
    React.createElement(
      'span',
      null,
      selectedRun ? `${selectedRun.featureId} ${selectedRun.status}` : selectedGate ? `${selectedGate.featureId} gate` : '',
    ),
  );
}
