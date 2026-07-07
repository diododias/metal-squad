import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ui hooks', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('useRuns loads initial rows and refreshes on event', async () => {
    const setRuns = vi.fn();
    const listeners = new Map<string, Array<() => void>>();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    vi.doMock('react', () => ({
      useState: (value: unknown) => [typeof value === 'function' ? (value as () => unknown)() : value, setRuns],
      useEffect: (effect: () => (() => void) | void) => {
        const cleanup = effect();
        expect(cleanup).toBeTypeOf('function');
      },
    }));

    vi.doMock('../../src/db/repo.js', () => ({
      listRunsForTui: vi.fn()
        .mockReturnValueOnce([{ runId: 1 }])
        .mockReturnValueOnce([{ runId: 2 }]),
    }));

    vi.doMock('../../src/core/events/index.js', () => ({
      msqEventBus: {
        subscribe: vi.fn((event: string, listener: () => void) => {
          const current = listeners.get(event) ?? [];
          current.push(listener);
          listeners.set(event, current);
          return () => {};
        }),
      },
    }));

    const { useRuns } = await import('../../src/ui/hooks/useRuns.js');
    const runs = useRuns(1234);

    expect(runs).toEqual([{ runId: 1 }]);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1234);
    listeners.get('run:start')?.[0]?.();
    expect(setRuns).toHaveBeenCalledWith([{ runId: 2 }]);
  });

  it('useRuns keeps stale data when db refresh throws', async () => {
    const setRuns = vi.fn();
    const listeners = new Map<string, Array<() => void>>();
    vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    vi.doMock('react', () => ({
      useState: (value: unknown) => [typeof value === 'function' ? (value as () => unknown)() : value, setRuns],
      useEffect: (effect: () => void) => effect(),
    }));

    vi.doMock('../../src/db/repo.js', () => ({
      listRunsForTui: vi.fn()
        .mockReturnValueOnce([])
        .mockImplementation(() => {
          throw new Error('db locked');
        }),
    }));

    vi.doMock('../../src/core/events/index.js', () => ({
      msqEventBus: {
        subscribe: vi.fn((event: string, listener: () => void) => {
          const current = listeners.get(event) ?? [];
          current.push(listener);
          listeners.set(event, current);
          return () => {};
        }),
      },
    }));

    const { useRuns } = await import('../../src/ui/hooks/useRuns.js');
    expect(useRuns()).toEqual([]);
    expect(() => listeners.get('run:start')?.[0]?.()).not.toThrow();
    expect(setRuns).not.toHaveBeenCalled();
  });

  it('useRunOutput loads the current tail and refreshes on matching events', async () => {
    const setOutput = vi.fn();
    const listeners = new Map<string, Array<(event: { runId: number }) => void>>();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    vi.doMock('react', () => ({
      useState: () => [[], setOutput],
      useEffect: (effect: () => void) => effect(),
      useCallback: <T extends (...args: any[]) => any>(fn: T) => fn,
    }));

    vi.doMock('../../src/db/repo.js', () => ({
      listRunOutput: vi.fn()
        .mockReturnValueOnce([{ id: 1, line: 'one' }])
        .mockReturnValueOnce([{ id: 2, line: 'two' }])
        .mockReturnValueOnce([{ id: 3, line: 'three' }]),
    }));

    vi.doMock('../../src/core/events/index.js', () => ({
      msqEventBus: {
        subscribe: vi.fn((event: string, listener: (payload: { runId: number }) => void) => {
          const current = listeners.get(event) ?? [];
          current.push(listener);
          listeners.set(event, current);
          return () => {};
        }),
      },
    }));

    const { useRunOutput } = await import('../../src/ui/hooks/useRunOutput.js');
    expect(useRunOutput(7, 123, 5)).toEqual([]);
    expect(setOutput).toHaveBeenCalledWith([{ id: 1, line: 'one' }]);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 123);

    listeners.get('run:output')?.[0]?.({ runId: 7 });
    await Promise.resolve();
    expect(setOutput).toHaveBeenCalledWith([{ id: 2, line: 'two' }]);
  });

  it('useGates loads gates, resolves them and tolerates refresh errors', async () => {
    const setGates = vi.fn();
    const openGates = vi.fn()
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 2 }])
      .mockImplementationOnce(() => {
        throw new Error('db locked');
      });
    const resolveGate = vi.fn();
    const listeners = new Map<string, Array<() => void>>();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    vi.doMock('react', () => ({
      useState: (value: unknown) => [typeof value === 'function' ? (value as () => unknown)() : value, setGates],
      useEffect: (effect: () => void) => effect(),
      useCallback: <T extends (...args: any[]) => any>(fn: T) => fn,
    }));

    vi.doMock('../../src/db/repo.js', () => ({
      openGates,
      resolveGate,
    }));

    vi.doMock('../../src/core/events/index.js', () => ({
      msqEventBus: {
        subscribe: vi.fn((event: string, listener: () => void) => {
          const current = listeners.get(event) ?? [];
          current.push(listener);
          listeners.set(event, current);
          return () => {};
        }),
      },
    }));

    const { useGates } = await import('../../src/ui/hooks/useGates.js');
    const result = useGates();

    expect(result.gates).toEqual([{ id: 1 }]);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    result.resolve(1, 'approved');
    expect(resolveGate).toHaveBeenCalledWith(1, 'approved');
    expect(setGates).toHaveBeenCalledWith([{ id: 2 }]);
    expect(() => listeners.get('gate:created')?.[0]?.()).not.toThrow();
  });

  it('useTaskRuns loads persisted rows and updates matching run events', async () => {
    const setTaskRuns = vi.fn();
    const listeners = new Map<string, Array<(event: any) => void>>();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    vi.doMock('react', () => ({
      useState: (value: unknown) => [typeof value === 'function' ? (value as () => unknown)() : value, setTaskRuns],
      useEffect: (effect: () => void) => effect(),
    }));

    vi.doMock('../../src/db/repo.js', () => ({
      listRunsForTui: vi.fn(),
      listTaskRunsForRun: vi.fn().mockReturnValue([{ taskId: 'T1', status: 'running' }]),
    }));

    vi.doMock('../../src/core/events/index.js', () => ({
      msqEventBus: {
        subscribe: vi.fn((event: string, listener: (payload: any) => void) => {
          const current = listeners.get(event) ?? [];
          current.push(listener);
          listeners.set(event, current);
          return () => {};
        }),
      },
    }));

    const { useTaskRuns } = await import('../../src/ui/hooks/useRuns.js');
    expect(useTaskRuns(7)).toEqual([{ taskId: 'T1', status: 'running' }]);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    listeners.get('task:started')?.[0]?.({
      runId: 7,
      taskId: 'T2',
      title: 'Task 2',
      stage: 'implement',
    });
    expect(setTaskRuns).toHaveBeenCalledWith(expect.any(Function));

    const startedUpdater = setTaskRuns.mock.calls.at(-1)?.[0] as (value: any[]) => any[];
    expect(startedUpdater([{ taskId: 'T1', title: 'Task 1', status: 'running', stage: null, endedAt: null }])).toEqual([
      { taskId: 'T1', title: 'Task 1', status: 'running', stage: null, endedAt: null },
      {
        id: 0,
        runId: 7,
        taskId: 'T2',
        title: 'Task 2',
        status: 'running',
        stage: 'implement',
        startedAt: expect.any(String),
        endedAt: null,
      },
    ]);

    listeners.get('task:updated')?.[0]?.({
      runId: 7,
      taskId: 'T1',
      status: 'done',
      stage: 'implement',
      endedAt: '2026-07-06T00:00:00.000Z',
    });
    const updatedUpdater = setTaskRuns.mock.calls.at(-1)?.[0] as (value: any[]) => any[];
    expect(updatedUpdater([{ taskId: 'T1', title: 'Task 1', status: 'running', stage: null, endedAt: null }])).toEqual([
      {
        taskId: 'T1',
        title: 'Task 1',
        status: 'done',
        stage: 'implement',
        endedAt: '2026-07-06T00:00:00.000Z',
      },
    ]);
  });

  it('useTerminalWidth subscribes to resize events', async () => {
    const setWidth = vi.fn();
    let cleanup: (() => void) | void;
    const on = vi.spyOn(process.stdout, 'on');
    const off = vi.spyOn(process.stdout, 'off');

    vi.doMock('react', () => ({
      useState: (value: unknown) => [typeof value === 'function' ? (value as () => unknown)() : value, setWidth],
      useEffect: (effect: () => (() => void) | void) => {
        cleanup = effect();
      },
    }));

    const { useTerminalWidth } = await import('../../src/ui/hooks/useTerminalWidth.js');
    const width = useTerminalWidth();

    expect(width).toBe(process.stdout.columns ?? 80);
    expect(on).toHaveBeenCalledWith('resize', expect.any(Function));
    const listener = on.mock.calls[0]?.[1] as (() => void);
    listener();
    expect(setWidth).toHaveBeenCalledWith(process.stdout.columns ?? 80);
    cleanup?.();
    expect(off).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
