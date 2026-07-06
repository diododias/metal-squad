import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const mockUseRuns = vi.fn();
const mockUseGates = vi.fn();
const mockUseTerminalWidth = vi.fn();
const mockRunTable = vi.fn(() => React.createElement('run-table'));
const mockGatePanel = vi.fn(() => React.createElement('gate-panel'));
const mockEmptyState = vi.fn(() => React.createElement('empty-state'));
const mockUseInput = vi.fn();
let setSelectedGate: ReturnType<typeof vi.fn>;

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    default: actual.default,
    useState: vi.fn(() => [0, setSelectedGate]),
  };
});

vi.mock('../../src/ui/hooks/useRuns.js', () => ({
  useRuns: mockUseRuns,
}));

vi.mock('../../src/ui/hooks/useGates.js', () => ({
  useGates: mockUseGates,
}));

vi.mock('../../src/ui/hooks/useTerminalWidth.js', () => ({
  useTerminalWidth: mockUseTerminalWidth,
}));

vi.mock('../../src/ui/components/RunTable.js', () => ({
  RunTable: mockRunTable,
}));

vi.mock('../../src/ui/components/GatePanel.js', () => ({
  GatePanel: mockGatePanel,
}));

vi.mock('../../src/ui/components/EmptyState.js', () => ({
  EmptyState: mockEmptyState,
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

  beforeEach(() => {
    vi.clearAllMocks();
    setSelectedGate = vi.fn();
    mockUseTerminalWidth.mockReturnValue(88);
    mockUseRuns.mockReturnValue([]);
    mockUseGates.mockReturnValue({ gates: [], resolve: vi.fn() });
  });

  afterEach(() => {
    exitSpy.mockClear();
  });

  it('renders empty state when there are no runs', async () => {
    const { App } = await import('../../src/ui/App.js');
    const element = App();
    const children = React.Children.toArray((element.props as { children: React.ReactNode }).children);

    expect(React.isValidElement(element)).toBe(true);
    expect(children.some((child) => React.isValidElement(child) && child.type === mockEmptyState)).toBe(true);
    expect(children.some((child) => React.isValidElement(child) && child.type === mockRunTable)).toBe(false);
  });

  it('renders table and gate panel when data exists', async () => {
    mockUseRuns.mockReturnValue([{ runId: 1 }]);
    mockUseGates.mockReturnValue({
      gates: [{ id: 1, featureId: 'feat-1', repoId: 'repo-1' }],
      resolve: vi.fn(),
    });
    const { App } = await import('../../src/ui/App.js');

    const element = App();
    const children = React.Children.toArray((element.props as { children: React.ReactNode }).children);

    expect(children.some((child) => {
      if (!React.isValidElement(child) || child.type !== mockRunTable) return false;
      return child.props.runs[0]?.runId === 1 && child.props.width === 88;
    })).toBe(true);
    expect(children.some((child) => {
      if (!React.isValidElement(child) || child.type !== mockGatePanel) return false;
      return child.props.gates[0]?.id === 1 && child.props.selectedIndex === 0;
    })).toBe(true);
  });

  it('handles keyboard interactions', async () => {
    const resolve = vi.fn();
    mockUseRuns.mockReturnValue([{ runId: 1 }]);
    mockUseGates.mockReturnValue({
      gates: [{ id: 7, featureId: 'feat-1', repoId: 'repo-1' }],
      resolve,
    });
    const { App } = await import('../../src/ui/App.js');

    App();
    const handler = mockUseInput.mock.calls[0]?.[0] as (input: string, key: Record<string, boolean>) => void;

    handler('q', {});
    handler('', { upArrow: true });
    handler('', { downArrow: true });
    handler('a', {});
    handler('s', {});
    handler('r', {});

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(setSelectedGate).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledWith(7, 'approved');
    expect(resolve).toHaveBeenCalledWith(7, 'skipped');
    expect(resolve).toHaveBeenCalledWith(7, 'retried');
  });
});
