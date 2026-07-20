import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const mockGetSecret = vi.fn();
const mockResolveGate = vi.fn();
const mockResolveStageRequest = vi.fn();
const mockGetStageRequest = vi.fn();
const mockGetGate = vi.fn();
const mockGetFeatureTopicAssociation = vi.fn();
const mockGetTimeoutApprovalRequest = vi.fn();
const mockResolveTimeoutApproval = vi.fn();
const mockResumeBlockedRun = vi.fn();
const mockRecordCallbackProcessed = vi.fn();
const mockIsCallbackProcessed = vi.fn();
const mockGetPipeline = vi.fn();
const mockFindResumablePipeline = vi.fn();
const mockGetAdapter = vi.fn();
const mockResumePipelineWithOverride = vi.fn();
const mockFetch = vi.fn();

vi.mock('../../src/security/secrets.js', () => ({ getSecret: mockGetSecret }));
vi.mock('../../src/db/repo.js', () => ({
  resolveGate: mockResolveGate,
  resolveStageRequest: mockResolveStageRequest,
  getStageRequest: mockGetStageRequest,
  getGate: mockGetGate,
  getFeatureTopicAssociation: mockGetFeatureTopicAssociation,
  getTimeoutApprovalRequest: mockGetTimeoutApprovalRequest,
  resolveTimeoutApproval: mockResolveTimeoutApproval,
  recordCallbackProcessed: mockRecordCallbackProcessed,
  isCallbackProcessed: mockIsCallbackProcessed,
  getPipeline: mockGetPipeline,
  findResumablePipeline: mockFindResumablePipeline,
}));
vi.mock('../../src/core/runner/resume-blocked-run.js', () => ({ resumeBlockedRun: mockResumeBlockedRun }));
vi.mock('../../src/core/notify/resume-override.js', () => ({ resumePipelineWithOverride: mockResumePipelineWithOverride }));
vi.mock('../../src/core/adapters/index.js', () => ({ getAdapter: mockGetAdapter }));
vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: vi.fn(() => ({
    telegramChatId: undefined,
    notifications: { channels: [{ type: 'telegram', chatId: 'chat-1' }] },
  })),
}));
vi.stubGlobal('fetch', mockFetch);

/** Drain the microtask queue N levels deep */
async function flushMicrotasks(depth = 20) {
  for (let i = 0; i < depth; i++) await Promise.resolve();
}

