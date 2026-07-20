import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { getChromeHeight, getMainPanelContentHeight } from '../../src/ui/layout/budget.js';

const mockUseRuns = vi.fn();
const mockUseCompletedFeatures = vi.fn(() => ({ doneFeatureIds: new Set<string>(), error: null }));
const mockUseTaskRuns = vi.fn(() => ({ taskRuns: [], error: null }));
const mockUseRunningTasks = vi.fn(() => ({ runningTasks: [], error: null }));
const mockUseGates = vi.fn();
const mockUseRunOutput = vi.fn();
const mockUseTerminalWidth = vi.fn();
const mockUseTerminalHeight = vi.fn(() => 40);
const mockUseNotifications = vi.fn();
const mockUseToasts = vi.fn(() => []);
const mockUseTokenStats = vi.fn(() => ({ status: 'ready' as const, totalTokens: 0, error: null }));
const mockGetFeatureCatalog = vi.fn();
const mockGetBacklogSettings = vi.fn(() => ({ stageSkills: {} }));
const mockLoadConfig = vi.fn(() => ({ concurrency: 3 }));
const mockLoadBacklog = vi.fn(() => ({
  version: 2,
  repo: 'test-repo',
  defaults: { tool: 'codex', effort: 'medium', skills: [], stageSkills: {} },
  epics: [
    {
      id: 'epic-1',
      title: 'Epic',
      features: [
        {
          id: 'feat-9',
          title: 'F09',
          tool: 'codex',
          effort: 'medium',
          dependsOn: [],
          tasks: [],
          workflow: { mode: 'single', stages: [], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
        },
      ],
    },
  ],
}));
const mockValidateBacklogSkills = vi.fn();
const mockAssertWritableDbPath = vi.fn();
const mockPausePipeline = vi.fn();
const mockResumePipeline = vi.fn();
const mockRequestFeatureAbort = vi.fn();
const mockAbortPipeline = vi.fn();
const mockListCompletedFeatureIds = vi.fn(() => new Set<string>());
const mockSpawn = vi.fn(() => ({ once: vi.fn(), unref: vi.fn() }));
const mockEventBusEmit = vi.fn();
const mockMainPanel = vi.fn(() => React.createElement('main-panel'));
const mockGateFooter = vi.fn(() => React.createElement('gate-footer'));
const mockHeaderBar = vi.fn(() => React.createElement('header-bar'));
const mockStatsBar = vi.fn(() => React.createElement('stats-bar'));
const mockStatusBar = vi.fn(() => React.createElement('status-bar'));
const mockToastStack = vi.fn(() => React.createElement('toast-stack'));
const mockCommandBar = vi.fn(() => React.createElement('command-bar'));
const mockCommandPalette = vi.fn(() => React.createElement('command-palette'));
const mockHelpOverlay = vi.fn(() => React.createElement('help-overlay'));
const mockUseInput = vi.fn();
const mockGetPendingFeatures = vi.fn(() => []);
const mockPaletteOpen = vi.fn();
const mockPaletteClose = vi.fn();
const mockPaletteSetQuery = vi.fn();
const mockPaletteSelectPrevious = vi.fn();
const mockPaletteSelectNext = vi.fn();
const mockPaletteExecuteSelected = vi.fn();
let setUi: ReturnType<typeof vi.fn>;
let setHelpOpen: ReturnType<typeof vi.fn>;
let stateValue: {
  selectedRun: number;
  selectedGate: number;
  selectedPending: number;
  focusPanel: 'columns' | 'gates' | 'activity';
  activeColumn: 'execution' | 'todo' | 'done' | 'canceled';
  activeView: 'overview' | 'run' | 'notifications';
  outputPaused: boolean;
  logsVisible: boolean;
  dashboard?: boolean;
  dashboardPeriod?: number;
  detailSectionIndex: number;
  detailDense: boolean;
};
let helpOpenValue = false;
let useStateCallIndex = 0;

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    default: actual.default,
    useCallback: <T extends (...args: any[]) => any>(fn: T) => fn,
    useEffect: (effect: () => void | (() => void)) => effect(),
    useMemo: <T>(factory: () => T) => factory(),
    useRef: <T>(value: T) => ({ current: value }),
    useState: vi.fn((initialValue: unknown) => {
      const callIndex = useStateCallIndex++;
      if (callIndex === 0) return [stateValue, setUi];
      if (callIndex === 1) return [helpOpenValue, setHelpOpen];
      if (callIndex === 2) return [0, vi.fn()];
      return [typeof initialValue === 'function' ? (initialValue as () => unknown)() : initialValue, vi.fn()];
    }),
  };
});

