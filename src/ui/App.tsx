import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { spawn } from 'node:child_process';
import { loadConfig } from '../config/index.js';
import { loadBacklog } from '../core/backlog/load.js';
import { msqEventBus } from '../core/events/index.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { assertWritableDbPath } from '../db/index.js';
import { abortPipeline, pausePipeline, requestFeatureAbort, resumePipeline } from '../db/repo.js';
import { useRuns, useTaskRuns } from './hooks/useRuns.js';
import { useGates } from './hooks/useGates.js';
import { useRunOutput } from './hooks/useRunOutput.js';
import { useRunBreakdown } from './hooks/useRunBreakdown.js';
import { useTerminalWidth } from './hooks/useTerminalWidth.js';
import { useNotifications } from './hooks/useNotifications.js';
import { getFeatureCatalog, getPendingFeatures } from './catalog.js';
import { CommandBar } from './components/CommandBar.js';
import { CostDashboard } from './components/CostDashboard.js';
import { useStatsRows } from './hooks/useStatsRows.js';
import { MainPanel } from './components/MainPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { StatusBar } from './components/StatusBar.js';
import { getLayoutMode } from './format.js';

type FocusPanel = 'runs' | 'gates' | 'main';
type ActiveView = 'overview' | 'run';

interface UiState {
  selectedRun: number;
  selectedGate: number;
  selectedPending: number;
  focusPanel: FocusPanel;
  activeView: ActiveView;
  outputPaused: boolean;
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
  const notifications = useNotifications(12);
  const width = useTerminalWidth();
  const [ui, setUi] = useState<UiState>({
    selectedRun: 0,
    selectedGate: 0,
    selectedPending: 0,
    focusPanel: 'runs',
    activeView: 'overview',
    outputPaused: false,
  });
  const layoutMode = getLayoutMode(width);
  const selectedRunIndex = clampIndex(ui.selectedRun, runs.length);
  const selectedGateIndex = clampIndex(ui.selectedGate, gates.length);
  const focusOrder: FocusPanel[] = gates.length > 0 ? ['runs', 'gates', 'main'] : ['runs', 'main'];
  const focusPanel = ui.focusPanel === 'gates' && gates.length === 0 ? 'runs' : ui.focusPanel;
  const selectedRun = runs[selectedRunIndex] ?? null;
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
  const activeView: ActiveView = selectedRun ? ui.activeView : 'overview';
  const dashboardOpen = Boolean(ui.dashboard);
  const dashboardPeriodIndex = Math.min(ui.dashboardPeriod ?? 1, DASHBOARD_PERIODS.length - 1);
  const dashboardPeriod = DASHBOARD_PERIODS[dashboardPeriodIndex] ?? DASHBOARD_PERIODS[1]!;
  const statsRows = useStatsRows(dashboardOpen, dashboardPeriod.days);
  const featureCatalog = getFeatureCatalog();
  const selectedFeature = selectedRun ? featureCatalog[selectedRun.featureId] ?? null : null;
  const totalRuns = runs.length;
  const doneRuns = runs.filter((r) => r.status === 'done').length;
  const currentStage = taskRuns.find((t) => t.status === 'running')?.stage
    ?? selectedRun?.pipelineCurrentStage
    ?? undefined;
  const sidebarWidth = layoutMode === 'full' ? 34 : layoutMode === 'compact' ? 28 : width - 2;
  const mainWidth = layoutMode === 'stacked' ? width - 2 : Math.max(38, width - sidebarWidth - 5);
  const canPause = Boolean(selectedRun?.pipelineId && selectedRun.pipelineStatus === 'running');
  const canResume = Boolean(selectedRun?.pipelineId && selectedRun.pipelineStatus === 'paused');
  const canAbortFeature = Boolean(selectedRun?.pipelineId && selectedRun.status === 'running');
  const canAbortPipeline = Boolean(
    selectedRun?.pipelineId
      && (selectedRun.pipelineStatus === 'running' || selectedRun.pipelineStatus === 'paused'),
  );

  const activeFeatureIds = new Set(
    runs.filter((r) => r.status === 'running' || r.status === 'done').map((r) => r.featureId),
  );
  const pendingFeatures = getPendingFeatures(featureCatalog, activeFeatureIds);
  const selectedPendingIndex = clampIndex(ui.selectedPending, pendingFeatures.length);

