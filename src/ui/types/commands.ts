/**
 * Command types for the command palette and keyboard shortcuts system.
 *
 * These types define the contract for executable commands in the TUI.
 */

/**
 * Command category for grouping commands in the palette.
 */
export type CommandCategory = 'run' | 'gate' | 'system' | 'view';

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