vi.mock('../../src/ui/hooks/useRuns.js', () => ({
  useRuns: mockUseRuns,
  useTaskRuns: mockUseTaskRuns,
  useRunningTasks: mockUseRunningTasks,
}));

vi.mock('../../src/ui/hooks/useCompletedFeatures.js', () => ({
  useCompletedFeatures: mockUseCompletedFeatures,
}));

vi.mock('../../src/ui/hooks/useGates.js', () => ({
  useGates: mockUseGates,
}));

vi.mock('../../src/ui/hooks/useRunOutput.js', () => ({
  useRunOutput: mockUseRunOutput,
}));

vi.mock('../../src/ui/hooks/useRunBreakdown.js', () => ({
  useRunBreakdown: vi.fn(() => ({ breakdown: null, error: null })),
}));

vi.mock('../../src/ui/hooks/useStatsRows.js', () => ({
  useStatsRows: vi.fn(() => ({ rows: [], error: null })),
}));

vi.mock('../../src/ui/hooks/useTerminalWidth.js', () => ({
  useTerminalWidth: mockUseTerminalWidth,
}));

vi.mock('../../src/ui/hooks/useTerminalHeight.js', () => ({
  useTerminalHeight: mockUseTerminalHeight,
}));

vi.mock('../../src/ui/hooks/useNotifications.js', () => ({
  useNotifications: mockUseNotifications,
}));

vi.mock('../../src/ui/hooks/useToasts.js', () => ({
  useToasts: mockUseToasts,
}));

vi.mock('../../src/ui/hooks/useTokenStats.js', () => ({
  useTokenStats: mockUseTokenStats,
}));

vi.mock('../../src/core/repo.js', () => ({
  resolveRepo: () => ({ repoId: 'test-repo', path: '/test/repo' }),
}));

vi.mock('../../src/ui/catalog.js', () => ({
  getFeatureCatalog: mockGetFeatureCatalog,
  getPendingFeatures: mockGetPendingFeatures,
  getBacklogSettings: mockGetBacklogSettings,
}));

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: mockLoadConfig,
}));

vi.mock('../../src/core/backlog/load.js', () => ({
  loadBacklog: mockLoadBacklog,
  loadBacklogFromCatalog: mockLoadBacklog,
}));

vi.mock('../../src/core/skills/index.js', () => ({
  validateBacklogSkills: mockValidateBacklogSkills,
}));

vi.mock('../../src/db/index.js', () => ({
  assertWritableDbPath: mockAssertWritableDbPath,
}));

vi.mock('../../src/db/repo.js', () => ({
  listCompletedFeatureIds: mockListCompletedFeatureIds,
  pausePipeline: mockPausePipeline,
  resumePipeline: mockResumePipeline,
  requestFeatureAbort: mockRequestFeatureAbort,
  abortPipeline: mockAbortPipeline,
}));

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: {
    emit: mockEventBusEmit,
    subscribe: vi.fn(() => () => {}),
  },
  logCaughtError: vi.fn(),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: mockSpawn,
  };
});

vi.mock('../../src/ui/components/MainPanel.js', () => ({
  MainPanel: mockMainPanel,
}));

vi.mock('../../src/ui/components/HeaderBar.js', () => ({
  HeaderBar: mockHeaderBar,
}));

vi.mock('../../src/ui/components/StatsBar.js', () => ({
  StatsBar: mockStatsBar,
}));

