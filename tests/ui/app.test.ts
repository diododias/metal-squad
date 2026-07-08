import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const mockUseRuns = vi.fn();
const mockUseCompletedFeatures = vi.fn(() => new Set<string>());
const mockUseTaskRuns = vi.fn(() => []);
const mockUseRunningTasks = vi.fn(() => []);
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
const mockLoadBacklog = vi.fn(() => ({ epics: [] }));
const mockValidateBacklogSkills = vi.fn();
const mockAssertWritableDbPath = vi.fn();
const mockPausePipeline = vi.fn();
const mockResumePipeline = vi.fn();
const mockRequestFeatureAbort = vi.fn();
const mockAbortPipeline = vi.fn();
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
  useRunBreakdown: vi.fn(() => null),
}));

vi.mock('../../src/ui/hooks/useStatsRows.js', () => ({
  useStatsRows: vi.fn(() => []),
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
  loadConfig: mockLoadConfig,
}));

vi.mock('../../src/core/backlog/load.js', () => ({
  loadBacklog: mockLoadBacklog,
}));

vi.mock('../../src/core/skills/index.js', () => ({
  validateBacklogSkills: mockValidateBacklogSkills,
}));

vi.mock('../../src/db/index.js', () => ({
  assertWritableDbPath: mockAssertWritableDbPath,
}));

vi.mock('../../src/db/repo.js', () => ({
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
    mockUseRuns.mockReturnValue([]);
    mockUseRunningTasks.mockReturnValue([]);
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

  it('passes the resolved theme notice to the status bar when the configured theme is unknown', async () => {
    mockLoadConfig.mockReturnValue({ concurrency: 3, theme: 'solarized' });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const statusBar = findElement(rootChildren, mockStatusBar);

    expect(statusBar?.props.themeNotice).toContain('solarized');
    expect(statusBar?.props.themeNotice).toContain('default');
    expect(mockEventBusEmit).toHaveBeenCalledWith('ui:notice', {
      message: 'Theme "solarized" is not supported. Using "default".',
    });
  });

  it('does not emit a fallback notice when the configured theme is supported', async () => {
    mockLoadConfig.mockReturnValue({ concurrency: 3, theme: 'dark' });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const statusBar = findElement(rootChildren, mockStatusBar);

    expect(statusBar?.props.themeNotice).toBeNull();
    expect(mockEventBusEmit).not.toHaveBeenCalledWith('ui:notice', expect.anything());
  });

  it('passes selected run metadata to child panels', async () => {
    mockUseRuns.mockReturnValue([{
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
    }]);
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
    mockUseRuns.mockReturnValue([
      { runId: 1, featureId: 'feat-1', status: 'running' },
      { runId: 2, featureId: 'feat-2', status: 'running' },
    ]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{
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
    }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([{
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
    }]);
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
    mockUseRuns.mockReturnValue([{
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
    }]);
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const statusBar = findElement(rootChildren, mockStatusBar);

    // F31 section 5: run-detail now also registers j/k (scroll), up/down,
    // and PgUp/PgDn as context shortcuts — j/k merge into 'j/k:navigate'
    // per the existing hint-building rule, pushing some hints past the cap.
    expect(statusBar?.props.shortcutHints).toEqual(['j/k:navigate', 'p:pause', 'x:abort', 'up:scroll up', 'down:scroll down', 'pageup:page up']);
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
    mockUseRuns.mockReturnValue([{
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
    }]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
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
    mockUseRuns.mockReturnValue([
      { runId: 1, featureId: 'feat-1', status: 'running' },
      { runId: 2, featureId: 'feat-2', status: 'running' },
    ]);
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
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1', status: 'running' }]);
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const mainPanel = findElement(rootChildren, mockMainPanel);

    expect(mainPanel?.props.activeColumn).toBe('execution');
    expect(mainPanel?.props.focusPanel).toBe('columns');
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
