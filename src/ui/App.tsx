import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { spawn } from 'node:child_process';
import { loadConfig } from '../config/index.js';
import { loadBacklog } from '../core/backlog/load.js';
import { msqEventBus } from '../core/events/index.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { assertWritableDbPath } from '../db/index.js';
import { abortPipeline, pausePipeline, requestFeatureAbort, resumePipeline } from '../db/repo.js';
import { getFeatureCatalog, getPendingFeatures } from './catalog.js';
import { buildCommandDefinitions } from './commands/definitions.js';
import { createGatesShortcuts } from './commands/gatesShortcuts.js';
import { createGlobalShortcuts } from './commands/globalShortcuts.js';
import { commandRegistry } from './commands/registry.js';
import { createRunShortcuts } from './commands/runShortcuts.js';
import { createViewShortcuts } from './commands/viewShortcuts.js';
import { CommandBar } from './components/CommandBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { CostDashboard } from './components/CostDashboard.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { MainPanel } from './components/MainPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { StatusBar } from './components/StatusBar.js';
import { getLayoutMode } from './format.js';
import { useCommandPalette } from './hooks/useCommandPalette.js';
import { useGates } from './hooks/useGates.js';
import type { PendingApproval } from './hooks/useGates.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useRunBreakdown } from './hooks/useRunBreakdown.js';
import { useRunOutput } from './hooks/useRunOutput.js';
import { useRuns, useTaskRuns } from './hooks/useRuns.js';
import { useStatsRows } from './hooks/useStatsRows.js';
import { useTerminalWidth } from './hooks/useTerminalWidth.js';
import type { ActiveView } from './components/MainPanel.js';

type FocusPanel = 'runs' | 'gates' | 'main';
type ShortcutContext = FocusPanel | 'run-detail';

interface UiState {
  selectedRun: number;
  selectedGate: number;
  selectedPending: number;
  focusPanel: FocusPanel;
  activeView: ActiveView;
  outputPaused: boolean;
  logsVisible: boolean;
  dashboard?: boolean;
  dashboardPeriod?: number;
}

const DASHBOARD_PERIODS: Array<{ label: string; days: number | null }> = [
  { label: 'today', days: 1 },
  { label: 'last 7 days', days: 7 },
  { label: 'last 30 days', days: 30 },
  { label: 'all time', days: null },
];

function clampIndex(index: number, size: number): number {
  if (size <= 0) return 0;
  return Math.max(0, Math.min(index, size - 1));
}

