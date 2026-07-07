/**
 * Hook for managing keyboard shortcuts with context awareness.
 *
 * This hook provides a centralized registry for keyboard shortcuts that can be
 * global (active everywhere) or context-specific (active only in certain panels).
 */

import { useCallback, useRef } from 'react';
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

  /** Get all registered shortcuts */
  getAllShortcuts: () => KeyboardShortcut[];

  /** Get status bar hints for current context */
  getStatusBarHints: () => string[];
}

function getShortcutId(key: string, context?: string | null): string {
  return context ? `${context}:${key}` : `global:${key}`;
}

function shortcutHintKey(shortcut: KeyboardShortcut): string {
  return shortcut.key.replace('ctrl+', '^');
}

function shortcutHintLabel(shortcut: KeyboardShortcut): string {
  const key = shortcutHintKey(shortcut);

  if ((key === 'j' || key === 'k') && shortcut.label.toLowerCase().startsWith('navigate')) {
    return 'navigate';
  }

  if (key === 'tab' && shortcut.label === 'Focus') {
    return 'focus';
  }

  if (key === 'enter' && shortcut.label === 'Select') {
    return 'select';
  }

  if (key === 'esc' && shortcut.label === 'Back') {
    return 'back';
  }

  return shortcut.label.toLowerCase();
}

function formatShortcutHint(shortcut: KeyboardShortcut): string {
  return `${shortcutHintKey(shortcut)}:${shortcutHintLabel(shortcut)}`;
}

function pickShortcuts(
  shortcuts: KeyboardShortcut[],
  keys: string[],
): KeyboardShortcut[] {
  return keys.flatMap((key) => shortcuts.filter((shortcut) => shortcut.key === key));
}

function uniqueShortcuts(shortcuts: KeyboardShortcut[]): KeyboardShortcut[] {
  const seen = new Set<string>();
  const ordered: KeyboardShortcut[] = [];

  for (const shortcut of shortcuts) {
    const id = getShortcutId(shortcut.key, shortcut.context);
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(shortcut);
  }

  return ordered;
}

function buildHintList(shortcuts: KeyboardShortcut[]): string[] {
  const entries: string[] = [];
  const hasJ = shortcuts.some((shortcut) => shortcut.key === 'j');
  const hasK = shortcuts.some((shortcut) => shortcut.key === 'k');
  const skipKeys = new Set<string>();

  if (hasJ && hasK) {
    entries.push('j/k:navigate');
    skipKeys.add('j');
    skipKeys.add('k');
  }

  for (const shortcut of shortcuts) {
    if (skipKeys.has(shortcut.key)) continue;
    entries.push(formatShortcutHint(shortcut));
  }

  return entries.slice(0, 6);
}

function matchesShortcutBinding(binding: string, input: string, key: Record<string, boolean>): boolean {
  if (binding.includes('+')) {
    const [modifier, value] = binding.split('+');
    if (modifier === 'ctrl') {
      return Boolean(key.ctrl) && input.toLowerCase() === value;
    }

    return false;
  }

  switch (binding) {
    case 'enter':
      return Boolean(key.return);
    case 'esc':
    case 'escape':
      return Boolean(key.escape);
    case 'tab':
      return Boolean(key.tab);
    case 'up':
      return Boolean(key.upArrow);
    case 'down':
      return Boolean(key.downArrow);
    default:
      return input === binding;
  }
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
   * Register a keyboard shortcut.
   */
  const registerShortcut = useCallback(
    (shortcut: KeyboardShortcut) => {
      const shortcutKey = getShortcutId(shortcut.key, shortcut.context);
      shortcutsRef.current.set(shortcutKey, shortcut);
    },
    []
  );

  /**
   * Unregister a keyboard shortcut.
   */
  const unregisterShortcut = useCallback(
    (key: string, context?: string | null) => {
      const shortcutKey = getShortcutId(key, context);
      shortcutsRef.current.delete(shortcutKey);
    },
    []
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

  const getAllShortcuts = useCallback((): KeyboardShortcut[] => {
    return Array.from(shortcutsRef.current.values());
  }, []);

  /**
   * Generate status bar hints from active shortcuts.
   * Format: "key:label" (e.g., "a:approve", "?:help")
   */
  const getStatusBarHints = useCallback((): string[] => {
    const activeShortcuts = getActiveShortcuts();
    const availableShortcuts = activeShortcuts.filter((shortcut) => !shortcut.condition || shortcut.condition());
    const contextShortcuts = availableShortcuts.filter((shortcut) => shortcut.scope === 'context');
    const globalShortcuts = availableShortcuts.filter((shortcut) => shortcut.scope === 'global');

    const prioritized = contextShortcuts.length > 0
      ? uniqueShortcuts([
          ...contextShortcuts,
          ...pickShortcuts(globalShortcuts, currentContext === 'run-detail'
            ? ['ctrl+l', 'esc', '?', 'ctrl+p']
            : ['tab', 'esc', '?', 'ctrl+p']),
        ])
      : uniqueShortcuts(
          pickShortcuts(globalShortcuts, currentContext === 'runs'
            ? ['j', 'k', 'enter', 'tab', '?', 'ctrl+p']
            : currentContext === 'main'
              ? ['esc', 'tab', '?', 'ctrl+p', 'q']
              : ['tab', 'esc', '?', 'ctrl+p', 'q'])
        );

    return buildHintList(prioritized);
  }, [currentContext, getActiveShortcuts]);

  /**
   * Handle keyboard input for registered shortcuts.
   */
  useInput(
    (input, key) => {
      if (!enabled) return;

      const activeShortcuts = getActiveShortcuts();

      for (const shortcut of activeShortcuts) {
        if (matchesShortcutBinding(shortcut.key, input, key as Record<string, boolean>)) {
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
    getAllShortcuts,
    getStatusBarHints,
  };
}
