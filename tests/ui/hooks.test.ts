import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ui hooks', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('useRuns loads initial rows and refreshes on interval', async () => {
    const setRuns = vi.fn();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const intervalCallbacks: Array<() => void> = [];
    const listeners = new Map<string, Array<() => void>>();

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

    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
      intervalCallbacks.push(fn);
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof setInterval);

    const { useRuns } = await import('../../src/ui/hooks/useRuns.js');
    const runs = useRuns(1234);

    expect(runs).toEqual([{ runId: 1 }]);
    listeners.get('run:start')?.[0]?.();
    expect(setRuns).toHaveBeenCalledWith([{ runId: 2 }]);
    intervalCallbacks[0]?.();
    const cleanup = (globalThis.setInterval as unknown as ReturnType<typeof vi.fn>).mock.results[0];
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    expect(cleanup).toBeDefined();
  });

  it('useRuns keeps stale data when db polling throws', async () => {
    const setRuns = vi.fn();
    const intervalCallbacks: Array<() => void> = [];
    const listeners = new Map<string, Array<() => void>>();

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

    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
      intervalCallbacks.push(fn);
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof setInterval);

    const { useRuns } = await import('../../src/ui/hooks/useRuns.js');
    expect(useRuns()).toEqual([]);
    expect(() => listeners.get('run:start')?.[0]?.()).not.toThrow();
    expect(() => intervalCallbacks[0]?.()).not.toThrow();
    expect(setRuns).not.toHaveBeenCalled();
  });

  it('useRunOutput loads the current tail and refreshes on matching events', async () => {
    const setOutput = vi.fn();
    const intervalCallbacks: Array<() => void> = [];
    const listeners = new Map<string, Array<(event: { runId: number }) => void>>();

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

    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
      intervalCallbacks.push(fn);
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof setInterval);

    const { useRunOutput } = await import('../../src/ui/hooks/useRunOutput.js');
    expect(useRunOutput(7, 123, 5)).toEqual([]);
    expect(setOutput).toHaveBeenCalledWith([{ id: 1, line: 'one' }]);

    listeners.get('run:output')?.[0]?.({ runId: 7 });
    await Promise.resolve();
    expect(setOutput).toHaveBeenCalledWith([{ id: 2, line: 'two' }]);

    intervalCallbacks[0]?.();
    expect(setOutput).toHaveBeenCalledWith([{ id: 3, line: 'three' }]);
  });

  it('useGates loads gates, resolves them and tolerates polling errors', async () => {
    const setGates = vi.fn();
    const openGates = vi.fn()
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 2 }])
      .mockImplementationOnce(() => {
        throw new Error('db locked');
      });
    const resolveGate = vi.fn();
    const intervalCallbacks: Array<() => void> = [];
    const listeners = new Map<string, Array<() => void>>();

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

    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
      intervalCallbacks.push(fn);
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof setInterval);

    const { useGates } = await import('../../src/ui/hooks/useGates.js');
    const result = useGates();

    expect(result.gates).toEqual([{ id: 1 }]);
    result.resolve(1, 'approved');
    expect(resolveGate).toHaveBeenCalledWith(1, 'approved');
    expect(setGates).toHaveBeenCalledWith([{ id: 2 }]);
    expect(() => listeners.get('gate:created')?.[0]?.()).not.toThrow();
    expect(() => intervalCallbacks[0]?.()).not.toThrow();
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
