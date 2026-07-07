/**
 * Hook for managing keyboard shortcuts with context awareness.
 *
 * This hook provides a centralized registry for keyboard shortcuts that can be
 * global (active everywhere) or context-specific (active only in certain panels).
 */

import { useEffect, useRef, useCallback } from 'react';
import { useInput } from 'ink';
import type { KeyboardShortcut } from '../types/shortcuts.js';

export interface UseKeyboardShortcutsOptions {
  /** Current focus context (e.g., 'runs', 'gates', 'main') */
  currentContext: string;

  /** Whether keyboard shortcuts are enabled (false when modals are open) */
  enabled: boolean;
}

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
 * Hook for managing keyboard shortcuts with context awareness.
 *
 * @param options - Configuration options
 * @returns Shortcut management functions
 */
export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions
): UseKeyboardShortcutsResult {
  const { currentContext, enabled } = options;
  const shortcutsRef = useRef<Map<string, KeyboardShortcut>>(new Map());

  /**
   * Generate a unique key for a shortcut.
   */
  const getShortcutKey = useCallback((key: string, context?: string | null): string => {
    return context ? `${context}:${key}` : `global:${key}`;
  }, []);

  /**
   * Register a keyboard shortcut.
   */
  const registerShortcut = useCallback(
    (shortcut: KeyboardShortcut) => {
      const shortcutKey = getShortcutKey(shortcut.key, shortcut.context);
      shortcutsRef.current.set(shortcutKey, shortcut);
    },
    [getShortcutKey]
  );

  /**
   * Unregister a keyboard shortcut.
   */
  const unregisterShortcut = useCallback(
    (key: string, context?: string | null) => {
      const shortcutKey = getShortcutKey(key, context);
      shortcutsRef.current.delete(shortcutKey);
    },
    [getShortcutKey]
  );

  /**
   * Get all shortcuts active in the current context.
   * Includes global shortcuts and context-specific shortcuts for current context.
   */
  const getActiveShortcuts = useCallback((): KeyboardShortcut[] => {
    const shortcuts: KeyboardShortcut[] = [];

    for (const shortcut of shortcutsRef.current.values()) {
      if (shortcut.scope === 'global') {
        shortcuts.push(shortcut);
      } else if (shortcut.scope === 'context' && shortcut.context === currentContext) {
        shortcuts.push(shortcut);
      }
    }

    return shortcuts;
  }, [currentContext]);

  /**
   * Generate status bar hints from active shortcuts.
   * Format: "key:label" (e.g., "a:approve", "?:help")
   */
  const getStatusBarHints = useCallback((): string[] => {
    const activeShortcuts = getActiveShortcuts();
    return activeShortcuts
      .filter((shortcut) => !shortcut.condition || shortcut.condition())
      .slice(0, 6)
      .map((shortcut) => {
        const key = shortcut.key.replace('ctrl+', '^');
        return `${key}:${shortcut.label.toLowerCase()}`;
      });
  }, [getActiveShortcuts]);

  /**
   * Handle keyboard input for registered shortcuts.
   */
  useInput(
    (input, key) => {
      if (!enabled) return;

      const activeShortcuts = getActiveShortcuts();

      for (const shortcut of activeShortcuts) {
        let matches = false;

        if (shortcut.key.includes('+')) {
          const parts = shortcut.key.split('+');
          const modifier = parts[0];
          const keyPart = parts[1];

          if (modifier === 'ctrl' && key.ctrl && input.toLowerCase() === keyPart) {
            matches = true;
          }
        } else if (input === shortcut.key || (key as any)[shortcut.key]) {
          matches = true;
        }

        if (matches) {
          if (!shortcut.condition || shortcut.condition()) {
            shortcut.action();
            break;
          }
        }
      }
    },
    { isActive: enabled }
  );

  return {
    registerShortcut,
    unregisterShortcut,
    getActiveShortcuts,
    getStatusBarHints,
  };
}
