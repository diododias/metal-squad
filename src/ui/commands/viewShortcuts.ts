import type { KeyboardShortcut } from '../types/shortcuts.js';

interface ViewShortcutOptions {
  canToggleLogs: boolean;
  canPauseOutput: boolean;
  hasTabs: boolean;
  canStart: boolean;
  canAdjustDashboardPeriod: boolean;
  openPalette: () => void;
  openHelp: () => void;
  toggleLogs: () => void;
  toggleOutputPause: () => void;
  toggleNotifications: () => void;
  toggleDashboard: () => void;
  startSelectedFeature: () => void;
  previousDashboardPeriod: () => void;
  nextDashboardPeriod: () => void;
  switchToTab: (tabIndex: number) => void;
}

export function createViewShortcuts(options: ViewShortcutOptions): KeyboardShortcut[] {
  const {
    canToggleLogs,
    canPauseOutput,
    hasTabs,
    canStart,
    canAdjustDashboardPeriod,
    openPalette,
    openHelp,
    toggleLogs,
    toggleOutputPause,
    toggleNotifications,
    toggleDashboard,
    startSelectedFeature,
    previousDashboardPeriod,
    nextDashboardPeriod,
    switchToTab,
  } = options;

  return [
    {
      key: 'ctrl+p',
      scope: 'global',
      label: 'Palette',
      action: openPalette,
    },
    {
      key: ':',
      scope: 'global',
      label: 'Palette',
      action: openPalette,
    },
    {
      key: '?',
      scope: 'global',
      label: 'Help',
      action: openHelp,
    },
    {
      key: 'ctrl+l',
      scope: 'global',
      label: 'Logs',
      condition: () => canToggleLogs,
      action: toggleLogs,
    },
    {
      key: 'ctrl+s',
      scope: 'global',
      label: 'Pause logs',
      condition: () => canPauseOutput,
      action: toggleOutputPause,
    },
    {
      key: 'o',
      scope: 'global',
      label: 'Notifications',
      action: toggleNotifications,
    },
    {
      key: 'd',
      scope: 'global',
      label: 'Stats',
      action: toggleDashboard,
    },
    {
      key: 'n',
      scope: 'global',
      label: 'Start feature',
      condition: () => canStart,
      action: startSelectedFeature,
    },
    {
      key: '[',
      scope: 'global',
      label: 'Prev period',
      condition: () => canAdjustDashboardPeriod,
      action: previousDashboardPeriod,
    },
    {
      key: ']',
      scope: 'global',
      label: 'Next period',
      condition: () => canAdjustDashboardPeriod,
      action: nextDashboardPeriod,
    },
    ...(['1', '2', '3', '4', '5'] as const).map((key, index) => ({
      key,
      scope: 'global' as const,
      label: `Tab ${String(index + 1)}`,
      condition: (): boolean => hasTabs,
      action: (): void => { switchToTab(index); },
    })),
  ];
}
