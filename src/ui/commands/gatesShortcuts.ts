import type { KeyboardShortcut } from '../types/shortcuts.js';

interface GatesShortcutOptions {
  canResolve: boolean;
  canRetry: boolean;
  approve: () => void;
  skip: () => void;
  retry: () => void;
}

export function createGatesShortcuts(options: GatesShortcutOptions): KeyboardShortcut[] {
  const { canResolve, canRetry, approve, skip, retry } = options;

  return [
    {
      key: 'a',
      scope: 'context',
      context: 'gates',
      label: 'Approve',
      condition: () => canResolve,
      action: approve,
    },
    {
      key: 's',
      scope: 'context',
      context: 'gates',
      label: 'Skip',
      condition: () => canResolve,
      action: skip,
    },
    {
      key: 'r',
      scope: 'context',
      context: 'gates',
      label: 'Retry',
      condition: () => canRetry,
      action: retry,
    },
  ];
}
