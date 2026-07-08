/**
 * Contract: Command Palette & Keyboard Shortcuts Type Definitions
 *
 * This file defines the TypeScript interfaces exposed by the command palette
 * and keyboard shortcuts system. These types are the public API contract for
 * integrating this feature into the TUI.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Command category for grouping commands in the palette.
 */
export type CommandCategory = 'run' | 'gate' | 'system' | 'view';

/**
 * Shortcut scope: global (active everywhere) or context-specific.
 */
export type ShortcutScope = 'global' | 'context';

/**
 * Focus panel identifier.
 */
export type FocusPanel = 'runs' | 'gates' | 'main';

// ============================================================================
// Entity Interfaces
// ============================================================================

/**
 * Command: An executable action available in the TUI.
 *
 * Commands are discoverable via the command palette and may have keyboard
 * shortcuts. Each command declares its availability condition and execution
 * logic.
 */
export interface Command {
  /** Unique command identifier (e.g., 'run-pause', 'gate-approve') */
  id: string;

  /** Human-readable command name (e.g., 'Pause run', 'Approve gate') */
  name: string;

  /** Optional detailed description for help overlay */
  description?: string;

  /** Command category for grouping */
  category: CommandCategory;

  /** Search keywords for fuzzy matching (e.g., ['pause', 'stop', 'suspend']) */
  keywords: string[];

  /** Keyboard shortcut if available (e.g., 'p', 'ctrl+p', null if no shortcut) */
  shortcut?: string | null;

  /** Predicate function determining if command is currently executable */
  available: () => boolean;

  /** Command execution function */
  execute: () => void;
}

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

  /** Context name if scope is 'context' (e.g., 'gates', 'runs', 'run-detail'), null if global */
  context?: string | null;

  /** Human-readable label for help display (e.g., 'Pause run', 'Approve gate') */
  label: string;

  /** Optional availability condition (e.g., () => canPause) */
  condition?: (() => boolean) | null;

  /** Action to execute when shortcut is triggered */
  action: () => void;
}

/**
 * FocusContext: The current focused panel, determining which shortcuts are active.
 */
export interface FocusContext {
  /** Context identifier (e.g., 'runs', 'gates', 'main', 'run-detail') */
  name: string;

  /** List of shortcuts active in this context (computed from registry) */
  activeShortcuts: KeyboardShortcut[];

  /** Shortcut hints to display in status bar (computed from activeShortcuts) */
  statusBarHints: string[];
}

/**
 * CommandPaletteState: UI state for the command palette modal.
 */
export interface CommandPaletteState {
  /** Whether the command palette is currently visible */
  isOpen: boolean;

  /** Current search query entered by user */
  query: string;

  /** Commands matching the current query (computed from fuzzy search) */
  filteredCommands: Command[];

  /** Index of currently highlighted command in filteredCommands */
  selectedIndex: number;
}

/**
 * HelpOverlayState: UI state for the help overlay modal.
 */
export interface HelpOverlayState {
  /** Whether the help overlay is currently visible */
  isOpen: boolean;

  /** Current focus context (e.g., 'gates', 'runs') to highlight relevant shortcuts */
  currentContext: string;

  /** List of global shortcuts to display */
  globalShortcuts: KeyboardShortcut[];

  /** List of context-specific shortcuts for current context */
  contextShortcuts: KeyboardShortcut[];
}

// ============================================================================
// Hook Interfaces
// ============================================================================

/**
 * Options for useKeyboardShortcuts hook.
 */
export interface UseKeyboardShortcutsOptions {
  /** Current focus context (e.g., 'runs', 'gates', 'main') */
  currentContext: string;

  /** Whether keyboard shortcuts are enabled (false when modals are open) */
  enabled: boolean;
}

/**
 * Return value for useKeyboardShortcuts hook.
 */
export interface UseKeyboardShortcutsResult {
  /** Register a keyboard shortcut */
  registerShortcut: (shortcut: KeyboardShortcut) => void;

  /** Unregister a keyboard shortcut by key and context */
  unregisterShortcut: (key: string, context?: string | null) => void;

  /** Get all registered shortcuts for current context */
  getActiveShortcuts: () => KeyboardShortcut[];

  /** Get status bar hints for current context */
  getStatusBarHints: () => string[];
}

/**
 * Options for useCommandPalette hook.
 */
export interface UseCommandPaletteOptions {
  /** List of all commands */
  commands: Command[];

  /** Callback when command palette closes */
  onClose: () => void;

  /** Callback when command is executed */
  onExecute: (command: Command) => void;
}

/**
 * Return value for useCommandPalette hook.
 */
export interface UseCommandPaletteResult {
  /** Command palette state */
  state: CommandPaletteState;

  /** Open the command palette */
  open: () => void;

  /** Close the command palette */
  close: () => void;

  /** Update search query */
  setQuery: (query: string) => void;

  /** Move selection up */
  selectPrevious: () => void;

  /** Move selection down */
  selectNext: () => void;

  /** Execute selected command */
  executeSelected: () => void;
}

// ============================================================================
// Component Props
// ============================================================================

/**
 * Props for CommandPalette component.
 */
export interface CommandPaletteProps {
  /** Whether the palette is visible */
  isOpen: boolean;

  /** List of all commands */
  commands: Command[];

  /** Callback when palette closes */
  onClose: () => void;

  /** Terminal width for sizing */
  width: number;
}

/**
 * Props for HelpOverlay component.
 */
export interface HelpOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean;

  /** Current focus context */
  currentContext: string;

  /** All registered keyboard shortcuts */
  shortcuts: KeyboardShortcut[];

  /** Callback when overlay closes */
  onClose: () => void;

  /** Terminal width for sizing */
  width: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Fuzzy match result with score.
 */
export interface FuzzyMatchResult {
  /** Matched command */
  command: Command;

  /** Match score (higher is better) */
  score: number;
}

/**
 * Fuzzy match a query against a list of commands.
 *
 * @param commands - List of commands to search
 * @param query - Search query
 * @returns Sorted list of matching commands (highest score first)
 */
export type FuzzyMatchFunction = (commands: Command[], query: string) => Command[];
