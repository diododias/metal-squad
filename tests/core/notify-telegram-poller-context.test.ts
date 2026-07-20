import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSecret = vi.fn();
const mockResolveGate = vi.fn();
const mockResolveStageRequest = vi.fn();
const mockGetStageRequest = vi.fn();
const mockGetGate = vi.fn();
const mockGetAssociation = vi.fn();
const mockFetch = vi.fn();

vi.mock('../../src/security/secrets.js', () => ({ getSecret: mockGetSecret }));
vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: vi.fn(() => ({
    telegramChatId: undefined,
    notifications: { channels: [{ type: 'telegram', chatId: 'chat-1' }] },
  })),
}));
vi.mock('../../src/db/repo.js', () => ({
  getFeatureTopicAssociation: mockGetAssociation,
  getGate: mockGetGate,
  getStageRequest: mockGetStageRequest,
  resolveGate: mockResolveGate,
  resolveStageRequest: mockResolveStageRequest,
  resumePipeline: vi.fn(),
  isCallbackProcessed: vi.fn(() => false),
  recordCallbackProcessed: vi.fn(() => true),
}));
vi.stubGlobal('fetch', mockFetch);

function response(updates: unknown[]) {
  return { ok: true, json: async () => ({ ok: true, result: updates }) };
}

describe('Telegram poller feature context', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetSecret.mockReset();
    mockResolveGate.mockReset();
    mockResolveStageRequest.mockReset();
    mockGetStageRequest.mockReset();
    mockGetGate.mockReset();
    mockGetAssociation.mockReset();
    mockFetch.mockReset();
  });

  it('accepts a stage response from the feature association topic', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetStageRequest.mockReturnValue({ id: 4, featureId: 'F54', status: 'pending' });
    mockGetAssociation.mockReturnValue({ state: 'active', threadId: 91 });
    let calls = 0;
    mockFetch.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve(response([{
        update_id: 1,
        message: { text: 'stage:4 advance', chat: { id: 'chat-1' }, message_thread_id: 91 },
      }])) : new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockResolveStageRequest).toHaveBeenCalledWith(4, 'advance');
    poller.stop();
  });

  it('ignores a command from another feature topic and acknowledges callbacks', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetGate.mockReturnValue({ id: 7, featureId: 'F54' });
    mockGetAssociation.mockReturnValue({ state: 'active', threadId: 91 });
    let calls = 0;
    mockFetch.mockImplementation((url: string) => {
      calls += 1;
      if (url.includes('getUpdates') && calls === 1) {
        return Promise.resolve(response([{
          update_id: 2,
          callback_query: {
            id: 'callback-1',
            data: 'gate:7 approve',
            message: { chat: { id: 'chat-1' }, message_thread_id: 92 },
          },
        }]));
      }
      if (url.includes('answerCallbackQuery')) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    });

    const { TelegramPoller } = await import('../../src/core/notify/telegram-poller.js');
    const poller = new TelegramPoller();
    poller.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockResolveGate).not.toHaveBeenCalled();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('answerCallbackQuery'))).toBe(true);
    poller.stop();
  });
});