function formatStartError(featureId: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Could not start ${featureId}: ${message}`;
}

function validateFeatureStart(cwd: string): void {
  assertWritableDbPath();
  loadConfig();
  const backlog = loadBacklog(undefined, cwd);
  validateBacklogSkills(backlog, cwd);
}

function launchFeatureRun(featureId: string): void {
  const cwd = process.cwd();
  try {
    validateFeatureStart(cwd);
  } catch (error) {
    msqEventBus.emit('ui:notice', { message: formatStartError(featureId, error) });
    return;
  }

  const entrypoint = process.argv[1];
  if (!entrypoint) {
    msqEventBus.emit('ui:notice', {
      message: `Could not start ${featureId}: CLI entrypoint was not resolved.`,
    });
    return;
  }

  const child = spawn(process.execPath, [...process.execArgv, entrypoint, 'run', '--feature', featureId], {
    detached: true,
    stdio: 'ignore',
    cwd,
  });
  child.once('error', (error) => {
    msqEventBus.emit('ui:notice', { message: formatStartError(featureId, error) });
  });
  child.unref();
  msqEventBus.emit('ui:info', { message: `Starting ${featureId}...` });
}

export function App(): React.ReactElement {
  const runs = useRuns(2000);
  const { gates, resolve } = useGates(2000);
  const notifications = useNotifications(40);
  const width = useTerminalWidth();
  const [ui, setUi] = useState<UiState>({
    selectedRun: 0,
    selectedGate: 0,
    selectedPending: 0,
    focusPanel: 'runs',
    activeView: 'overview',
    outputPaused: false,
    logsVisible: true,
  });
  const [helpOpen, setHelpOpen] = useState(false);

  const layoutMode = getLayoutMode(width);
  const selectedRunIndex = clampIndex(ui.selectedRun, runs.length);
  const selectedGateIndex = clampIndex(ui.selectedGate, gates.length);
  const focusOrder: FocusPanel[] = gates.length > 0 ? ['runs', 'gates', 'main'] : ['runs', 'main'];
  const focusPanel = ui.focusPanel === 'gates' && gates.length === 0 ? 'runs' : ui.focusPanel;
  const selectedRun = runs[selectedRunIndex] ?? null;
  const selectedGate = gates[selectedGateIndex] ?? null;
  const liveOutput = useRunOutput(
    selectedRun ? selectedRun.runId : null,
    ui.outputPaused ? 1_500 : 350,
  );
  const taskRuns = useTaskRuns(selectedRun ? selectedRun.runId : null);
  const runBreakdown = useRunBreakdown(
    selectedRun ? selectedRun.runId : null,
    selectedRun?.startedAt ?? null,
    selectedRun?.endedAt ?? null,
  );
  const activeView: ActiveView = ui.activeView === 'notifications'
    ? 'notifications'
    : selectedRun
      ? ui.activeView
      : 'overview';
  const dashboardOpen = Boolean(ui.dashboard);
  const dashboardPeriodIndex = Math.min(ui.dashboardPeriod ?? 1, DASHBOARD_PERIODS.length - 1);
  const dashboardPeriod = DASHBOARD_PERIODS[dashboardPeriodIndex] ?? DASHBOARD_PERIODS[1]!;
  const statsRows = useStatsRows(dashboardOpen, dashboardPeriod.days);
  const featureCatalog = getFeatureCatalog();
  const selectedFeature = selectedRun ? featureCatalog[selectedRun.featureId] ?? null : null;
  const totalRuns = runs.length;
  const doneRuns = runs.filter((run) => run.status === 'done').length;
  const currentStage = taskRuns.find((task) => task.status === 'running')?.stage
    ?? selectedRun?.pipelineCurrentStage
    ?? undefined;
  const sidebarWidth = layoutMode === 'full' ? 42 : layoutMode === 'compact' ? 36 : width - 2;
  const mainWidth = layoutMode === 'stacked' ? width - 2 : Math.max(38, width - sidebarWidth - 5);
  const canPause = Boolean(selectedRun?.pipelineId && selectedRun.pipelineStatus === 'running');
  const canResume = Boolean(selectedRun?.pipelineId && selectedRun.pipelineStatus === 'paused');
  const canAbortFeature = Boolean(selectedRun?.pipelineId && selectedRun.status === 'running');
  const canAbortPipeline = Boolean(
    selectedRun?.pipelineId
      && (selectedRun.pipelineStatus === 'running' || selectedRun.pipelineStatus === 'paused'),
  );
  const canResolveGate = Boolean(selectedGate);
  const canRetryGate = Boolean(selectedGate);
  const activeFeatureIds = new Set(
    runs.filter((run) => run.status === 'running' || run.status === 'done').map((run) => run.featureId),
  );
  const pendingFeatures = getPendingFeatures(featureCatalog, activeFeatureIds);
  const selectedPendingIndex = clampIndex(ui.selectedPending, pendingFeatures.length);
  const selectedPending = pendingFeatures[selectedPendingIndex] ?? null;
  const focusContext: ShortcutContext = activeView === 'run' && focusPanel === 'main' ? 'run-detail' : focusPanel;
  const hasTabs = false;

  const quit = useCallback(() => {
    process.exit(0);
  }, []);

  const cycleFocus = useCallback(() => {
    if (dashboardOpen) return;

    const currentIndex = focusOrder.indexOf(focusPanel);
    const nextFocus = focusOrder[(currentIndex + 1) % focusOrder.length] ?? 'runs';
    setUi((current) => ({ ...current, focusPanel: nextFocus }));
  }, [dashboardOpen, focusOrder, focusPanel]);

  const escapeView = useCallback(() => {
    setUi((current) => ({
      ...current,
      activeView: 'overview',
      focusPanel: 'runs',
      outputPaused: false,
      dashboard: false,
    }));
  }, []);

  const toggleNotifications = useCallback(() => {
    setUi((current) => ({
      ...current,
      dashboard: false,
      activeView: current.activeView === 'notifications' ? 'overview' : 'notifications',
      focusPanel: 'main',
    }));
  }, []);

  const toggleDashboard = useCallback(() => {
    setUi((current) => ({
      ...current,
      dashboard: !current.dashboard,
      activeView: 'overview',
      focusPanel: 'main',
    }));
  }, []);

  const previousDashboardPeriod = useCallback(() => {
    setUi((current) => ({
      ...current,
      dashboardPeriod: ((current.dashboardPeriod ?? 1) - 1 + DASHBOARD_PERIODS.length) % DASHBOARD_PERIODS.length,
    }));
  }, []);

  const nextDashboardPeriod = useCallback(() => {
    setUi((current) => ({
      ...current,
      dashboardPeriod: ((current.dashboardPeriod ?? 1) + 1) % DASHBOARD_PERIODS.length,
    }));
  }, []);

  const toggleLogs = useCallback(() => {
    if (activeView !== 'run') return;
    setUi((current) => ({ ...current, logsVisible: !current.logsVisible }));
  }, [activeView]);

  const toggleOutputPause = useCallback(() => {
    if (activeView !== 'run' || !selectedRun) return;
    setUi((current) => ({ ...current, outputPaused: !current.outputPaused }));
  }, [activeView, selectedRun]);

  const pauseSelectedRun = useCallback(() => {
    if (canPause && selectedRun?.pipelineId) {
      pausePipeline(selectedRun.pipelineId);
    }
  }, [canPause, selectedRun]);

  const resumeSelectedRun = useCallback(() => {
    if (canResume && selectedRun?.pipelineId) {
      resumePipeline(selectedRun.pipelineId);
    }
  }, [canResume, selectedRun]);

  const abortSelectedRun = useCallback(() => {
    if (!selectedRun?.pipelineId) return;

    if (canAbortFeature) {
      requestFeatureAbort(selectedRun.pipelineId, selectedRun.featureId);
      return;
    }

    if (canAbortPipeline) {
      abortPipeline(selectedRun.pipelineId);
    }
  }, [canAbortFeature, canAbortPipeline, selectedRun]);

  const approveSelectedGate = useCallback(() => {
    if (!selectedGate) return;
    const decision = selectedGate.kind === 'stage' ? 'advance' : 'approved';
    resolve(selectedGate, decision);
    announceGateDecision(selectedGate, 'approved');
  }, [resolve, selectedGate]);

  const skipSelectedGate = useCallback(() => {
    if (!selectedGate) return;
    const decision = selectedGate.kind === 'stage' ? 'hold' : 'skipped';
    resolve(selectedGate, decision);
    announceGateDecision(selectedGate, selectedGate.kind === 'stage' ? 'hold' : 'skipped');
  }, [resolve, selectedGate]);

  const retrySelectedGate = useCallback(() => {
    if (!selectedGate) return;
    resolve(selectedGate, 'retried');
    announceGateDecision(selectedGate, 'retried');
  }, [resolve, selectedGate]);

  const startSelectedFeature = useCallback(() => {
    if (activeView !== 'overview' || !selectedPending) return;
    launchFeatureRun(selectedPending.id);
  }, [activeView, selectedPending]);

  const movePrevious = useCallback(() => {
    if (dashboardOpen || activeView === 'notifications') return;

    if (activeView === 'overview' && pendingFeatures.length > 0 && focusPanel === 'main') {
      setUi((current) => ({
        ...current,
        selectedPending: clampIndex(selectedPendingIndex - 1, pendingFeatures.length),
      }));
      return;
    }

    if (focusPanel === 'runs') {
      setUi((current) => ({
        ...current,
        selectedRun: clampIndex(selectedRunIndex - 1, runs.length),
      }));
      return;
    }

    if (focusPanel === 'gates') {
      setUi((current) => ({
        ...current,
        selectedGate: clampIndex(selectedGateIndex - 1, gates.length),
      }));
    }
  }, [
    activeView,
    dashboardOpen,
    focusPanel,
    gates.length,
    pendingFeatures.length,
    runs.length,
    selectedGateIndex,
    selectedPendingIndex,
    selectedRunIndex,
  ]);

  const moveNext = useCallback(() => {
    if (dashboardOpen || activeView === 'notifications') return;

    if (activeView === 'overview' && pendingFeatures.length > 0 && focusPanel === 'main') {
      setUi((current) => ({
        ...current,
        selectedPending: clampIndex(selectedPendingIndex + 1, pendingFeatures.length),
      }));
      return;
    }

    if (focusPanel === 'runs') {
      setUi((current) => ({
        ...current,
        selectedRun: clampIndex(selectedRunIndex + 1, runs.length),
      }));
      return;
    }

    if (focusPanel === 'gates') {
      setUi((current) => ({
        ...current,
        selectedGate: clampIndex(selectedGateIndex + 1, gates.length),
      }));
    }
  }, [
    activeView,
    dashboardOpen,
    focusPanel,
    gates.length,
    pendingFeatures.length,
    runs.length,
    selectedGateIndex,
    selectedPendingIndex,
    selectedRunIndex,
  ]);

  const openSelection = useCallback(() => {
    if (dashboardOpen || activeView === 'notifications') return;
    if (selectedRun && focusPanel === 'runs') {
      setUi((current) => ({ ...current, activeView: 'run', focusPanel: 'main' }));
      return;
    }
    if (focusPanel === 'main' && activeView === 'overview' && selectedPending) {
      startSelectedFeature();
    }
  }, [activeView, dashboardOpen, focusPanel, selectedRun, selectedPending, startSelectedFeature]);

  const switchToTab = useCallback((_tabIndex: number) => {
    // The current TUI does not expose numbered tabs yet.
  }, []);

  const commands = useMemo(
    () => buildCommandDefinitions({
      canPause,
      canResume,
      canAbort: canAbortFeature || canAbortPipeline,
      canStart: Boolean(selectedPending),
      canResolveGate,
      canRetryGate,
      focusContext,
      selectedFeatureId: selectedPending?.id ?? null,
      togglePaletteHelp: () => setHelpOpen(true),
      toggleDashboard,
      toggleNotifications,
      pauseSelectedRun,
      resumeSelectedRun,
      abortSelectedRun,
      approveSelectedGate,
      skipSelectedGate,
      retrySelectedGate,
      startSelectedFeature,
      quit,
    }),
    [
      abortSelectedRun,
      approveSelectedGate,
      canAbortFeature,
      canAbortPipeline,
      canPause,
      canResolveGate,
      canResume,
      canRetryGate,
      focusContext,
      pauseSelectedRun,
      quit,
      resumeSelectedRun,
      retrySelectedGate,
      selectedPending,
      skipSelectedGate,
      startSelectedFeature,
      toggleDashboard,
      toggleNotifications,
    ],
  );

  useEffect(() => {
    commandRegistry.clear();
    for (const command of commands) {
      commandRegistry.register(command);
    }

    return () => {
      commandRegistry.clear();
    };
  }, [commands]);

  const {
    state: paletteState,
    open: openPaletteState,
    close: closePaletteState,
    setQuery: setPaletteQuery,
    selectPrevious: selectPreviousPaletteCommand,
    selectNext: selectNextPaletteCommand,
    executeSelected: executeSelectedPaletteCommand,
  } = useCommandPalette({ commands });

  const openPalette = useCallback(() => {
    setHelpOpen(false);
    openPaletteState();
  }, [openPaletteState]);

  const openHelp = useCallback(() => {
    closePaletteState();
    setHelpOpen(true);
  }, [closePaletteState]);

  const {
    registerShortcut,
    unregisterShortcut,
    getAllShortcuts,
    getStatusBarHints,
  } = useKeyboardShortcuts({
    currentContext: focusContext,
    enabled: !paletteState.isOpen && !helpOpen,
  });

  const globalShortcuts = useMemo(
    () => createGlobalShortcuts({
      canNavigateRuns: focusPanel === 'runs' && runs.length > 0,
      canNavigateGates: focusPanel === 'gates' && gates.length > 0,
      canMovePending: activeView === 'overview' && focusPanel === 'main' && pendingFeatures.length > 0,
      movePrevious,
      moveNext,
      enter: openSelection,
      escape: escapeView,
      cycleFocus,
      quit,
    }),
    [activeView, cycleFocus, escapeView, focusPanel, gates.length, moveNext, movePrevious, openSelection, pendingFeatures.length, quit, runs.length],
  );

  const viewShortcuts = useMemo(
    () => createViewShortcuts({
      canToggleLogs: activeView === 'run',
      canPauseOutput: activeView === 'run' && Boolean(selectedRun),
      hasTabs,
      canStart: Boolean(selectedPending) && activeView === 'overview',
      canAdjustDashboardPeriod: dashboardOpen,
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
    }),
    [
      activeView,
      dashboardOpen,
      hasTabs,
      nextDashboardPeriod,
      openHelp,
      openPalette,
      previousDashboardPeriod,
      selectedPending,
      selectedRun,
      startSelectedFeature,
      switchToTab,
      toggleDashboard,
      toggleLogs,
      toggleOutputPause,
      toggleNotifications,
    ],
  );

  const gatesShortcuts = useMemo(
    () => createGatesShortcuts({
      canResolve: canResolveGate,
      canRetry: canRetryGate,
      approve: approveSelectedGate,
      skip: skipSelectedGate,
      retry: retrySelectedGate,
    }),
    [approveSelectedGate, canResolveGate, canRetryGate, retrySelectedGate, skipSelectedGate],
  );

  const runShortcuts = useMemo(
    () => createRunShortcuts({
      canPause,
      canAbort: canAbortFeature || canAbortPipeline,
      pause: pauseSelectedRun,
      abort: abortSelectedRun,
    }),
    [abortSelectedRun, canAbortFeature, canAbortPipeline, canPause, pauseSelectedRun],
  );

  useEffect(() => {
    const allShortcuts = [...globalShortcuts, ...viewShortcuts, ...gatesShortcuts, ...runShortcuts];
    for (const shortcut of allShortcuts) {
      registerShortcut(shortcut);
    }

    return () => {
      for (const shortcut of allShortcuts) {
        unregisterShortcut(shortcut.key, shortcut.context);
      }
    };
  }, [gatesShortcuts, globalShortcuts, registerShortcut, runShortcuts, unregisterShortcut, viewShortcuts]);

  useEffect(() => {
    if (activeView !== 'run' && !ui.logsVisible) {
      setUi((current) => ({ ...current, logsVisible: true }));
    }
  }, [activeView, ui.logsVisible]);

  const shortcutHints = helpOpen
    ? ['?:close help', 'esc:close help', '^p:palette']
    : paletteState.isOpen
      ? ['type:search', 'enter:execute', 'esc:close', 'j/k:navigate']
      : getStatusBarHints();

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text color="cyan" bold>
          {'█▀▄▀█ █▀▀ ▀█▀ ▄▀█ █   ▀   █▀ █▀█ █ █ ▄▀█ █▀▄'}
        </Text>
      </Box>
      <Box>
        <Text color="cyan" bold>
          {'█░▀░█ ██▄  █  █▀█ █▄▄     ▄█ ▀▀█ █▄█ █▀█ █▄▀'}
        </Text>
      </Box>
      <Text dimColor>{layoutMode === 'stacked' ? 'single-column layout' : `${layoutMode} split layout`}</Text>
      {dashboardOpen ? (
        <Box marginTop={1}>
          <CostDashboard rows={statsRows} periodLabel={dashboardPeriod.label} width={width - 2} />
        </Box>
      ) : (
        <Box flexDirection={layoutMode === 'stacked' ? 'column' : 'row'} marginTop={1}>
          <MainPanel
            runs={runs}
            gates={gates}
            selectedRun={selectedRun}
            selectedRunIndex={selectedRunIndex}
            selectedFeature={selectedFeature}
            activeView={activeView}
            output={liveOutput}
            outputPaused={ui.outputPaused}
            logsVisible={ui.logsVisible}
            focusPanel={focusPanel}
            mode={layoutMode}
            width={mainWidth}
            pendingFeatures={pendingFeatures}
            selectedPendingIndex={selectedPendingIndex}
            breakdown={runBreakdown}
            taskRuns={taskRuns}
            notifications={notifications}
          />
          <Sidebar
            runs={runs}
            gates={gates}
            notifications={notifications}
            selectedRunIndex={selectedRunIndex}
            selectedGateIndex={selectedGateIndex}
            focusPanel={focusPanel}
            activeView={activeView}
            skills={selectedFeature?.skills ?? []}
            taskRuns={taskRuns}
            width={sidebarWidth}
            mode={layoutMode}
          />
        </Box>
      )}
      <StatusBar
        selectedRun={selectedRun}
        selectedFeature={selectedFeature}
        gateCount={gates.length}
        totalRuns={totalRuns}
        doneRuns={doneRuns}
        width={width}
        currentStage={currentStage}
        activeView={activeView}
        shortcutHints={shortcutHints}
      />
      <CommandBar
        activeView={activeView}
        focusPanel={focusPanel}
        hasRuns={runs.length > 0}
        hasGates={gates.length > 0}
        hasPending={pendingFeatures.length > 0}
        canPause={canPause}
        canResume={canResume}
        canAbort={canAbortFeature || canAbortPipeline}
        dashboardOpen={dashboardOpen}
        width={width}
      />
      <CommandPalette
        state={paletteState}
        width={width}
        onClose={closePaletteState}
        onExecute={executeSelectedPaletteCommand}
        onSelectPrevious={selectPreviousPaletteCommand}
        onSelectNext={selectNextPaletteCommand}
        onQueryChange={setPaletteQuery}
      />
      <HelpOverlay
        isOpen={helpOpen}
        currentContext={focusContext}
        shortcuts={getAllShortcuts()}
        width={width}
        onClose={() => setHelpOpen(false)}
        onOpenPalette={openPalette}
      />
    </Box>
  );
}

function announceGateDecision(gate: PendingApproval, decision: 'approved' | 'skipped' | 'retried' | 'hold'): void {
  if (gate.kind === 'stage') {
    const message = decision === 'approved'
      ? `${gate.featureId} approval accepted`
      : decision === 'hold'
        ? `${gate.featureId} kept on hold; approval will remain pending`
        : `${gate.featureId} approval ${decision}`;
    msqEventBus.emit('ui:info', { message });
    return;
  }

  msqEventBus.emit('ui:info', { message: `${gate.featureId} gate ${decision}` });
}
