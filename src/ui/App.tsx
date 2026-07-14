import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from 'ink';
import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { resolveRuntimeConfig } from '../config/index.js';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { msqEventBus } from '../core/events/index.js';
import { selectStartableFeaturePlan } from '../core/orchestrator/graph.js';
import { resolveRepo } from '../core/repo.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { assertWritableDbPath } from '../db/index.js';
import { abortPipeline, listCompletedFeatureIds, pausePipeline, requestFeatureAbort, resumePipeline } from '../db/repo.js';
import type { RunSummary } from '../db/repo.js';
import { getBacklogSettings, getFeatureCatalog, getPendingFeatures } from './catalog.js';
import { DASHBOARD_GROUP_ORDER, getRunGroup, sortRunsByGroup, type DashboardGroupId } from './dashboardGroups.js';
import { DETAIL_SECTION_ORDER, type DetailSectionId } from './detailSections.js';
import { buildCommandDefinitions } from './commands/definitions.js';
import { createGatesShortcuts } from './commands/gatesShortcuts.js';
import { createGlobalShortcuts } from './commands/globalShortcuts.js';
import { commandRegistry } from './commands/registry.js';
import { createRunShortcuts } from './commands/runShortcuts.js';
import { createViewShortcuts } from './commands/viewShortcuts.js';
import { CommandBar } from './components/CommandBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { CostDashboard } from './components/CostDashboard.js';
import { GateFooter } from './components/GateFooter.js';
import { HeaderBar } from './components/HeaderBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { MainPanel } from './components/MainPanel.js';
import { StatsBar } from './components/StatsBar.js';
import { StatusBar } from './components/StatusBar.js';
import { ToastStack } from './components/ToastStack.js';
import { getLayoutMode, getVerticalBudget } from './format.js';
import { getChromeHeight, getMainPanelContentHeight } from './layout/budget.js';
import { useCommandPalette } from './hooks/useCommandPalette.js';
import { useCompletedFeatures } from './hooks/useCompletedFeatures.js';
import { useGates } from './hooks/useGates.js';
import type { PendingApproval } from './hooks/useGates.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useToasts } from './hooks/useToasts.js';
import { useRunBreakdown } from './hooks/useRunBreakdown.js';
import { useRunOutput } from './hooks/useRunOutput.js';
import { useRunningTasks, useRuns, useTaskRuns } from './hooks/useRuns.js';
import { useStatsRows } from './hooks/useStatsRows.js';
import { useTokenStats } from './hooks/useTokenStats.js';
import { useTerminalHeight } from './hooks/useTerminalHeight.js';
import { useTerminalWidth } from './hooks/useTerminalWidth.js';
import type { ActiveView } from './components/MainPanel.js';
import type { FocusPanel as ShortcutContext } from './types/shortcuts.js';
import { ThemeProvider } from './theme/context.js';
import { resolveThemePreference } from './theme/resolve.js';

type FocusPanel = Exclude<ShortcutContext, 'run-detail'>;

// F31 section 1: cli.ts pins the same literal for `--version` — there is no
// package.json read at runtime today, so this mirrors that existing pattern
// rather than introducing a new one.
const APP_VERSION = '0.0.1';

interface UiState {
  selectedRun: number;
  selectedGate: number;
  selectedPending: number;
  focusPanel: FocusPanel;
  /** F31 "novo modelo de foco": which kanban column has the cursor when focusPanel === 'columns'. */
  activeColumn: DashboardGroupId;
  activeView: ActiveView;
  outputPaused: boolean;
  logsVisible: boolean;
  dashboard?: boolean;
  dashboardPeriod?: number;
  /** F31 section 5: index of the first visible section in the run-detail
   * scrollable body (header/stepper/gates stay anchored, only this scrolls). */
  detailSectionIndex: number;
  /** F31 section 5: `i` toggles this — collapses long sections for a quick
   * read; default is rich/complete, nothing hidden. */
  detailDense: boolean;
  /** US2: which detail section tab is currently active (`DETAIL_SECTION_ORDER`
   *  index). Replaces scroll-based paging for section selection — Tab/Shift+Tab
   *  cycle it, 1-7 jump directly. */
  activeTab: number;
}

