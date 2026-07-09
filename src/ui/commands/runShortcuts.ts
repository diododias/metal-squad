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
  /** US2: cycle to the next section tab (Tab key). Wraps from last → first. */
  cycleSectionTabNext: () => void;
  /** US2: cycle to the previous section tab (Shift+Tab). Wraps from first → last. */
  cycleSectionTabPrev: () => void;
  /** US2: jump directly to section tab N (1-based, matches DETAIL_SECTION_ORDER). */
  selectSectionTab: (oneBasedIndex: number) => void;
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
    cycleSectionTabNext,
    cycleSectionTabPrev,
    selectSectionTab,
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
      key: 'tab',
      scope: 'context',
      context: 'run-detail',
      label: 'Next section',
      action: cycleSectionTabNext,
    },
    {
      key: 'shift+tab',
      scope: 'context',
      context: 'run-detail',
      label: 'Previous section',
      action: cycleSectionTabPrev,
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
    {
      key: '1',
      scope: 'context',
      context: 'run-detail',
      label: 'Section 1',
      action: (): void => { selectSectionTab(1); },
    },
    {
      key: '2',
      scope: 'context',
      context: 'run-detail',
      label: 'Section 2',
      action: (): void => { selectSectionTab(2); },
    },
    {
      key: '3',
      scope: 'context',
      context: 'run-detail',
      label: 'Section 3',
      action: (): void => { selectSectionTab(3); },
    },
    {
      key: '4',
      scope: 'context',
      context: 'run-detail',
      label: 'Section 4',
      action: (): void => { selectSectionTab(4); },
    },
    {
      key: '5',
      scope: 'context',
      context: 'run-detail',
      label: 'Section 5',
      action: (): void => { selectSectionTab(5); },
    },
    {
      key: '6',
      scope: 'context',
      context: 'run-detail',
      label: 'Section 6',
      action: (): void => { selectSectionTab(6); },
    },
    {
      key: '7',
      scope: 'context',
      context: 'run-detail',
      label: 'Section 7',
      action: (): void => { selectSectionTab(7); },
    },
  ];
}
