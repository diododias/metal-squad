import type { KeyboardShortcut } from '../types/shortcuts.js';

interface GlobalShortcutOptions {
  canNavigateRuns: boolean;
  canNavigateGates: boolean;
  canMovePending: boolean;
  movePrevious: () => void;
  moveNext: () => void;
  enter: () => void;
  escape: () => void;
  cycleFocus: () => void;
  quit: () => void;
}

export function createGlobalShortcuts(options: GlobalShortcutOptions): KeyboardShortcut[] {
  const {
    canNavigateRuns,
    canNavigateGates,
    canMovePending,
    movePrevious,
    moveNext,
    enter,
    escape,
    cycleFocus,
    quit,
  } = options;

  const canMove = canNavigateRuns || canNavigateGates || canMovePending;

  return [
    {
      key: 'q',
      scope: 'global',
      label: 'Quit',
      action: quit,
    },
    {
      key: 'tab',
      scope: 'global',
      label: 'Focus',
      action: cycleFocus,
    },
    {
      key: 'k',
      scope: 'global',
      label: 'Navigate up',
      condition: () => canMove,
      action: movePrevious,
    },
    {
      key: 'j',
      scope: 'global',
      label: 'Navigate down',
      condition: () => canMove,
      action: moveNext,
    },
    {
      key: 'enter',
      scope: 'global',
      label: 'Select',
      condition: () => canNavigateRuns,
      action: enter,
    },
    {
      key: 'esc',
      scope: 'global',
      label: 'Back',
      action: escape,
    },
  ];
}
