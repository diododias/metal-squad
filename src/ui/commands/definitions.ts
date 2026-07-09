import { loadConfig } from '../../config/index.js';
import { msqEventBus } from '../../core/events/index.js';
import type { Command } from '../types/commands.js';

interface CommandDefinitionOptions {
  canPause: boolean;
  canResume: boolean;
  canAbort: boolean;
  canStart: boolean;
  canResolveGate: boolean;
  canRetryGate: boolean;
  focusContext: string;
  selectedFeatureId: string | null;
  togglePaletteHelp: () => void;
  toggleDashboard: () => void;
  toggleNotifications: () => void;
  pauseSelectedRun: () => void;
  resumeSelectedRun: () => void;
  abortSelectedRun: () => void;
  approveSelectedGate: () => void;
  skipSelectedGate: () => void;
  retrySelectedGate: () => void;
  forceApproveSelectedGate: () => void;
  startSelectedFeature: () => void;
  toggleDetailDensity: () => void;
  quit: () => void;
}

function showConfigSummary(): void {
  const config = loadConfig();
  const concurrency = typeof config.concurrency === 'number' ? String(config.concurrency) : 'default';
  msqEventBus.emit('ui:info', { message: `Config loaded: concurrency ${concurrency}` });
}

export function buildCommandDefinitions(options: CommandDefinitionOptions): Command[] {
  const {
    canPause,
    canResume,
    canAbort,
    canStart,
    canResolveGate,
    canRetryGate,
    focusContext,
    selectedFeatureId,
    togglePaletteHelp,
    toggleDashboard,
    toggleNotifications,
    pauseSelectedRun,
    resumeSelectedRun,
    abortSelectedRun,
    approveSelectedGate,
    skipSelectedGate,
    retrySelectedGate,
    forceApproveSelectedGate,
    startSelectedFeature,
    toggleDetailDensity,
    quit,
  } = options;

  return [
    {
      id: 'run-start',
      name: selectedFeatureId ? `Run ${selectedFeatureId}` : 'Run selected feature',
      description: 'Start the backlog feature currently highlighted in the overview list.',
      category: 'run',
      keywords: ['run', 'start', 'launch', 'feature', 'execute'],
      shortcut: 'n',
      available: () => canStart,
      execute: startSelectedFeature,
    },
    {
      id: 'run-pause',
      name: 'Pause run',
      description: 'Pause the selected pipeline.',
      category: 'run',
      keywords: ['pause', 'hold', 'suspend'],
      shortcut: focusContext === 'run-detail' ? 'p' : null,
      available: () => canPause,
      execute: pauseSelectedRun,
    },
    {
      id: 'run-resume',
      name: 'Resume run',
      description: 'Resume the selected paused pipeline.',
      category: 'run',
      keywords: ['resume', 'continue', 'unpause'],
      shortcut: null,
      available: () => canResume,
      execute: resumeSelectedRun,
    },
    {
      id: 'run-abort',
      name: 'Abort run',
      description: 'Abort the selected running pipeline.',
      category: 'run',
      keywords: ['abort', 'cancel', 'stop', 'terminate'],
      shortcut: focusContext === 'run-detail' ? 'x' : null,
      available: () => canAbort,
      execute: abortSelectedRun,
    },
    {
      id: 'gate-approve',
      name: 'Approve gate',
      description: 'Approve the selected pending gate.',
      category: 'gate',
      keywords: ['approve', 'gate', 'accept'],
      shortcut: 'a',
      available: () => canResolveGate,
      execute: approveSelectedGate,
    },
    {
      id: 'gate-skip',
      name: 'Skip gate',
      description: 'Skip the selected pending gate.',
      category: 'gate',
      keywords: ['skip', 'gate', 'bypass'],
      shortcut: 's',
      available: () => canResolveGate,
      execute: skipSelectedGate,
    },
    {
      id: 'gate-retry',
      name: 'Retry gate',
      description: 'Retry the selected failed gate.',
      category: 'gate',
      keywords: ['retry', 'gate', 'rerun'],
      shortcut: 'r',
      available: () => canRetryGate,
      execute: retrySelectedGate,
    },
    {
      id: 'gate-force-approve',
      name: 'Force-approve gate (bypass)',
      description: 'Force past the selected gate: approves it and, if it left the pipeline paused, resumes execution immediately.',
      category: 'gate',
      keywords: ['force', 'approve', 'gate', 'bypass', 'unblock', 'resume'],
      shortcut: 'F',
      available: () => canResolveGate,
      execute: forceApproveSelectedGate,
    },
    {
      // F31 section 5: `i` toggle — collapses/expands long detail sections.
      id: 'view-toggle-density',
      name: 'Toggle detail density',
      description: 'Collapse or expand the long sections in the run detail screen.',
      category: 'view',
      keywords: ['density', 'expand', 'collapse', 'detail', 'compact'],
      shortcut: focusContext === 'run-detail' ? 'i' : null,
      available: () => focusContext === 'run-detail',
      execute: toggleDetailDensity,
    },
    {
      id: 'view-stats',
      name: 'Toggle telemetry dashboard',
      description: 'Open or close the token and context telemetry dashboard.',
      category: 'view',
      keywords: ['stats', 'dashboard', 'analytics', 'tokens', 'context'],
      shortcut: 'd',
      available: () => true,
      execute: toggleDashboard,
    },
    {
      id: 'view-notifications',
      name: 'Toggle notifications',
      description: 'Open or close the notifications view.',
      category: 'view',
      keywords: ['notifications', 'events', 'feed'],
      shortcut: 'o',
      available: () => true,
      execute: toggleNotifications,
    },
    {
      id: 'view-help',
      name: 'Show help overlay',
      description: 'List all available keyboard shortcuts.',
      category: 'view',
      keywords: ['help', 'shortcuts', 'keys', 'overlay'],
      shortcut: '?',
      available: () => true,
      execute: togglePaletteHelp,
    },
    {
      id: 'system-config',
      name: 'Show config summary',
      description: 'Print the currently loaded configuration in the event stream.',
      category: 'system',
      keywords: ['config', 'configuration', 'settings'],
      shortcut: null,
      available: () => true,
      execute: showConfigSummary,
    },
    {
      id: 'system-quit',
      name: 'Quit',
      description: 'Exit the TUI immediately.',
      category: 'system',
      keywords: ['quit', 'exit', 'close'],
      shortcut: 'q',
      available: () => true,
      execute: quit,
    },
  ];
}
