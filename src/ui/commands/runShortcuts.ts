import type { KeyboardShortcut } from '../types/shortcuts.js';

interface RunShortcutOptions {
  canPause: boolean;
  canAbort: boolean;
  pause: () => void;
  abort: () => void;
  /** F31 section 5: the scrollable body has no native Ink scroll, so j/k
   * move one section at a time and PgUp/PgDn move a full page — both
   * scoped to run-detail so they don't collide with the global j/k that
   * move between kanban cards on the overview. */
  scrollSectionUp: () => void;
  scrollSectionDown: () => void;
  pageSectionUp: () => void;
  pageSectionDown: () => void;
  toggleDensity: () => void;
}

export function createRunShortcuts(options: RunShortcutOptions): KeyboardShortcut[] {
  const {
    canPause,
    canAbort,
    pause,
    abort,
    scrollSectionUp,
    scrollSectionDown,
    pageSectionUp,
    pageSectionDown,
    toggleDensity,
  } = options;

  return [
    {
      key: 'p',
      scope: 'context',
      context: 'run-detail',
      label: 'Pause',
      condition: () => canPause,
      action: pause,
    },
    {
      key: 'x',
      scope: 'context',
      context: 'run-detail',
      label: 'Abort',
      condition: () => canAbort,
      action: abort,
    },
    {
      key: 'k',
      scope: 'context',
      context: 'run-detail',
      label: 'Scroll up',
      action: scrollSectionUp,
    },
    {
      key: 'up',
      scope: 'context',
      context: 'run-detail',
      label: 'Scroll up',
      action: scrollSectionUp,
    },
    {
      key: 'j',
      scope: 'context',
      context: 'run-detail',
      label: 'Scroll down',
      action: scrollSectionDown,
    },
    {
      key: 'down',
      scope: 'context',
      context: 'run-detail',
      label: 'Scroll down',
      action: scrollSectionDown,
    },
    {
      key: 'pageup',
      scope: 'context',
      context: 'run-detail',
      label: 'Page up',
      action: pageSectionUp,
    },
    {
      key: 'pagedown',
      scope: 'context',
      context: 'run-detail',
      label: 'Page down',
      action: pageSectionDown,
    },
    {
      key: 'i',
      scope: 'context',
      context: 'run-detail',
      label: 'Toggle density',
      action: toggleDensity,
    },
  ];
}
