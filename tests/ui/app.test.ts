import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const mockUseRuns = vi.fn();
const mockUseGates = vi.fn();
const mockUseRunOutput = vi.fn();
const mockUseTerminalWidth = vi.fn();
const mockUseNotifications = vi.fn();
const mockGetFeatureCatalog = vi.fn();
const mockMainPanel = vi.fn(() => React.createElement('main-panel'));
const mockSidebar = vi.fn(() => React.createElement('sidebar-panel'));
const mockStatusBar = vi.fn(() => React.createElement('status-bar'));
const mockCommandBar = vi.fn(() => React.createElement('command-bar'));
const mockUseInput = vi.fn();
let setUi: ReturnType<typeof vi.fn>;
let stateValue: {
  selectedRun: number;
  selectedGate: number;
  focusPanel: 'runs' | 'gates' | 'main';
  activeView: 'overview' | 'run';
  outputPaused: boolean;
};

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    default: actual.default,
    useState: vi.fn(() => [stateValue, setUi]),
  };
});

vi.mock('../../src/ui/hooks/useRuns.js', () => ({
  useRuns: mockUseRuns,
}));

vi.mock('../../src/ui/hooks/useGates.js', () => ({
  useGates: mockUseGates,
}));

vi.mock('../../src/ui/hooks/useRunOutput.js', () => ({
  useRunOutput: mockUseRunOutput,
}));

vi.mock('../../src/ui/hooks/useTerminalWidth.js', () => ({
  useTerminalWidth: mockUseTerminalWidth,
}));

vi.mock('../../src/ui/hooks/useNotifications.js', () => ({
  useNotifications: mockUseNotifications,
}));

vi.mock('../../src/ui/catalog.js', () => ({
  getFeatureCatalog: mockGetFeatureCatalog,
}));

vi.mock('../../src/ui/components/MainPanel.js', () => ({
  MainPanel: mockMainPanel,
}));

vi.mock('../../src/ui/components/Sidebar.js', () => ({
  Sidebar: mockSidebar,
}));

vi.mock('../../src/ui/components/StatusBar.js', () => ({
  StatusBar: mockStatusBar,
}));

vi.mock('../../src/ui/components/CommandBar.js', () => ({
  CommandBar: mockCommandBar,
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
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      focusPanel: 'runs',
      activeView: 'overview',
      outputPaused: false,
    };
    mockUseTerminalWidth.mockReturnValue(88);
    mockUseRuns.mockReturnValue([]);
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
    mockUseRunOutput.mockReturnValue([]);
    mockUseNotifications.mockReturnValue([]);
    mockGetFeatureCatalog.mockReturnValue({});
  });

  afterEach(() => {
    exitSpy.mockClear();
  });

  it('renders the multi-panel shell when there are no runs', async () => {
    const { App } = await import('../../src/ui/App.js');
    const element = App();
    const rootChildren = (element.props as { children: React.ReactNode }).children;
    const mainPanel = findElement(rootChildren, mockMainPanel);
    const sidebar = findElement(rootChildren, mockSidebar);
    const statusBar = findElement(rootChildren, mockStatusBar);
    const commandBar = findElement(rootChildren, mockCommandBar);

    expect(React.isValidElement(element)).toBe(true);
    expect(mainPanel?.props.runs).toEqual([]);
    expect(mainPanel?.props.output).toEqual([]);
    expect(sidebar?.props.mode).toBe('compact');
    expect(statusBar?.props.selectedRun).toBeNull();
    expect(commandBar?.props.hasRuns).toBe(false);
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
    const sidebar = findElement(rootChildren, mockSidebar);
    const statusBar = findElement(rootChildren, mockStatusBar);

    expect(mainPanel?.props.selectedRun?.runId).toBe(1);
    expect(mainPanel?.props.selectedFeature?.title).toBe('F05 — Layout Multi-Painel');
    expect(mainPanel?.props.outputPaused).toBe(false);
    expect(sidebar?.props.skills).toEqual(['implement']);
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
    handler('', { downArrow: true });
    handler('', { tab: true });
    handler('', { return: true });
    handler('', { escape: true });

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(setUi).toHaveBeenCalledTimes(4);

    const moveRun = setUi.mock.calls[0]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const tabFocus = setUi.mock.calls[1]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const openRun = setUi.mock.calls[2]?.[0] as (state: typeof stateValue) => typeof stateValue;
    const escapeRun = setUi.mock.calls[3]?.[0] as (state: typeof stateValue) => typeof stateValue;

    expect(moveRun(stateValue).selectedRun).toBe(1);
    expect(tabFocus(stateValue).focusPanel).toBe('gates');
    expect(openRun(stateValue)).toMatchObject({ activeView: 'run', focusPanel: 'main' });
    expect(escapeRun(stateValue)).toMatchObject({ activeView: 'overview', focusPanel: 'runs', outputPaused: false });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('toggles log pause with ctrl+s while a run detail is open', async () => {
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      focusPanel: 'main',
      activeView: 'run',
      outputPaused: false,
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

  it('handles gate decisions when the gates panel is focused', async () => {
    const resolve = vi.fn();
    stateValue = {
      selectedRun: 0,
      selectedGate: 0,
      focusPanel: 'gates',
      activeView: 'overview',
      outputPaused: false,
    };
    mockUseRuns.mockReturnValue([{ runId: 1, featureId: 'feat-1' }]);
    mockUseGates.mockReturnValue({
      gates: [{ id: 7, featureId: 'feat-1', repoId: 'repo-1' }],
      resolve,
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;

    handler('a', {});
    handler('s', {});
    handler('r', {});

    expect(resolve).toHaveBeenCalledWith(7, 'approved');
    expect(resolve).toHaveBeenCalledWith(7, 'skipped');
    expect(resolve).toHaveBeenCalledWith(7, 'retried');
  });
});
