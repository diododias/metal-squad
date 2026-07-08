/**
 * Keyboard shortcut types for the command palette and shortcuts system.
 *
 * These types define the contract for keyboard shortcuts in the TUI.
 */

/**
 * Shortcut scope: global (active everywhere) or context-specific.
 */
export type ShortcutScope = 'global' | 'context';

/**
 * Focus panel identifier.
 *
 * F31 "novo modelo de foco": the high-level panel `Tab` cycles is
 * `columns` (the kanban board — EXECUTION/BLOCKED, TODO, DONE, FALHA all
 * live here; column switching is `←`/`→`, card switching is `j`/`k`) ↔
 * `gates` ↔ `activity`. The old `runs`/`main` split (one panel for the run
 * list, one for the pending-features list) collapsed into a single
 * `columns` panel once both became columns on the same board.
 */
export type FocusPanel = 'columns' | 'gates' | 'activity' | 'run-detail';

/**
 * KeyboardShortcut: A key binding mapped to a command or action.
 *
 * Shortcuts can be global (active everywhere) or context-specific (active
 * only when a particular panel is focused).
 */
export interface KeyboardShortcut {
  /** Key combination (e.g., 'p', 'ctrl+p', 'enter', 'escape') */
  key: string;

  /** Shortcut scope: 'global' or 'context' */
  scope: ShortcutScope;

  /** Context name if scope is 'context' (e.g., 'gates', 'run-detail'), null if global */
  context?: string | null;

  /** Human-readable label for help display (e.g., 'Pause run', 'Approve gate') */
  label: string;

  /** Optional availability condition (e.g., () => canPause) */
  condition?: (() => boolean) | null;

  /** Action to execute when shortcut is triggered */
  action: () => void;
}

/**
 * Focus context representing the current focused panel.
 */
export interface FocusContext {
  /** Context identifier (e.g., 'columns', 'gates', 'activity', 'run-detail') */
  name: string;

  /** List of shortcuts active in this context (computed from registry) */
  activeShortcuts: KeyboardShortcut[];

  /** Shortcut hints to display in status bar (computed from activeShortcuts) */
  statusBarHints: string[];
}