  useInput((_input, key) => {
    if (_input === 'q') {
      process.exit(0);
      return;
    }

    if (key.tab) {
      const currentIndex = focusOrder.indexOf(focusPanel);
      const nextFocus = focusOrder[(currentIndex + 1) % focusOrder.length] ?? 'runs';
      setUi((current) => ({ ...current, focusPanel: nextFocus }));
      return;
    }

    if (key.escape) {
      setUi((current) => ({ ...current, activeView: 'overview', focusPanel: 'runs', outputPaused: false, dashboard: false }));
      return;
    }

    if (_input === 'd') {
      setUi((current) => ({ ...current, dashboard: !current.dashboard }));
      return;
    }

    if (dashboardOpen && (_input === '[' || _input === ']')) {
      const delta = _input === '[' ? -1 : 1;
      setUi((current) => ({
        ...current,
        dashboardPeriod: (dashboardPeriodIndex + delta + DASHBOARD_PERIODS.length) % DASHBOARD_PERIODS.length,
      }));
      return;
    }

    if (dashboardOpen) return;

    if (key.ctrl && _input.toLowerCase() === 's' && selectedRun && activeView === 'run') {
      setUi((current) => ({ ...current, outputPaused: !current.outputPaused }));
      return;
    }

    if (_input === 'n' && activeView === 'overview' && pendingFeatures.length > 0) {
      const target = pendingFeatures[selectedPendingIndex];
      if (target) launchFeatureRun(target.id);
      return;
    }

    const movePrev = key.upArrow || _input === 'k';
    const moveNext = key.downArrow || _input === 'j';

    if (movePrev) {
      if (activeView === 'overview' && pendingFeatures.length > 0 && focusPanel === 'runs') {
        setUi((current) => ({
          ...current,
          selectedPending: clampIndex(selectedPendingIndex - 1, pendingFeatures.length),
        }));
      } else if (focusPanel === 'runs') {
        setUi((current) => ({
          ...current,
          selectedRun: clampIndex(selectedRunIndex - 1, runs.length),
        }));
      } else if (focusPanel === 'gates') {
        setUi((current) => ({
          ...current,
          selectedGate: clampIndex(selectedGateIndex - 1, gates.length),
        }));
      }
      return;
    }

    if (moveNext) {
      if (activeView === 'overview' && pendingFeatures.length > 0 && focusPanel === 'runs') {
        setUi((current) => ({
          ...current,
          selectedPending: clampIndex(selectedPendingIndex + 1, pendingFeatures.length),
        }));
      } else if (focusPanel === 'runs') {
        setUi((current) => ({
          ...current,
          selectedRun: clampIndex(selectedRunIndex + 1, runs.length),
        }));
      } else if (focusPanel === 'gates') {
        setUi((current) => ({
          ...current,
          selectedGate: clampIndex(selectedGateIndex + 1, gates.length),
        }));
      }
      return;
    }

    if (key.return && selectedRun && focusPanel === 'runs') {
      setUi((current) => ({ ...current, activeView: 'run', focusPanel: 'main' }));
      return;
    }

    if (focusPanel !== 'gates' && _input === 'p' && canPause && selectedRun?.pipelineId) {
      pausePipeline(selectedRun.pipelineId);
      return;
    }

    if (focusPanel !== 'gates' && _input === 'r' && canResume && selectedRun?.pipelineId) {
      resumePipeline(selectedRun.pipelineId);
      return;
    }

    if (_input === 'x' && selectedRun?.pipelineId) {
      if (focusPanel === 'runs' && canAbortFeature) {
        requestFeatureAbort(selectedRun.pipelineId, selectedRun.featureId);
      } else if (canAbortPipeline) {
        abortPipeline(selectedRun.pipelineId);
      }
      return;
    }

    if (focusPanel === 'gates' && gates.length > 0) {
      const gate = gates[selectedGateIndex];
      if (_input === 'a') {
        if (gate) resolve(gate, gate.kind === 'stage' ? 'advance' : 'approved');
      } else if (_input === 's') {
        if (gate) resolve(gate, gate.kind === 'stage' ? 'hold' : 'skipped');
      } else if (_input === 'r') {
        if (gate) resolve(gate, 'retried');
      }
    }
  });

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
          selectedFeature={selectedFeature}
          activeView={activeView}
          output={liveOutput}
          outputPaused={ui.outputPaused}
          mode={layoutMode}
          width={mainWidth}
          pendingFeatures={pendingFeatures}
          selectedPendingIndex={selectedPendingIndex}
          breakdown={runBreakdown}
        />
        <Sidebar
          runs={runs}
          gates={gates}
          notifications={notifications}
          selectedRunIndex={selectedRunIndex}
          selectedGateIndex={selectedGateIndex}
          focusPanel={focusPanel}
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
    </Box>
  );
}
