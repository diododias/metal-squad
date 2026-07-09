import type { KeyboardShortcut } from '../types/shortcuts.js';

interface GlobalShortcutOptions {
  canNavigateRuns: boolean;
  canNavigateGates: boolean;
  canMovePending: boolean;
  canSwitchColumn: boolean;
  /** F31 section 4: Enter confirms/starts from inside the TODO preview screen. */
  canConfirmPreview: boolean;
  movePrevious: () => void;
  moveNext: () => void;
  moveColumnLeft: () => void;
  moveColumnRight: () => void;
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
    canSwitchColumn,
    canConfirmPreview,
    movePrevious,
    moveNext,
    moveColumnLeft,
    moveColumnRight,
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
    // F31 "novo modelo de foco": ←/→ switches the active kanban column
    // (TODO ↔ EXECUTION/BLOCKED ↔ DONE ↔ FALHA); Tab keeps cycling the
    // high-level panels (columns ↔ gates ↔ activity), it no longer moves
    // between columns.
    {
      key: 'left',
      scope: 'global',
      label: 'Previous column',
      condition: () => canSwitchColumn,
      action: moveColumnLeft,
    },
    {
      key: 'right',
      scope: 'global',
      label: 'Next column',
      condition: () => canSwitchColumn,
      action: moveColumnRight,
    },
    {
      key: 'k',
      scope: 'global',
      label: 'Navigate up',
      condition: () => canMove,
      action: movePrevious,
    },
    {
      key: 'up',
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
      key: 'down',
      scope: 'global',
      label: 'Navigate down',
      condition: () => canMove,
      action: moveNext,
    },
    {
      key: 'enter',
      scope: 'global',
      label: 'Select',
      condition: () => canNavigateRuns || canMovePending || canConfirmPreview,
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