vi.mock('../../src/ui/components/GateFooter.js', () => ({
  GateFooter: mockGateFooter,
}));

vi.mock('../../src/ui/components/StatusBar.js', () => ({
  StatusBar: mockStatusBar,
}));

vi.mock('../../src/ui/components/ToastStack.js', () => ({
  ToastStack: mockToastStack,
}));

vi.mock('../../src/ui/components/CommandBar.js', () => ({
  CommandBar: mockCommandBar,
}));

vi.mock('../../src/ui/components/CommandPalette.js', () => ({
  CommandPalette: mockCommandPalette,
}));

vi.mock('../../src/ui/components/HelpOverlay.js', () => ({
  HelpOverlay: mockHelpOverlay,
}));

vi.mock('../../src/ui/hooks/useCommandPalette.js', () => ({
  useCommandPalette: vi.fn(() => ({
    state: {
      isOpen: false,
      query: '',
      filteredCommands: [],
      selectedIndex: 0,
    },
    open: mockPaletteOpen,
    close: mockPaletteClose,
    setQuery: mockPaletteSetQuery,
    selectPrevious: mockPaletteSelectPrevious,
    selectNext: mockPaletteSelectNext,
    executeSelected: mockPaletteExecuteSelected,
  })),
}));

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('App', () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

  function findElement(
    node: React.ReactNode,
    type: unknown,
  ): React.ReactElement | undefined {
    const children = React.Children.toArray(node);
    for (const child of children) {
      if (!React.isValidElement(child)) continue;
      if (child.type === type) return child;
      const nested = findElement(child.props.children, type);
      if (nested) return nested;
    }
    return undefined;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setUi = vi.fn();
    setHelpOpen = vi.fn();
    helpOpenValue = false;
    useStateCallIndex = 0;
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseTerminalWidth.mockReturnValue(88);
    mockLoadBacklog.mockClear();
    mockUseRuns.mockReturnValue({ runs: [], error: null });
    mockUseRunningTasks.mockReturnValue({ runningTasks: [], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn(), forceResolve: vi.fn(() => ({ resumedPipelineId: null })) });
    mockUseRunOutput.mockReturnValue([]);
    mockUseNotifications.mockReturnValue([]);
    mockUseToasts.mockReturnValue([]);
    mockGetFeatureCatalog.mockReturnValue({});
    mockGetPendingFeatures.mockReturnValue([]);
    mockLoadConfig.mockClear();
    mockLoadBacklog.mockClear();
    mockValidateBacklogSkills.mockClear();
    mockAssertWritableDbPath.mockClear();
    mockPausePipeline.mockReset();
    mockResumePipeline.mockReset();
    mockRequestFeatureAbort.mockReset();
    mockAbortPipeline.mockReset();
    mockSpawn.mockClear();
    mockEventBusEmit.mockReset();
  });

  afterEach(() => {
    exitSpy.mockClear();
  });

  it('renders the multi-panel shell when there are no runs', async () => {
    const { App } = await import('../../src/ui/App.js');
    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const mainPanel = findElement(rootChildren, mockMainPanel);
    const gateFooter = findElement(rootChildren, mockGateFooter);
    const statusBar = findElement(rootChildren, mockStatusBar);
    const commandBar = findElement(rootChildren, mockCommandBar);

    expect(React.isValidElement(element)).toBe(true);
    expect(mainPanel?.props.runs).toEqual([]);
    expect(mainPanel?.props.output).toEqual([]);
    expect(gateFooter).toBeUndefined();
    expect(statusBar?.props.selectedRun).toBeNull();
    expect(commandBar?.props.hasRuns).toBe(false);
  });

  // H10: the root app must be pinned to the terminal height and the main
  // content area must receive the remaining budget after the fixed chrome.
  it('fixes the app height to the terminal and passes available height to MainPanel', async () => {
    mockUseTerminalHeight.mockReturnValue(40);
    mockUseTerminalWidth.mockReturnValue(88);
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn(), forceResolve: vi.fn(() => ({ resumedPipelineId: null })) });
    const { App } = await import('../../src/ui/App.js');
    const { Box: InkBox } = await import('ink');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const rootBox = findElement(rootChildren, InkBox);
    const mainPanel = findElement(rootChildren, mockMainPanel);

    const expectedChrome = getChromeHeight({
      layoutMode: 'compact',
      hasGateFooter: false,
      gateCount: 0,
      hasGatePrompt: false,
      hasStatusHints: true,
      hasThemeNotice: false,
    });
    const expectedAvailable = getMainPanelContentHeight(40, expectedChrome);

    expect(rootBox?.props.height).toBeUndefined();
    expect(mainPanel?.props.availableHeight).toBe(expectedAvailable);
    expect(mainPanel?.props.availableHeight).toBeGreaterThan(0);
    expect(mainPanel?.props.availableHeight).toBeLessThanOrEqual(40);
  });

  it('registers the density-toggle command with the command palette', async () => {
    const { App } = await import('../../src/ui/App.js');
    const { useCommandPalette } = await import('../../src/ui/hooks/useCommandPalette.js');

    App();

    const paletteArgs = vi.mocked(useCommandPalette).mock.calls[0]?.[0] as {
      commands: Array<{ id: string }>;
    };
    expect(paletteArgs.commands.some((command) => command.id === 'view-toggle-density')).toBe(true);
  });

  it('uses the fixed default theme without reading a retired preference', async () => {
    mockLoadConfig.mockReturnValue({ concurrency: 3 });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const statusBar = findElement(rootChildren, mockStatusBar);

    expect(statusBar?.props.themeNotice).toBeNull();
    expect(mockEventBusEmit).not.toHaveBeenCalledWith('ui:notice', expect.anything());
  });

  it('passes selected run metadata to child panels', async () => {
    mockUseRuns.mockReturnValue({ runs: [{
      runId: 1,
      repoId: 'repo-1',
      featureId: 'feat-1',
      tool: 'codex',
      status: 'running',
      startedAt: '2026-07-06T10:00:00Z',
      endedAt: null,
      totalTokens: 1200,
      inputTokens: 900,
      outputTokens: 300,
      gateId: null,
      gateDecision: null,
    }], error: null });
    mockUseGates.mockReturnValue({
      gates: [{ id: 1, featureId: 'feat-1', repoId: 'repo-1' }],
      resolve: vi.fn(),
    });
    mockGetFeatureCatalog.mockReturnValue({
      'feat-1': { id: 'feat-1', title: 'F05 — Layout Multi-Painel', skills: ['implement'], tool: 'codex' },
    });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const mainPanel = findElement(rootChildren, mockMainPanel);
    const gateFooter = findElement(rootChildren, mockGateFooter);
    const statusBar = findElement(rootChildren, mockStatusBar);

    expect(mainPanel?.props.selectedRun?.runId).toBe(1);
    expect(mainPanel?.props.selectedFeature?.title).toBe('F05 — Layout Multi-Painel');
    expect(mainPanel?.props.outputPaused).toBe(false);
    expect(gateFooter?.props.gates).toHaveLength(1);
    expect(statusBar?.props.gateCount).toBe(1);
  });

  it('handles keyboard interactions for navigation', async () => {
    const resolve = vi.fn();
    mockUseRuns.mockReturnValue({ runs: [
      { runId: 1, featureId: 'feat-1', status: 'running' },
      { runId: 2, featureId: 'feat-2', status: 'running' },
    ], error: null });
    mockUseGates.mockReturnValue({
      gates: [{ id: 7, featureId: 'feat-1', repoId: 'repo-1' }],
      resolve,
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;

    handler('q', {});
    handler('j', {});
    handler('', { escape: true });

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(setUi).toHaveBeenCalledTimes(2);

    const moveRun = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const escapeRun = setUi.mock.calls[1]?.[0] as (state: typeof stateValue) => typeof stateValue;

    expect(moveRun(stateValue).selectedRun).toBe(1);
    expect(escapeRun(stateValue)).toMatchObject({ activeView: 'overview', focusPanel: 'columns', outputPaused: false });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('opens the command palette with ctrl+p and :', async () => {
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;

    handler('p', { ctrl: true });
    handler(':', {});

    expect(mockPaletteOpen).toHaveBeenCalledTimes(2);
  });

  it('cycles focus with Tab and opens the selected run with Enter', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({
      gates: [{ kind: 'gate', id: 7, featureId: 'feat-1', repoId: 'repo-1', prompt: '', createdAt: '' }],
      resolve: vi.fn(),
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;

    handler('', { tab: true });
    handler('', { return: true });

    expect(setUi).toHaveBeenCalledTimes(2);
    const cycleFocus = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const openRun = setUi.mock.calls[1]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(cycleFocus(stateValue).focusPanel).toBe('gates');
    expect(openRun(stateValue)).toMatchObject({ activeView: 'run', focusPanel: 'columns' });
  });

  // F31 section 4: Enter on a TODO card opens a read-only preview instead of
  // starting the run immediately; Enter *inside* the preview is what starts it.
  it('opens the TODO preview with Enter instead of starting the feature directly', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'todo',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockGetPendingFeatures.mockReturnValue([{ id: 'feat-9', title: 'F09', tool: 'codex', effort: 'medium' }]);
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('', { return: true });

    expect(setUi).toHaveBeenCalledTimes(1);
    const openPreview = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(openPreview(stateValue)).toMatchObject({ activeView: 'preview' });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('confirms and starts the feature with Enter from inside the preview', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'todo',
      activeView: 'preview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockGetPendingFeatures.mockReturnValue([{ id: 'feat-9', title: 'F09', tool: 'codex', effort: 'medium' }]);
    const argvSpy = vi.spyOn(process, 'argv', 'get').mockReturnValue(['/usr/local/bin/node', '/repo/src/index.ts']);
    const execArgvSpy = vi.spyOn(process, 'execArgv', 'get').mockReturnValue([]);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('', { return: true });

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ['/repo/src/index.ts', 'run', '--feature', 'feat-9'],
      expect.objectContaining({ detached: true, stdio: 'ignore', cwd: '/repo' }),
    );

    argvSpy.mockRestore();
    execArgvSpy.mockRestore();
    cwdSpy.mockRestore();
  });

  it('returns from the preview without starting when Esc is pressed', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'todo',
      activeView: 'preview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockGetPendingFeatures.mockReturnValue([{ id: 'feat-9', title: 'F09', tool: 'codex', effort: 'medium' }]);
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('', { escape: true });

    expect(mockSpawn).not.toHaveBeenCalled();
    const escapeRun = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(escapeRun(stateValue)).toMatchObject({ activeView: 'overview' });
  });

  it('opens the help overlay with ? and closes the palette first', async () => {
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('?', {});

    expect(mockPaletteClose).toHaveBeenCalledTimes(1);
    expect(setHelpOpen).toHaveBeenCalledWith(true);
  });

  it('toggles log pause with ctrl+s while a run detail is open', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('s', { ctrl: true });

    expect(setUi).toHaveBeenCalledTimes(1);
    const pauseLogs = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(pauseLogs(stateValue).outputPaused).toBe(true);
  });

  it('toggles log visibility with ctrl+l while a run detail is open', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('l', { ctrl: true });

    expect(setUi).toHaveBeenCalledTimes(1);
    const toggleLogs = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(toggleLogs(stateValue).logsVisible).toBe(false);
  });

  it('toggles the cost dashboard with d', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('d', {});

    expect(setUi).toHaveBeenCalledTimes(1);
    const toggle = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(toggle(stateValue).dashboard).toBe(true);
  });

  it('opens and closes the notifications view with o', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('o', {});

    expect(setUi).toHaveBeenCalledTimes(1);
    const toggle = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(toggle(stateValue)).toMatchObject({ activeView: 'notifications', focusPanel: 'columns' });
  });

  it('handles gate decisions when the gates panel is focused', async () => {
    const resolve = vi.fn();
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'gates',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    const gateApproval = { kind: 'gate' as const, id: 7, featureId: 'feat-1', repoId: 'repo-1', prompt: '', createdAt: '' };
    mockUseGates.mockReturnValue({
      gates: [gateApproval],
      resolve,
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;

    handler('a', {});
    handler('s', {});
    handler('r', {});

    expect(resolve).toHaveBeenCalledWith(gateApproval, 'approved');
    expect(resolve).toHaveBeenCalledWith(gateApproval, 'skipped');
    expect(resolve).toHaveBeenCalledWith(gateApproval, 'retried');
  });

  it('F1: force-approves the selected gate and announces whether it resumed the pipeline', async () => {
    const forceResolve = vi.fn(() => ({ resumedPipelineId: 42 }));
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'gates',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    const gateApproval = { kind: 'gate' as const, id: 7, featureId: 'feat-1', repoId: 'repo-1', prompt: '', createdAt: '' };
    mockUseGates.mockReturnValue({
      gates: [gateApproval],
      resolve: vi.fn(),
      forceResolve,
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('F', {});

    expect(forceResolve).toHaveBeenCalledWith(gateApproval);
    expect(mockEventBusEmit).toHaveBeenCalledWith('ui:info', {
      message: 'feat-1 gate force-approved; pipeline resumed',
    });
  });

  // F31 "Riscos de UX resolvidos" item 2: a pending gate used to be a
  // silent no-op unless the gates panel had focus. That's the bug this
  // rule fixes — a/s/r/F now capture globally whenever there's a gate
  // pending, regardless of which column is focused. run-detail-only
  // shortcuts (p/x) are unaffected and still require activeView === 'run'.
  it('gate shortcuts act globally while a gate is pending, run-detail shortcuts still do not', async () => {
    const resolve = vi.fn();
    const forceResolve = vi.fn(() => ({ resumedPipelineId: null }));
    mockUseRuns.mockReturnValue({ runs: [{
      runId: 1,
      pipelineId: 42,
      pipelineStatus: 'running',
      featureId: 'feat-1',
      tool: 'codex',
      status: 'running',
      startedAt: '2026-07-06T10:00:00Z',
      endedAt: null,
      totalTokens: null,
      inputTokens: null,
      outputTokens: null,
      gateId: null,
      gateDecision: null,
      repoId: 'repo-1',
      pipelineResumeSummary: null,
    }], error: null });
    mockUseGates.mockReturnValue({
      gates: [{ kind: 'gate', id: 7, featureId: 'feat-1', repoId: 'repo-1', prompt: '', createdAt: '' }],
      resolve,
      forceResolve,
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('a', {});

    expect(resolve).toHaveBeenCalledTimes(1);

    handler('p', {});
    handler('x', {});

    expect(mockPausePipeline).not.toHaveBeenCalled();
    expect(mockRequestFeatureAbort).not.toHaveBeenCalled();
    expect(mockAbortPipeline).not.toHaveBeenCalled();
  });

  it('shows gate-focused shortcut hints in the status bar', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'gates',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({
      gates: [{ kind: 'gate', id: 7, featureId: 'feat-1', repoId: 'repo-1', prompt: '', createdAt: '' }],
      resolve: vi.fn(),
    });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const statusBar = findElement(rootChildren, mockStatusBar);

    // F1: the new force-approve shortcut ('F') joins the gates context hints.
    // The status bar caps hints at 6, so ?:help drops off this list here —
    // it's still reachable globally via the help overlay.
    expect(statusBar?.props.shortcutHints).toEqual(['a:approve', 's:skip', 'r:retry', 'F:force', 'tab:focus', 'esc:back']);
  });

  it('pauses the selected pipeline from run detail context', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{
      runId: 1,
      pipelineId: 42,
      pipelineStatus: 'running',
      featureId: 'feat-1',
      tool: 'codex',
      status: 'running',
      startedAt: '2026-07-06T10:00:00Z',
      endedAt: null,
      totalTokens: null,
      inputTokens: null,
      outputTokens: null,
      gateId: null,
      gateDecision: null,
      repoId: 'repo-1',
      pipelineResumeSummary: null,
    }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('p', {});
    expect(mockPausePipeline).toHaveBeenCalledWith(42);
  });

  it('shows run detail shortcut hints in the status bar', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{
      runId: 1,
      pipelineId: 42,
      pipelineStatus: 'running',
      featureId: 'feat-1',
      tool: 'codex',
      status: 'running',
      startedAt: '2026-07-06T10:00:00Z',
      endedAt: null,
      totalTokens: null,
      inputTokens: null,
      outputTokens: null,
      gateId: null,
      gateDecision: null,
      repoId: 'repo-1',
      pipelineResumeSummary: null,
    }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const statusBar = findElement(rootChildren, mockStatusBar);

    // F31 section 5 / US2: run-detail registers j/k (scroll), up/down,
    // PgUp/PgDn, and Tab/Shift+Tab section cycling as context shortcuts —
    // j/k merge into 'j/k:navigate' per the existing hint-building rule,
    // pushing some hints past the 6-entry cap.
    expect(statusBar?.props.shortcutHints).toEqual(['j/k:navigate', 'p:pause', 'x:abort', 'tab:next section', 'shift+tab:previous section', 'up:scroll up']);
  });

  it('aborts the selected feature with x in run detail context', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{
      runId: 1,
      pipelineId: 42,
      pipelineStatus: 'running',
      featureId: 'feat-1',
      tool: 'codex',
      status: 'running',
      startedAt: '2026-07-06T10:00:00Z',
      endedAt: null,
      totalTokens: null,
      inputTokens: null,
      outputTokens: null,
      gateId: null,
      gateDecision: null,
      repoId: 'repo-1',
      pipelineResumeSummary: null,
    }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('x', {});

    expect(mockRequestFeatureAbort).toHaveBeenCalledWith(42, 'feat-1');
    expect(mockAbortPipeline).not.toHaveBeenCalled();
  });

  // F31 section 5: j/k/PgUp/PgDn page through the detail body's sections;
  // `i` toggles density. These are run-detail-scoped so they don't collide
  // with the global j/k that move between kanban cards on the overview.
  it('scrolls, pages, and toggles density in the run-detail section body', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 2,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;

    handler('j', {});
    handler('k', {});
    handler('', { pageDown: true });
    handler('', { pageUp: true });
    handler('i', {});

    expect(setUi).toHaveBeenCalledTimes(5);
    const scrollDown = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const scrollUp = setUi.mock.calls[1]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const pageDown = setUi.mock.calls[2]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const pageUp = setUi.mock.calls[3]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const toggleDensity = setUi.mock.calls[4]?.[0] as (state: typeof stateValue) => typeof stateValue;

    expect(scrollDown(stateValue).detailSectionIndex).toBe(3);
    expect(scrollUp(stateValue).detailSectionIndex).toBe(1);
    expect(pageDown(stateValue).detailSectionIndex).toBeGreaterThan(stateValue.detailSectionIndex);
    expect(pageUp(stateValue).detailSectionIndex).toBeLessThan(stateValue.detailSectionIndex);
    expect(toggleDensity(stateValue).detailDense).toBe(true);
  });

  it('does not move between kanban cards when j/k are pressed in run-detail', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [
      { runId: 1, featureId: 'feat-1', status: 'running' },
      { runId: 2, featureId: 'feat-2', status: 'running' },
    ], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('j', {});

    // Only the run-detail scroll action should fire — the global column
    // navigation (selectedRun index) must not also move on the same key.
    expect(setUi).toHaveBeenCalledTimes(1);
    const action = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const result = action(stateValue);
    expect(result.detailSectionIndex).toBe(1);
    expect(result.selectedRun).toBe(stateValue.selectedRun);
  });

  // F31 "Riscos de UX resolvidos" item 5: resolving the last gate must not
  // leave focus orphaned on a column that happens to be empty — it falls
  // back to EXECUTION (or the first non-empty column) deterministically.
  it('falls back focus to the EXECUTION column once the last gate resolves off an empty column', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'gates',
      activeColumn: 'done',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const mainPanel = findElement(rootChildren, mockMainPanel);

    expect(mainPanel?.props.activeColumn).toBe('execution');
    expect(mainPanel?.props.focusPanel).toBe('columns');
  });

  // H11: the fallback above must be edge-triggered — it should reset
  // ui.focusPanel back to 'columns' as soon as the last gate resolves,
  // rather than staying derived from stale state forever (which would keep
  // reverting a later, deliberate navigation to an empty column).
  it('resets ui.focusPanel away from "gates" once the last gate resolves (H11)', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'gates',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{ runId: 1, featureId: 'feat-1', status: 'running' }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();

    const resetCall = setUi.mock.calls.find((call) => {
      const updater = call[0] as (state: typeof stateValue) => typeof stateValue;
      return updater(stateValue).focusPanel === 'columns';
    });
    expect(resetCall).toBeDefined();
  });

  // H11: MainPanel hides the "Recent activity" block whenever the vertical
  // budget is 'short' (terminal height < 24), regardless of how many
  // notifications are pending. The focus model must agree, or focus can
  // land on a panel that isn't actually rendered.
  it('does not resolve focus to "activity" when the vertical budget is short, even with notifications pending (H11)', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'activity',
      activeColumn: 'execution',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseTerminalHeight.mockReturnValue(20);
    mockUseNotifications.mockReturnValue([{ id: 1, message: 'something happened', createdAt: '2026-07-08T00:00:00Z' }]);
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const mainPanel = findElement(rootChildren, mockMainPanel);

    expect(mainPanel?.props.focusPanel).toBe('columns');
  });

  // H11: opening a run's detail screen keeps ui.focusPanel === 'columns'
  // (see openSelection), so canSwitchColumn/moveColumnLeft/moveColumnRight
  // must also check activeView, or ←/→ silently reassign activeColumn and
  // selectedRun behind the screen the user is actually looking at.
  it('does not switch the active column with arrow keys while a run detail is open (H11)', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'execution',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockUseRuns.mockReturnValue({ runs: [{
      runId: 1,
      pipelineId: 42,
      pipelineStatus: 'running',
      featureId: 'feat-1',
      tool: 'codex',
      status: 'running',
      startedAt: '2026-07-06T10:00:00Z',
      endedAt: null,
      totalTokens: null,
      inputTokens: null,
      outputTokens: null,
      gateId: null,
      gateDecision: null,
      repoId: 'repo-1',
      pipelineResumeSummary: null,
    }], error: null });
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('', { rightArrow: true });
    handler('', { leftArrow: true });

    expect(setUi).not.toHaveBeenCalled();
  });

  it('starts the selected pending feature with the current runtime args', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'columns',
      activeColumn: 'todo',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
      detailSectionIndex: 0,
      detailDense: false,
    };
    mockGetPendingFeatures.mockReturnValue([
      { id: 'feat-9', title: 'F09', tool: 'codex', effort: 'medium' },
    ]);
    const argvSpy = vi.spyOn(process, 'argv', 'get').mockReturnValue(['/usr/local/bin/node', '/repo/src/index.ts']);
    const execArgvSpy = vi.spyOn(process, 'execArgv', 'get').mockReturnValue([
      '--require',
      '/repo/node_modules/tsx/dist/preflight.cjs',
      '--import',
      'file:///repo/node_modules/tsx/dist/loader.mjs',
    ]);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('n', {});

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [
        '--require',
        '/repo/node_modules/tsx/dist/preflight.cjs',
        '--import',
        'file:///repo/node_modules/tsx/dist/loader.mjs',
        '/repo/src/index.ts',
        'run',
        '--feature',
        'feat-9',
      ],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        cwd: '/repo',
      }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith('ui:info', {
      message: 'Starting feat-9...',
    });

    argvSpy.mockRestore();
    execArgvSpy.mockRestore();
    cwdSpy.mockRestore();
  });
});