const DASHBOARD_PERIODS: { label: string; days: number | null }[] = [
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

function validateFeatureStart(featureId: string, cwd: string): void {
  assertWritableDbPath();
  resolveRuntimeConfig(cwd);
  const repo = resolveRepo(cwd);
  const backlog = loadBacklogFromCatalog(repo.repoId, cwd);
  validateBacklogSkills(backlog, cwd);
  const plan = selectStartableFeaturePlan(backlog, featureId, listCompletedFeatureIds(repo.repoId));
  if (plan.pendingDependencies.length > 0) {
    throw new Error(`pending dependencies: ${plan.pendingDependencies.join(', ')}. Complete them before starting ${featureId}.`);
  }
}

function launchFeatureRun(featureId: string): void {
  const cwd = process.cwd();
  try {
    validateFeatureStart(featureId, cwd);
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
  const config = useMemo(() => resolveRuntimeConfig(process.cwd()), []);
  const themeResolution = useMemo(() => resolveThemePreference(config.theme), [config.theme]);
  const repoLabel = useMemo(() => basename(resolveRepo().path), []);
  const tokenStats = useTokenStats(7);
  const rawRuns = useRuns(2000);
  // C1: TODO, EXECUTION/BLOCKED, DONE, FALHA/CANCELED — display order and
  // keyboard navigation order must stay in sync, so this reorder happens once
  // and `runs` (used everywhere below) is always the grouped array.
  const runs = useMemo(() => sortRunsByGroup(rawRuns), [rawRuns]);
  const doneFeatureIds = useCompletedFeatures(2000);
  const { gates, resolve, forceResolve } = useGates(2000);
  const runningTasks = useRunningTasks(2000);
  const notifications = useNotifications(40);
  const toasts = useToasts(4);
  const width = useTerminalWidth();
  const height = useTerminalHeight();
  const [ui, setUi] = useState<UiState>({
    selectedRun: 0,
    selectedGate: 0,
    selectedPending: 0,
    // Foco inicial no board de colunas, comecando pela coluna TODO: setas
    // navegam entre features pendentes; ←/→ troca de coluna; Tab cicla
    // columns/gates/activity.
    focusPanel: 'columns',
    activeColumn: 'todo',
    activeView: 'overview',
    outputPaused: false,
    logsVisible: true,
    detailSectionIndex: 0,
    detailDense: false,
    activeTab: 0,
  });
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!themeResolution.message) return;
    msqEventBus.emit('ui:notice', { message: themeResolution.message });
  }, [themeResolution.message]);

  // H11: the gate-resolution focus fallback below (`gateJustResolved`) must
  // fire only once, right when the gate strip disappears — otherwise it
  // keeps reverting the user away from any column they browse to
  // afterwards, forever, since `ui.focusPanel` never leaves 'gates' on its
  // own. This effect performs that one-time reset as soon as the
  // transition happens, so `gateJustResolved` goes false again once the
  // redirect has been applied.
  useEffect(() => {
    if (ui.focusPanel === 'gates' && gates.length === 0) {
      setUi((current) => (current.focusPanel === 'gates' ? { ...current, focusPanel: 'columns' } : current));
    }
  }, [gates.length, ui.focusPanel]);

  const layoutMode = getLayoutMode(width);
  // F31 section 5: page size for the detail screen's section-level paging —
  // taller terminals show more sections per page. This is distinct from the
  // overview's own vertical-budget wiring (cards-per-column, stats density),
  // which stays untouched here.
  const verticalBudget = getVerticalBudget(height);
  const detailPageSize = verticalBudget === 'short' ? 1 : verticalBudget === 'regular' ? 2 : 3;
  // US2: detailSectionIndex now follows the active tab. The legacy scroll offset
  // (`ui.detailSectionIndex`) still exists for j/k fine-grained scroll, but the
  // primary section selection is `ui.activeTab` (set via Tab/Shift+Tab/1-7).
  const activeTabIndex = clampIndex(ui.activeTab, DETAIL_SECTION_ORDER.length);
  const activeTab: DetailSectionId = DETAIL_SECTION_ORDER[activeTabIndex] ?? 'summary';
  const detailSectionIndex = activeTabIndex;
  const selectedGateIndex = clampIndex(ui.selectedGate, gates.length);
  const storedActiveColumn = ui.activeColumn;
  // F31 "novo modelo de foco": EXECUTION/DONE/FALHA columns each navigate
  // their own slice of `runs` (already grouped by sortRunsByGroup) rather
  // than one flat index shared across every group — switching columns
  // resets to that column's own cursor position instead of jumping to
  // whatever run happens to sit at the same global offset.
  const executionRuns = useMemo(() => runs.filter((run) => getRunGroup(run.status) === 'execution'), [runs]);
  const doneRunsList = useMemo(() => runs.filter((run) => getRunGroup(run.status) === 'done'), [runs]);
  const falhaRunsList = useMemo(() => runs.filter((run) => getRunGroup(run.status) === 'canceled'), [runs]);
  const columnRunLists = useMemo((): Partial<Record<DashboardGroupId, RunSummary[]>> => ({
    execution: executionRuns,
    done: doneRunsList,
    canceled: falhaRunsList,
  }), [executionRuns, doneRunsList, falhaRunsList]);
  // F31 "Riscos de UX resolvidos" item 5 / "Navegacao e casos de borda":
  // resolving the last gate must never leave focus orphaned on a now-empty
  // column — it falls back to EXECUTION, or the first non-empty non-TODO
  // column. Scoped to the moment the gate strip itself just disappeared
  // (ui.focusPanel was 'gates', now there are none), so it doesn't fight a
  // user who deliberately browses an empty column for unrelated reasons.
  const gateJustResolved = ui.focusPanel === 'gates' && gates.length === 0;
  const activeColumn = gateJustResolved
    && storedActiveColumn !== 'todo'
    && (columnRunLists[storedActiveColumn]?.length ?? 0) === 0
    ? executionRuns.length > 0
      ? 'execution'
      : doneRunsList.length > 0
        ? 'done'
        : falhaRunsList.length > 0
          ? 'canceled'
          : storedActiveColumn
    : storedActiveColumn;
  const activeColumnRuns = columnRunLists[activeColumn] ?? [];
  const selectedRunIndex = clampIndex(ui.selectedRun, activeColumnRuns.length);
  // H11: MainPanel hides the "Recent activity" block whenever
  // verticalBudget === 'short', regardless of notification count — the
  // focus model must agree, or Tab-cycling can land focus on a panel that
  // isn't actually rendered.
  const activityVisible = notifications.length > 0 && verticalBudget !== 'short';
  const focusOrder = useMemo((): FocusPanel[] => [
    'columns',
    ...(gates.length > 0 ? (['gates'] as const) : []),
    ...(activityVisible ? (['activity'] as const) : []),
  ], [gates.length, activityVisible]);
  const focusPanel = ui.focusPanel === 'gates' && gates.length === 0
    ? 'columns'
    : ui.focusPanel === 'activity' && !activityVisible
      ? 'columns'
      : ui.focusPanel;
  const selectedRun = activeColumnRuns[selectedRunIndex] ?? null;
  const selectedGate = gates[selectedGateIndex] ?? null;
  const liveOutput = useRunOutput(
    selectedRun ? selectedRun.runId : null,
    ui.outputPaused ? 2_000 : 750,
  );
  const taskRuns = useTaskRuns(selectedRun ? selectedRun.runId : null);
  const runBreakdown = useRunBreakdown(
    selectedRun ? selectedRun.runId : null,
    selectedRun?.startedAt ?? null,
    selectedRun?.endedAt ?? null,
  );
  // F31 section 4: 'preview' has no selectedRun (the feature never ran) —
  // it must not fall through to 'overview' the way a stale 'run' view would
  // once its selectedRun disappears.
  const activeView: ActiveView = ui.activeView === 'notifications'
    ? 'notifications'
    : ui.activeView === 'preview'
      ? 'preview'
      : selectedRun
        ? ui.activeView
        : 'overview';
  const dashboardOpen = Boolean(ui.dashboard);
  const dashboardPeriodIndex = Math.min(ui.dashboardPeriod ?? 1, DASHBOARD_PERIODS.length - 1);
  const dashboardPeriod = DASHBOARD_PERIODS[dashboardPeriodIndex] ?? DASHBOARD_PERIODS[1] ?? { label: 'last 7 days', days: 7 };
  const statsRows = useStatsRows(dashboardOpen, dashboardPeriod.days);
  const featureCatalog = getFeatureCatalog();
  const backlogSettings = getBacklogSettings();
  const selectedFeature = selectedRun ? featureCatalog[selectedRun.featureId] ?? null : null;
  const totalRuns = runs.length;
  const doneRuns = runs.filter((run) => run.status === 'done').length;
  const currentStage = taskRuns.find((task) => task.status === 'running')?.stage
    ?? selectedRun?.pipelineCurrentStage
    ?? undefined;
  const mainWidth = Math.max(38, width - 2);
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
  const pendingFeatures = getPendingFeatures(featureCatalog, doneFeatureIds, activeFeatureIds);
  const selectedPendingIndex = clampIndex(ui.selectedPending, pendingFeatures.length);
  const selectedPending = pendingFeatures[selectedPendingIndex] ?? null;
  // F31 section 1: same grouping the kanban columns use (getRunGroup), so the
  // header stats and the columns can never disagree on what counts as
  // "execução" vs. "falha".
  const executionCount = executionRuns.length;
  const falhaCount = falhaRunsList.length;
  // F31 "Riscos de UX resolvidos" item 2: while a gate is pending, a/s/r/F
  // capture regardless of which column is focused — so `focusContext`
  // resolves to 'gates' whenever there's a decision waiting, overriding
  // whatever the user last had focused. run-detail keeps priority (its own
  // pause/abort bindings matter more once a run is actually open). The TODO
  // preview is the one exception (per item 2's own carve-out): it suppresses
  // gate bindings entirely while open, so it never resolves to 'gates'.
  const focusContext: ShortcutContext = activeView === 'run' && focusPanel === 'columns'
    ? 'run-detail'
    : activeView === 'preview'
      ? 'columns'
      : gates.length > 0
        ? 'gates'
        : focusPanel;
  const hasTabs = false;

  const quit = useCallback(() => {
    process.exit(0);
  }, []);

  const cycleFocus = useCallback(() => {
    if (dashboardOpen) return;

    const currentIndex = focusOrder.indexOf(focusPanel);
    const nextFocus = focusOrder[(currentIndex + 1) % focusOrder.length] ?? 'columns';
    setUi((current) => ({ ...current, focusPanel: nextFocus }));
  }, [dashboardOpen, focusOrder, focusPanel]);

  const escapeView = useCallback(() => {
    setUi((current) => ({
      ...current,
      activeView: 'overview',
      focusPanel: 'columns',
      outputPaused: false,
      dashboard: false,
    }));
  }, []);

  const toggleNotifications = useCallback(() => {
    setUi((current) => ({
      ...current,
      dashboard: false,
      activeView: current.activeView === 'notifications' ? 'overview' : 'notifications',
      focusPanel: 'columns',
    }));
  }, []);

  const toggleDashboard = useCallback(() => {
    setUi((current) => ({
      ...current,
      dashboard: !current.dashboard,
      activeView: 'overview',
      focusPanel: 'columns',
    }));
  }, []);

  // F31 "Navegacao e casos de borda": ←/→ pula colunas vazias em vez de parar
  // nelas; se todas estiverem vazias, mantem a coluna atual.
  const columnLength = useCallback(
    (groupId: DashboardGroupId): number => (groupId === 'todo' ? pendingFeatures.length : (columnRunLists[groupId]?.length ?? 0)),
    [columnRunLists, pendingFeatures.length],
  );

  const findNextNonEmptyColumn = useCallback(
    (from: DashboardGroupId, step: 1 | -1): DashboardGroupId => {
      const startIndex = DASHBOARD_GROUP_ORDER.indexOf(from);
      for (let offset = 1; offset <= DASHBOARD_GROUP_ORDER.length; offset += 1) {
        const index = (startIndex + step * offset + DASHBOARD_GROUP_ORDER.length * DASHBOARD_GROUP_ORDER.length) % DASHBOARD_GROUP_ORDER.length;
        const candidate = DASHBOARD_GROUP_ORDER[index] ?? from;
        if (columnLength(candidate) > 0) return candidate;
      }
      return from;
    },
    [columnLength],
  );

  const moveColumnLeft = useCallback(() => {
    // H11: a run's detail screen keeps focusPanel === 'columns' while open
    // (see openSelection below), so this must also check activeView or the
    // arrows silently reassign activeColumn/selectedRun behind the screen
    // the user is actually looking at.
    if (dashboardOpen || focusPanel !== 'columns' || activeView === 'run') return;
    const nextColumn = findNextNonEmptyColumn(activeColumn, -1);
    setUi((current) => ({ ...current, activeColumn: nextColumn, selectedRun: 0, selectedPending: 0 }));
  }, [activeColumn, activeView, dashboardOpen, findNextNonEmptyColumn, focusPanel]);

  const moveColumnRight = useCallback(() => {
    if (dashboardOpen || focusPanel !== 'columns' || activeView === 'run') return;
    const nextColumn = findNextNonEmptyColumn(activeColumn, 1);
    setUi((current) => ({ ...current, activeColumn: nextColumn, selectedRun: 0, selectedPending: 0 }));
  }, [activeColumn, activeView, dashboardOpen, findNextNonEmptyColumn, focusPanel]);

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

  const scrollSectionUp = useCallback(() => {
    setUi((current) => ({
      ...current,
      detailSectionIndex: clampIndex(current.detailSectionIndex - 1, DETAIL_SECTION_ORDER.length),
    }));
  }, []);

  const scrollSectionDown = useCallback(() => {
    setUi((current) => ({
      ...current,
      detailSectionIndex: clampIndex(current.detailSectionIndex + 1, DETAIL_SECTION_ORDER.length),
    }));
  }, []);

  const pageSectionUp = useCallback(() => {
    setUi((current) => ({
      ...current,
      detailSectionIndex: clampIndex(current.detailSectionIndex - detailPageSize, DETAIL_SECTION_ORDER.length),
    }));
  }, [detailPageSize]);

  const pageSectionDown = useCallback(() => {
    setUi((current) => ({
      ...current,
      detailSectionIndex: clampIndex(current.detailSectionIndex + detailPageSize, DETAIL_SECTION_ORDER.length),
    }));
  }, [detailPageSize]);

  const toggleDetailDensity = useCallback(() => {
    setUi((current) => ({ ...current, detailDense: !current.detailDense }));
  }, []);

  // US2: section tab navigation. Tab/Shift+Tab cycle with wrap-around;
  // number keys 1-7 select by 1-based index. All paths converge on setting
  // `activeTab` (the canonical section selector — MainPanel renders exactly
  // one section per tab instead of a scrollable page).
  const cycleSectionTabNext = useCallback(() => {
    setUi((current) => ({
      ...current,
      activeTab: (current.activeTab + 1) % DETAIL_SECTION_ORDER.length,
      detailSectionIndex: 0,
    }));
  }, []);

  const cycleSectionTabPrev = useCallback(() => {
    setUi((current) => ({
      ...current,
      activeTab: (current.activeTab - 1 + DETAIL_SECTION_ORDER.length) % DETAIL_SECTION_ORDER.length,
      detailSectionIndex: 0,
    }));
  }, []);

  const selectSectionTab = useCallback((oneBasedIndex: number) => {
    const zeroBased = oneBasedIndex - 1;
    if (zeroBased < 0 || zeroBased >= DETAIL_SECTION_ORDER.length) return;
    setUi((current) => ({ ...current, activeTab: zeroBased, detailSectionIndex: 0 }));
  }, []);

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

  // F1: force-bypass — distinct from approve/skip above because it also
  // resumes the gate's pipeline when that pipeline was paused/blocked on
  // this exact gate, instead of only recording a decision.
  const forceApproveSelectedGate = useCallback(() => {
    if (!selectedGate) return;
    const { resumedPipelineId } = forceResolve(selectedGate);
    announceGateDecision(selectedGate, 'force-approved', Boolean(resumedPipelineId));
  }, [forceResolve, selectedGate]);

  const startSelectedFeature = useCallback(() => {
    // F31 section 4: reachable both from the direct 'n' shortcut (overview)
    // and from confirming inside the TODO preview screen.
    if ((activeView !== 'overview' && activeView !== 'preview') || !selectedPending) return;
    const pendingDependencies = selectedPending.pendingDependencies ?? [];
    if (pendingDependencies.length > 0) {
      const pendingDependenciesLabel = pendingDependencies.join(', ');
      msqEventBus.emit('ui:notice', {
        message: `Could not start ${selectedPending.id}: pending dependencies ${pendingDependenciesLabel}.`,
      });
      return;
    }
    launchFeatureRun(selectedPending.id);
  }, [activeView, selectedPending]);

  // F31 "novo modelo de foco": j/k always act on whichever panel is
  // currently focused — the gates strip (independent of column, per item 2's
  // rule that gate keys never no-op) when focusPanel === 'gates', otherwise
  // the active column's own list (pending features for TODO, that column's
  // own run slice for EXECUTION/DONE/FALHA).
  const movePrevious = useCallback(() => {
    if (dashboardOpen || activeView === 'notifications') return;

    if (focusPanel === 'gates') {
      setUi((current) => ({
        ...current,
        selectedGate: clampIndex(selectedGateIndex - 1, gates.length),
      }));
      return;
    }

    if (focusPanel !== 'columns') return;

    if (activeColumn === 'todo') {
      setUi((current) => ({
        ...current,
        selectedPending: clampIndex(selectedPendingIndex - 1, pendingFeatures.length),
      }));
      return;
    }

    setUi((current) => ({
      ...current,
      selectedRun: clampIndex(selectedRunIndex - 1, activeColumnRuns.length),
    }));
  }, [
    activeColumn,
    activeColumnRuns.length,
    activeView,
    dashboardOpen,
    focusPanel,
    gates.length,
    pendingFeatures.length,
    selectedGateIndex,
    selectedPendingIndex,
    selectedRunIndex,
  ]);

  const moveNext = useCallback(() => {
    if (dashboardOpen || activeView === 'notifications') return;

    if (focusPanel === 'gates') {
      setUi((current) => ({
        ...current,
        selectedGate: clampIndex(selectedGateIndex + 1, gates.length),
      }));
      return;
    }

    if (focusPanel !== 'columns') return;

    if (activeColumn === 'todo') {
      setUi((current) => ({
        ...current,
        selectedPending: clampIndex(selectedPendingIndex + 1, pendingFeatures.length),
      }));
      return;
    }

    setUi((current) => ({
      ...current,
      selectedRun: clampIndex(selectedRunIndex + 1, activeColumnRuns.length),
    }));
  }, [
    activeColumn,
    activeColumnRuns.length,
    activeView,
    dashboardOpen,
    focusPanel,
    gates.length,
    pendingFeatures.length,
    selectedGateIndex,
    selectedPendingIndex,
    selectedRunIndex,
  ]);

  const openSelection = useCallback(() => {
    if (dashboardOpen || activeView === 'notifications') return;
    // F31 item 3: Enter always "abre o que o card representa" — a run
    // (EXECUTION/DONE/FALHA column) opens the run detail; a TODO card opens
    // the read-only preview. Enter *inside* the preview confirms and starts.
    if (activeView === 'preview') {
      startSelectedFeature();
      return;
    }
    if (selectedRun && focusPanel === 'columns' && activeColumn !== 'todo') {
      setUi((current) => ({ ...current, activeView: 'run', focusPanel: 'columns', detailSectionIndex: 0 }));
      return;
    }
    if (focusPanel === 'columns' && activeColumn === 'todo' && activeView === 'overview' && selectedPending) {
      setUi((current) => ({ ...current, activeView: 'preview' }));
    }
  }, [activeColumn, activeView, dashboardOpen, focusPanel, selectedRun, selectedPending, startSelectedFeature]);

  const switchToTab = useCallback((tabIndex: number) => {
    // View-level numbered-tab binding — keep delegating to the section selector
    // so the global hasTabs-driven shortcuts remain no-op until real tabs exist.
    selectSectionTab(tabIndex + 1);
  }, [selectSectionTab]);

  const commands = useMemo(
    () => buildCommandDefinitions({
      canPause,
      canResume,
      canAbort: canAbortFeature || canAbortPipeline,
      canStart: Boolean(selectedPending) && (selectedPending?.pendingDependencies?.length ?? 0) === 0,
      canResolveGate,
      canRetryGate,
      focusContext,
      selectedFeatureId: selectedPending?.id ?? null,
      togglePaletteHelp: () => { setHelpOpen(true); },
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
      forceApproveSelectedGate,
      pauseSelectedRun,
      quit,
      resumeSelectedRun,
      retrySelectedGate,
      selectedPending,
      skipSelectedGate,
      startSelectedFeature,
      toggleDashboard,
      toggleDetailDensity,
      toggleNotifications,
    ],
  );

  useEffect(() => {
    commandRegistry.clear();
    for (const command of commands) {
      commandRegistry.register(command);
    }

    return (): void => {
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
      // F31 section 5: while a run's detail is open, j/k/up/down scroll its
      // sections instead (run-detail-scoped shortcuts in runShortcuts.ts) —
      // these global bindings must yield so both don't fire on the same key.
      canNavigateRuns: activeView !== 'run' && focusPanel === 'columns' && activeColumn !== 'todo' && activeColumnRuns.length > 0,
      canNavigateGates: activeView !== 'run' && focusPanel === 'gates' && gates.length > 0,
      canMovePending: activeView === 'overview' && focusPanel === 'columns' && activeColumn === 'todo' && pendingFeatures.length > 0,
      canSwitchColumn: !dashboardOpen && focusPanel === 'columns' && activeView !== 'run',
      canConfirmPreview: activeView === 'preview' && Boolean(selectedPending),
      movePrevious,
      moveNext,
      moveColumnLeft,
      moveColumnRight,
      enter: openSelection,
      escape: escapeView,
      cycleFocus,
      quit,
    }),
    [
      activeColumn,
      activeColumnRuns.length,
      activeView,
      cycleFocus,
      dashboardOpen,
      escapeView,
      focusPanel,
      gates.length,
      moveColumnLeft,
      moveColumnRight,
      moveNext,
      movePrevious,
      openSelection,
      pendingFeatures.length,
      quit,
      selectedPending,
    ],
  );

  const viewShortcuts = useMemo(
    () => createViewShortcuts({
      canToggleLogs: activeView === 'run',
      canPauseOutput: activeView === 'run' && Boolean(selectedRun),
      hasTabs,
      canStart: Boolean(selectedPending) && activeView === 'overview' && (selectedPending?.pendingDependencies?.length ?? 0) === 0,
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
      forceApprove: forceApproveSelectedGate,
    }),
    [approveSelectedGate, canResolveGate, canRetryGate, forceApproveSelectedGate, retrySelectedGate, skipSelectedGate],
  );

  const runShortcuts = useMemo(
    () => createRunShortcuts({
      canPause,
      canAbort: canAbortFeature || canAbortPipeline,
      pause: pauseSelectedRun,
      abort: abortSelectedRun,
      scrollSectionUp,
      scrollSectionDown,
      pageSectionUp,
      pageSectionDown,
      toggleDensity: toggleDetailDensity,
      cycleSectionTabNext,
      cycleSectionTabPrev,
      selectSectionTab,
    }),
    [
      abortSelectedRun,
      canAbortFeature,
      canAbortPipeline,
      canPause,
      cycleSectionTabNext,
      cycleSectionTabPrev,
      pageSectionDown,
      pageSectionUp,
      pauseSelectedRun,
      scrollSectionDown,
      scrollSectionUp,
      selectSectionTab,
      toggleDetailDensity,
    ],
  );

  useEffect(() => {
    const allShortcuts = [...globalShortcuts, ...viewShortcuts, ...gatesShortcuts, ...runShortcuts];
    for (const shortcut of allShortcuts) {
      registerShortcut(shortcut);
    }

    return (): void => {
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

  const chromeHeight = getChromeHeight({
    layoutMode,
    hasGateFooter: !dashboardOpen && gates.length > 0,
    gateCount: gates.length,
    hasGatePrompt: Boolean(selectedGate?.prompt),
    hasStatusHints: shortcutHints.length > 0,
    hasThemeNotice: Boolean(themeResolution.message),
  });
  const availableHeight = getMainPanelContentHeight(height, chromeHeight);

  return (
    <ThemeProvider resolution={themeResolution}>
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        <Box marginTop={1} marginBottom={1} flexDirection="column">
          <HeaderBar
            version={APP_VERSION}
            repoLabel={repoLabel}
            width={width}
            stats={layoutMode === 'stacked' ? undefined : (
              <StatsBar
                done={doneRuns}
                todo={pendingFeatures.length}
                execution={executionCount}
                falha={falhaCount}
                gatesPending={gates.length}
                tokenStats={tokenStats}
                compact={verticalBudget === 'short'}
              />
            )}
          />
          {layoutMode === 'stacked' ? (
            <StatsBar
              done={doneRuns}
              todo={pendingFeatures.length}
              execution={executionCount}
              falha={falhaCount}
              gatesPending={gates.length}
              tokenStats={tokenStats}
              compact
            />
          ) : null}
        </Box>
        {dashboardOpen ? (
          <Box marginTop={1}>
            <CostDashboard rows={statsRows} periodLabel={dashboardPeriod.label} width={width - 2} />
          </Box>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            <MainPanel
              runs={runs}
              gates={gates}
              selectedRun={selectedRun}
              selectedRunIndex={selectedRunIndex}
              selectedFeature={selectedFeature}
              featureCatalog={featureCatalog}
              backlogSettings={backlogSettings}
              activeView={activeView}
              output={liveOutput}
              outputPaused={ui.outputPaused}
              logsVisible={ui.logsVisible}
              focusPanel={focusPanel}
              activeColumn={activeColumn}
              detailSectionIndex={detailSectionIndex}
              detailPageSize={detailPageSize}
              detailDense={ui.detailDense}
              activeTab={activeTab}
              verticalBudget={verticalBudget}
              mode={layoutMode}
              width={mainWidth}
              pendingFeatures={pendingFeatures}
              selectedPendingIndex={selectedPendingIndex}
              breakdown={runBreakdown}
              taskRuns={taskRuns}
              runningTasks={runningTasks}
              notifications={notifications}
              availableHeight={availableHeight}
            />
          </Box>
        )}
        {!dashboardOpen && gates.length > 0 ? (
          <GateFooter
            gates={gates}
            selectedIndex={selectedGateIndex}
            isFocused={focusPanel === 'gates'}
            width={width - 2}
          />
        ) : null}
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
          themeNotice={themeResolution.message}
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
        <ToastStack toasts={toasts} width={width} />
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
          onClose={() => { setHelpOpen(false); }}
          onOpenPalette={openPalette}
        />
      </Box>
    </ThemeProvider>
  );
}

function announceGateDecision(
  gate: PendingApproval,
  decision: 'approved' | 'skipped' | 'retried' | 'hold' | 'force-approved',
  resumedPipeline = false,
): void {
  if (gate.kind === 'stage') {
    const message = decision === 'approved' || decision === 'force-approved'
      ? `${gate.featureId} approval accepted`
      : decision === 'hold'
        ? `${gate.featureId} kept on hold; approval will remain pending`
        : `${gate.featureId} approval ${decision}`;
    msqEventBus.emit('ui:info', { message });
    return;
  }

  if (decision === 'force-approved') {
    const message = resumedPipeline
      ? `${gate.featureId} gate force-approved; pipeline resumed`
      : `${gate.featureId} gate force-approved`;
    msqEventBus.emit('ui:info', { message });
    return;
  }

  msqEventBus.emit('ui:info', { message: `${gate.featureId} gate ${decision}` });
}
