import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const mockUseRuns = vi.fn();
const mockUseCompletedFeatures = vi.fn(() => new Set<string>());
const mockUseTaskRuns = vi.fn(() => []);
const mockUseGates = vi.fn();
const mockUseRunOutput = vi.fn();
const mockUseTerminalWidth = vi.fn();
const mockUseNotifications = vi.fn();
const mockUseToasts = vi.fn(() => []);
const mockGetFeatureCatalog = vi.fn();
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
  focusPanel: 'runs' | 'gates' | 'main';
  activeView: 'overview' | 'run' | 'notifications';
  outputPaused: boolean;
  logsVisible: boolean;
  dashboard?: boolean;
  dashboardPeriod?: number;
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

vi.mock('../../src/ui/hooks/useNotifications.js', () => ({
  useNotifications: mockUseNotifications,
}));

vi.mock('../../src/ui/hooks/useToasts.js', () => ({
  useToasts: mockUseToasts,
}));

vi.mock('../../src/ui/catalog.js', () => ({
  getFeatureCatalog: mockGetFeatureCatalog,
  getPendingFeatures: mockGetPendingFeatures,
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
      focusPanel: 'runs',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseTerminalWidth.mockReturnValue(88);
    mockUseRuns.mockReturnValue([]);
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
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
      { runId: 1, featureId: 'feat-1' },
      { runId: 2, featureId: 'feat-2' },
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
    expect(escapeRun(stateValue)).toMatchObject({ activeView: 'overview', focusPanel: 'main', outputPaused: false });
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
      focusPanel: 'runs',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
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
    expect(openRun(stateValue)).toMatchObject({ activeView: 'run', focusPanel: 'main' });
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
      focusPanel: 'main',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
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
      focusPanel: 'main',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
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
      focusPanel: 'runs',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
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
      focusPanel: 'runs',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('o', {});

    expect(setUi).toHaveBeenCalledTimes(1);
    const toggle = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    expect(toggle(stateValue)).toMatchObject({ activeView: 'notifications', focusPanel: 'main' });
  });

  it('handles gate decisions when the gates panel is focused', async () => {
    const resolve = vi.fn();
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'gates',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
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

  it('ignores context shortcuts outside their active panels', async () => {
    const resolve = vi.fn();
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
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;
    handler('a', {});
    handler('s', {});
    handler('r', {});
    handler('p', {});
    handler('x', {});

    expect(resolve).not.toHaveBeenCalled();
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
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
    mockUseGates.mockReturnValue({
      gates: [{ kind: 'gate', id: 7, featureId: 'feat-1', repoId: 'repo-1', prompt: '', createdAt: '' }],
      resolve: vi.fn(),
    });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const statusBar = findElement(rootChildren, mockStatusBar);

    expect(statusBar?.props.shortcutHints).toEqual(['a:approve', 's:skip', 'r:retry', 'tab:focus', 'esc:back', '?:help']);
  });

  it('pauses the selected pipeline from run detail context', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'main',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
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
      focusPanel: 'main',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
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

    expect(statusBar?.props.shortcutHints).toEqual(['p:pause', 'x:abort', '^l:logs', 'esc:back', '?:help', '^p:palette']);
  });

  it('aborts the selected feature with x in run detail context', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'main',
      activeView: 'run',
      outputPaused: false,
      logsVisible: true,
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

  it('starts the selected pending feature with the current runtime args', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      selectedPending: 0,
      focusPanel: 'runs',
      activeView: 'overview',
      outputPaused: false,
      logsVisible: true,
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
