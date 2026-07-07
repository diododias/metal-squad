import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { spawn } from 'node:child_process';
import { useRuns, useTaskRuns } from './hooks/useRuns.js';
import { useGates } from './hooks/useGates.js';
import { useRunOutput } from './hooks/useRunOutput.js';
import { useTerminalWidth } from './hooks/useTerminalWidth.js';
import { useNotifications } from './hooks/useNotifications.js';
import { getFeatureCatalog, getPendingFeatures } from './catalog.js';
import { CommandBar } from './components/CommandBar.js';
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
}

function clampIndex(index: number, size: number): number {
  if (size <= 0) return 0;
  return Math.max(0, Math.min(index, size - 1));
}

function launchFeatureRun(featureId: string): void {
  spawn(process.execPath, [process.argv[1] ?? '', 'run', '--feature', featureId], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  }).unref();
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
  const activeView: ActiveView = selectedRun ? ui.activeView : 'overview';
  const featureCatalog = getFeatureCatalog();
  const selectedFeature = selectedRun ? featureCatalog[selectedRun.featureId] ?? null : null;
  const totalRuns = runs.length;
  const doneRuns = runs.filter((r) => r.status === 'done').length;
  const currentStage = taskRuns.find((t) => t.status === 'running')?.stage ?? undefined;
  const sidebarWidth = layoutMode === 'full' ? 34 : layoutMode === 'compact' ? 28 : width - 2;
  const mainWidth = layoutMode === 'stacked' ? width - 2 : Math.max(38, width - sidebarWidth - 5);

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
      setUi((current) => ({ ...current, activeView: 'overview', focusPanel: 'runs', outputPaused: false }));
      return;
    }

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

    if (focusPanel === 'gates' && gates.length > 0) {
      const gate = gates[selectedGateIndex];
      if (_input === 'a') {
        if (gate) resolve(gate.id, 'approved');
      } else if (_input === 's') {
        if (gate) resolve(gate.id, 'skipped');
      } else if (_input === 'r') {
        if (gate) resolve(gate.id, 'retried');
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
        width={width}
      />
    </Box>
  );
}
