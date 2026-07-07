/**
 * Hook for managing command palette state and behavior.
 *
 * This hook handles the state management for the command palette modal,
 * including query filtering, selection navigation, and command execution.
 */

import { useState, useCallback, useMemo } from 'react';
import type { Command } from '../types/commands.js';
import { fuzzyMatch } from '../utils/fuzzyMatch.js';

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

export interface UseCommandPaletteOptions {
  /** List of all commands */
  commands: Command[];

  /** Callback when command palette closes */
  onClose?: () => void;

  /** Callback when command is executed */
  onExecute?: (command: Command) => void;
}

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

/**
 * Hook for managing command palette state.
 *
 * @param options - Configuration options
 * @returns Palette state and control functions
 */
export function useCommandPalette(options: UseCommandPaletteOptions): UseCommandPaletteResult {
  const { commands, onClose, onExecute } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  /**
   * Filter commands by query using fuzzy matching.
   * Includes scoring and ranking.
   */
  const filteredCommands = useMemo(() => {
    if (!query) {
      return commands;
    }

    const results = commands
      .map((command) => {
        let bestScore = 0;

        const nameMatch = fuzzyMatch(query, command.name);
        if (nameMatch.matches) {
          bestScore = Math.max(bestScore, nameMatch.score);
        }

        for (const keyword of command.keywords) {
          const keywordMatch = fuzzyMatch(query, keyword);
          if (keywordMatch.matches) {
            bestScore = Math.max(bestScore, keywordMatch.score * 0.8);
          }
        }

        return { command, score: bestScore };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score);

    return results.map((result) => result.command);
  }, [commands, query]);

  /**
   * Open the command palette.
   */
  const open = useCallback(() => {
    setIsOpen(true);
    setQueryState('');
    setSelectedIndex(0);
  }, []);

  /**
   * Close the command palette.
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setQueryState('');
    setSelectedIndex(0);
    onClose?.();
  }, [onClose]);

  /**
   * Update search query and reset selection.
   */
  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
    setSelectedIndex(0);
  }, []);

  /**
   * Move selection up (wrap around).
   */
  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => {
      if (filteredCommands.length === 0) return 0;
      return prev > 0 ? prev - 1 : filteredCommands.length - 1;
    });
  }, [filteredCommands.length]);

  /**
   * Move selection down (wrap around).
   */
  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => {
      if (filteredCommands.length === 0) return 0;
      return prev < filteredCommands.length - 1 ? prev + 1 : 0;
    });
  }, [filteredCommands.length]);

  /**
   * Execute the currently selected command.
   */
  const executeSelected = useCallback(() => {
    if (filteredCommands.length === 0) return;

    const command = filteredCommands[selectedIndex];
    if (command && command.available()) {
      command.execute();
      onExecute?.(command);
      close();
    }
  }, [filteredCommands, selectedIndex, onExecute, close]);

  const state: CommandPaletteState = {
    isOpen,
    query,
    filteredCommands,
    selectedIndex,
  };

  return {
    state,
    open,
    close,
    setQuery,
    selectPrevious,
    selectNext,
    executeSelected,
  };
}
