import React from 'react';

export function HelpOverlay({ isOpen, onClose, shortcuts }) {
  if (!isOpen) return null;
  return React.createElement(
    'div',
    { className: 'help-overlay', onClick: onClose },
    React.createElement(
      'div',
      { className: 'help', onClick: (e) => e.stopPropagation() },
      React.createElement('h2', null, 'Keyboard shortcuts'),
      React.createElement(
        'table',
        null,
        React.createElement(
          'tbody',
          null,
          shortcuts.map((shortcut) =>
            React.createElement(
              'tr',
              { key: shortcut.key + shortcut.label },
              React.createElement('td', null, shortcut.key),
              React.createElement('td', null, shortcut.label),
            ),
          ),
        ),
      ),
    ),
  );
}
