import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const mockGetSecret = vi.fn();
const mockResolveGate = vi.fn();
const mockResolveStageRequest = vi.fn();
const mockFetch = vi.fn();

vi.mock('../../src/security/secrets.js', () => ({ getSecret: mockGetSecret }));
vi.mock('../../src/db/repo.js', () => ({
  resolveGate: mockResolveGate,
  resolveStageRequest: mockResolveStageRequest,
}));
vi.stubGlobal('fetch', mockFetch);

/** Drain the microtask queue N levels deep */
async function flushMicrotasks(depth = 20) {
  for (let i = 0; i < depth; i++) await Promise.resolve();
}

function makeUpdateResponse(updates: Array<{ update_id: number; message?: { text?: string }; callback_query?: { id: string; data?: string } }>) {
  return {
    ok: true,
    json: () => Promise.resolve({ ok: true, result: updates }),
  };
}

beforeEach(() => {
  vi.resetModules();
  mockGetSecret.mockReset();
  mockResolveGate.mockReset();
  mockResolveStageRequest.mockReset();
  mockFetch.mockReset();
});

afterEach(() => {
  // ensure no dangling timers
});

describe('TelegramPoller', () => {
  it('does not call fetch when token is missing', async () => {
    mockGetSecret.mockResolvedValue(null);
    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stop() prevents loop from running', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.stop(); // stop before start
    poller.start();
    await flushMicrotasks();
    // getSecret was awaited, but loop exited before fetch
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('resolves gate:approve command from message text', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 1, message: { text: 'gate:5 approve' } },
        ]));
      }
      // Stop the loop on the second call by returning a promise that never resolves
      // (poller.stop() will abort it)
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveGate).toHaveBeenCalledWith(5, 'approved');
    poller.stop();
  });

  it('resolves gate:skip command', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 2, message: { text: 'gate:7 skip' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveGate).toHaveBeenCalledWith(7, 'skipped');
    poller.stop();
  });

  it('resolves gate:retry command', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 3, message: { text: 'gate:9 retry' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveGate).toHaveBeenCalledWith(9, 'retried');
    poller.stop();
  });

  it('processes gate command from callback_query data', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 4, callback_query: { id: 'cb1', data: 'gate:3 approve' } },
        ]));
      }
      // answerCallbackQuery call
      if (url.includes('answerCallbackQuery')) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResolveGate).toHaveBeenCalledWith(3, 'approved');
    poller.stop();
  });

  it('resolves stage:advance command', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 5, message: { text: 'stage:10 advance' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveStageRequest).toHaveBeenCalledWith(10, 'advance');
    poller.stop();
  });

  it('resolves stage:hold command', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 6, message: { text: 'stage:11 hold' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveStageRequest).toHaveBeenCalledWith(11, 'hold');
    poller.stop();
  });

  it('resolves stage:retry command', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 7, message: { text: 'stage:12 retry' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveStageRequest).toHaveBeenCalledWith(12, 'retry');
    poller.stop();
  });

  it('resolves input command with text', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 8, message: { text: 'input:20 some user input text' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveStageRequest).toHaveBeenCalledWith(20, 'some user input text');
    poller.stop();
  });

  it('updates offset to update_id + 1 after each update', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let capturedUrl = '';
    let fetchCount = 0;
    mockFetch.mockImplementation((url: string) => {
      fetchCount++;
      if (fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 99, message: { text: 'unrelated text' } },
        ]));
      }
      capturedUrl = url;
      return new Promise(() => {}); // hang to stop loop
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(capturedUrl).toContain('offset=100');
    poller.stop();
  });

  it('sleeps on non-ok response and continues loop', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    vi.useFakeTimers();
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount === 1) return Promise.resolve({ ok: false });
      return new Promise(() => {}); // hang
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(10);

    // After non-ok response, sleep(5000) is called
    await vi.runAllTimersAsync();
    await flushMicrotasks(10);

    expect(fetchCount).toBeGreaterThanOrEqual(2);
    poller.stop();
    vi.useRealTimers();
  });

  it('handles exceptions in fetch and retries', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    vi.useFakeTimers();
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount === 1) return Promise.reject(new Error('network error'));
      return new Promise(() => {}); // hang
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(10);
    await vi.runAllTimersAsync();
    await flushMicrotasks(10);

    expect(fetchCount).toBeGreaterThanOrEqual(2);
    poller.stop();
    vi.useRealTimers();
  });

  it('skips gate resolution when decision is null (unknown decision string)', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        // 'gate:1 unknown' doesn't match GATE_CMD pattern → no resolveGate
        { update_id: 10, message: { text: 'some random text' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveGate).not.toHaveBeenCalled();
    expect(mockResolveStageRequest).not.toHaveBeenCalled();
    poller.stop();
  });

  it('does not throw when resolveGate throws (DB unavailable)', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockResolveGate.mockImplementation(() => { throw new Error('DB error'); });
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 11, message: { text: 'gate:1 approve' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);
    poller.stop();

    // Should not throw — error is swallowed
    expect(mockResolveGate).toHaveBeenCalled();
  });
});

describe('startTelegramPoller / stopTelegramPoller', () => {
  it('startTelegramPoller creates and starts a poller', async () => {
    mockGetSecret.mockResolvedValue(null); // no token = loop exits immediately
    const { startTelegramPoller, stopTelegramPoller } = await import('../../src/core/notify/telegram-poller.js');

    startTelegramPoller();
    await flushMicrotasks();
    stopTelegramPoller();

    // Just verify it doesn't throw
  });

  it('startTelegramPoller is idempotent — second call is a no-op', async () => {
    mockGetSecret.mockResolvedValue(null);
    const { startTelegramPoller, stopTelegramPoller } = await import('../../src/core/notify/telegram-poller.js');

    startTelegramPoller();
    startTelegramPoller(); // second call should not create another poller
    await flushMicrotasks();
    stopTelegramPoller();
  });

  it('stopTelegramPoller clears activePoller so startTelegramPoller can restart', async () => {
    mockGetSecret.mockResolvedValue(null);
    const { startTelegramPoller, stopTelegramPoller } = await import('../../src/core/notify/telegram-poller.js');

    startTelegramPoller();
    await flushMicrotasks();
    stopTelegramPoller();

    // Should be able to start again without issues
    startTelegramPoller();
    await flushMicrotasks();
    stopTelegramPoller();
  });

  it('stopTelegramPoller is safe when no poller is active', async () => {
    const { stopTelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    expect(() => stopTelegramPoller()).not.toThrow();
  });
});
