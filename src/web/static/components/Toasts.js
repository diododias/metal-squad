import React from 'react';

export function Toasts({ toasts }) {
  return React.createElement(
    'div',
    { className: 'toasts' },
    toasts.map((toast) =>
      React.createElement('div', { key: toast.id, className: `toast ${toast.type}` }, toast.message),
    ),
  );
}
