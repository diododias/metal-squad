import type { KeyboardShortcut } from '../types/shortcuts.js';

interface RunShortcutOptions {
  canPause: boolean;
  canAbort: boolean;
  pause: () => void;
  abort: () => void;
}

export function createRunShortcuts(options: RunShortcutOptions): KeyboardShortcut[] {
  const { canPause, canAbort, pause, abort } = options;

  return [
    {
      key: 'p',
      scope: 'context',
      context: 'run-detail',
      label: 'Pause',
      condition: () => canPause,
      action: pause,
    },
    {
      key: 'x',
      scope: 'context',
      context: 'run-detail',
      label: 'Abort',
      condition: () => canAbort,
      action: abort,
    },
  ];
}
