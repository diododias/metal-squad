import React, { useEffect, useMemo, useRef, useState } from 'react';

export function CommandPalette({ commands, isOpen, onClose, onExecute }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(q) || cmd.key.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    function onKeyDown(e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) onExecute(cmd);
        return;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, filtered, selected, onClose, onExecute]);

  if (!isOpen) return null;

  return React.createElement(
    'div',
    { className: 'palette-overlay', onClick: onClose },
    React.createElement(
      'div',
      { className: 'palette', onClick: (e) => e.stopPropagation() },
      React.createElement('input', {
        ref: inputRef,
        value: query,
        onChange: (e) => {
          setQuery(e.target.value);
          setSelected(0);
        },
        placeholder: 'Type a command...',
      }),
      React.createElement(
        'div',
        { className: 'results' },
        filtered.map((cmd, index) =>
          React.createElement(
            'div',
            {
              key: cmd.id,
              className: `result ${selected === index ? 'selected' : ''}`,
              onClick: () => onExecute(cmd),
            },
            React.createElement('span', null, cmd.label),
            React.createElement('span', { className: 'shortcut' }, cmd.key),
          ),
        ),
      ),
    ),
  );
}