function makeUpdateResponse(updates: Array<{
  update_id: number;
  message?: { text?: string; chat?: { id: string | number }; message_thread_id?: number };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id: string | number }; message_thread_id?: number };
  };
}>) {
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
  mockGetStageRequest.mockReset();
  mockGetGate.mockReset();
  mockGetFeatureTopicAssociation.mockReset();
  mockGetTimeoutApprovalRequest.mockReset();
  mockResolveTimeoutApproval.mockReset();
  mockResumeBlockedRun.mockReset();
  mockRecordCallbackProcessed.mockReset();
  mockRecordCallbackProcessed.mockReturnValue(true);
  mockIsCallbackProcessed.mockReset();
  mockIsCallbackProcessed.mockReturnValue(false);
  mockGetPipeline.mockReset();
  mockGetPipeline.mockReturnValue(null);
  mockFindResumablePipeline.mockReset();
  mockFindResumablePipeline.mockReturnValue(null);
  mockGetAdapter.mockReset();
  mockResumePipelineWithOverride.mockReset();
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

  it('resolves timeout retry command from callback_query data in the configured chat', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetTimeoutApprovalRequest.mockReturnValue({
      id: 9,
      featureId: 'feat-timeout',
      runId: 44,
      stage: 'implement',
    });
    mockResolveTimeoutApproval.mockReturnValue(true);
    let fetchCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          {
            update_id: 100,
            callback_query: {
              id: 'cb-timeout',
              data: 'timeout:9 retry',
              message: {
                chat: { id: 'chat-1' },
                message_thread_id: 321,
              },
            },
          },
        ]));
      }
      if (url.includes('answerCallbackQuery')) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResolveTimeoutApproval).toHaveBeenCalledWith(9, 'retry', {
      featureId: 'feat-timeout',
      runId: 44,
      stage: 'implement',
      chatId: 'chat-1',
      threadId: 321,
    });
    poller.stop();
  });

  it('approves a blocked run from a callback and acknowledges Telegram', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    let answeredCallback = false;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 101, callback_query: { id: 'cb-blocked-approve', data: 'blocked:approve:276' } },
        ]));
      }
      if (url.includes('answerCallbackQuery')) {
        answeredCallback = true;
        return Promise.resolve({ ok: true });
      }
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResumeBlockedRun).toHaveBeenCalledWith(276);
    expect(answeredCallback).toBe(true);
    poller.stop();
  });

  it('keeps a blocked run untouched on intervene and acknowledges Telegram', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    let fetchCount = 0;
    let answeredCallback = false;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 102, callback_query: { id: 'cb-blocked-intervene', data: 'blocked:intervene:276' } },
        ]));
      }
      if (url.includes('answerCallbackQuery')) {
        answeredCallback = true;
        return Promise.resolve({ ok: true });
      }
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResumeBlockedRun).not.toHaveBeenCalled();
    expect(answeredCallback).toBe(true);
    poller.stop();
  });

  it('acknowledges a failed blocked-run approval without breaking the poller', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockResumeBlockedRun.mockImplementation(() => { throw new Error('already resolved'); });
    let fetchCount = 0;
    let answeredCallback = false;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 103, callback_query: { id: 'cb-blocked-failure', data: 'blocked:approve:276' } },
        ]));
      }
      if (url.includes('answerCallbackQuery')) {
        answeredCallback = true;
        return Promise.resolve({ ok: true });
      }
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResumeBlockedRun).toHaveBeenCalledWith(276);
    expect(answeredCallback).toBe(true);
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

  it('resolves input:<id>:<index> callback by looking up options[index] and resolving with the label', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetStageRequest.mockReturnValue({ id: 30, status: 'pending', options: ['Option A', 'Option B'] });
    let fetchCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 12, callback_query: { id: 'cb2', data: 'input:30:1' } },
        ]));
      }
      if (url.includes('answerCallbackQuery')) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockGetStageRequest).toHaveBeenCalledWith(30);
    expect(mockResolveStageRequest).toHaveBeenCalledWith(30, 'Option B');
    poller.stop();
  });

  it('does not write and only answers the callback when the option index is out of range', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetStageRequest.mockReturnValue({ id: 31, status: 'pending', options: ['Option A'] });
    let fetchCount = 0;
    let answeredCallback = false;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 13, callback_query: { id: 'cb3', data: 'input:31:5' } },
        ]));
      }
      if (url.includes('answerCallbackQuery')) {
        answeredCallback = true;
        return Promise.resolve({ ok: true });
      }
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResolveStageRequest).not.toHaveBeenCalled();
    expect(answeredCallback).toBe(true);
    poller.stop();
  });

  it('does not write when the stage request is already resolved (late tap)', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetStageRequest.mockReturnValue({ id: 32, status: 'resolved', options: ['Option A', 'Option B'] });
    let fetchCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 14, callback_query: { id: 'cb4', data: 'input:32:0' } },
        ]));
      }
      if (url.includes('answerCallbackQuery')) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResolveStageRequest).not.toHaveBeenCalled();
    poller.stop();
  });

  it('does not throw when getStageRequest throws (DB unavailable) for an option tap', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetStageRequest.mockImplementation(() => { throw new Error('DB error'); });
    let fetchCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) {
        return Promise.resolve(makeUpdateResponse([
          { update_id: 15, callback_query: { id: 'cb5', data: 'input:33:0' } },
        ]));
      }
      if (url.includes('answerCallbackQuery')) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);
    poller.stop();

    expect(mockResolveStageRequest).not.toHaveBeenCalled();
  });

  it('regression (US2): "input:<id>:<index>" does not collide with GATE_CMD, STAGE_CMD, or "input:<id> <text>"', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetStageRequest.mockReturnValue({ id: 40, status: 'pending', options: ['A', 'B'] });
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 16, message: { text: 'gate:40 approve' } },
        { update_id: 17, message: { text: 'stage:40 advance' } },
        { update_id: 18, message: { text: 'input:40 free text response' } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveGate).toHaveBeenCalledWith(40, 'approved');
    expect(mockResolveStageRequest).toHaveBeenCalledWith(40, 'advance');
    expect(mockResolveStageRequest).toHaveBeenCalledWith(40, 'free text response');
    expect(mockGetStageRequest).not.toHaveBeenCalled();
    poller.stop();
  });

  it('accepts a stage response only from the associated feature topic', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetStageRequest.mockReturnValue({ id: 50, featureId: 'F54', status: 'pending' });
    mockGetFeatureTopicAssociation.mockReturnValue({ state: 'active', threadId: 91 });
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      if (++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        { update_id: 50, message: { text: 'stage:50 advance', chat: { id: 'chat-1' }, message_thread_id: 91 } },
      ]));
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(30);

    expect(mockResolveStageRequest).toHaveBeenCalledWith(50, 'advance');
    poller.stop();
  });

  it('acknowledges but ignores a callback from another feature topic', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetGate.mockReturnValue({ id: 51, featureId: 'F54' });
    mockGetFeatureTopicAssociation.mockReturnValue({ state: 'active', threadId: 91 });
    let fetchCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('getUpdates') && ++fetchCount === 1) return Promise.resolve(makeUpdateResponse([
        {
          update_id: 51,
          callback_query: {
            id: 'callback-51',
            data: 'gate:51 approve',
            message: { chat: { id: 'chat-1' }, message_thread_id: 92 },
          },
        },
      ]));
      if (url.includes('answerCallbackQuery')) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await flushMicrotasks(40);

    expect(mockResolveGate).not.toHaveBeenCalledWith(51, 'approved');
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('answerCallbackQuery'))).toBe(true);
    poller.stop();
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

  it('resumes a pipeline with another adapter when resume_override callback is received', async () => {
    mockGetSecret.mockResolvedValue('token');
    mockFindResumablePipeline.mockReturnValue({ id: 123, cwd: '/repo' });
    mockGetAdapter.mockReturnValue({ isAvailable: () => true });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();

    mockFetch.mockResolvedValueOnce(makeUpdateResponse([{
      update_id: 1,
      callback_query: { id: 'cb-1', data: 'resume_override:123:claude', message: { chat: { id: 'chat-1' } } },
    }]));
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, result: [] }) });

    poller.start();
    await flushMicrotasks();
    poller.stop();

    expect(mockRecordCallbackProcessed).toHaveBeenCalledWith('cb-1', 'resume_override', { pipelineId: 123, tool: 'claude' });
    expect(mockResumePipelineWithOverride).toHaveBeenCalledWith({ pipelineId: 123, tool: 'claude' });
  });

  it('ignores resume_override callback if it was already processed', async () => {
    mockGetSecret.mockResolvedValue('token');
    mockIsCallbackProcessed.mockReturnValue(true);

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();

    mockFetch.mockResolvedValueOnce(makeUpdateResponse([{
      update_id: 1,
      callback_query: { id: 'cb-1', data: 'resume_override:123:claude', message: { chat: { id: 'chat-1' } } },
    }]));
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, result: [] }) });

    poller.start();
    await flushMicrotasks();
    poller.stop();

    expect(mockRecordCallbackProcessed).not.toHaveBeenCalled();
    expect(mockResumePipelineWithOverride).not.toHaveBeenCalled();
  });

});
