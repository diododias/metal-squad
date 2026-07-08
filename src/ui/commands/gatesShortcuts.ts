import type { KeyboardShortcut } from '../types/shortcuts.js';

interface GatesShortcutOptions {
  canResolve: boolean;
  canRetry: boolean;
  approve: () => void;
  skip: () => void;
  retry: () => void;
  /** F1: force-bypass — resolves the gate as approved and, if it is blocking
   * a paused pipeline, resumes that pipeline in the same action. */
  forceApprove: () => void;
}

export function createGatesShortcuts(options: GatesShortcutOptions): KeyboardShortcut[] {
  const { canResolve, canRetry, approve, skip, retry, forceApprove } = options;

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
    {
      key: 'F',
      scope: 'context',
      context: 'gates',
      label: 'Force',
      condition: () => canResolve,
      action: forceApprove,
    },
  ];
}
