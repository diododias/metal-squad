import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAssociation = vi.fn();
const mockReserve = vi.fn();
const mockActivate = vi.fn();
const mockRecordError = vi.fn();
const mockInvalidate = vi.fn();
const mockGetSecret = vi.fn();
const mockFetch = vi.fn();

vi.mock('../../src/db/repo.js', () => ({
  getFeatureTopicAssociation: mockGetAssociation,
  reserveFeatureTopicAssociation: mockReserve,
  activateFeatureTopicAssociation: mockActivate,
  recordFeatureTopicAssociationError: mockRecordError,
  invalidateFeatureTopicAssociation: mockInvalidate,
}));
vi.mock('../../src/security/secrets.js', () => ({ getSecret: mockGetSecret }));
vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: vi.fn(() => ({ telegramChatId: undefined })),
}));
vi.stubGlobal('fetch', mockFetch);

function activeAssociation(threadId = 77) {
  return {
    chatId: 'chat-1',
    featureId: 'F54',
    threadId,
    title: 'F54 — Topics',
    state: 'active' as const,
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: 'now',
    updatedAt: 'now',
  };
}

describe('Telegram feature topic resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAssociation.mockReset();
    mockReserve.mockReset();
    mockActivate.mockReset();
    mockRecordError.mockReset();
    mockInvalidate.mockReset();
    mockGetSecret.mockReset();
    mockFetch.mockReset();
  });

  it('sanitizes names, preserves the stable id, and truncates to 128 characters', async () => {
    const { sanitizeTopicTitle } = await import('../../src/core/notify/telegram-topics.js');
    const title = sanitizeTopicTitle('F54\u0000', `  ${'A'.repeat(200)}\n`);
    expect(title.startsWith('F54 — ')).toBe(true);
    expect(title).toHaveLength(128);
    expect(title).not.toContain('\n');
  });

  it('creates one topic on the first feature-linked event', async () => {
    const { resolveFeatureTopic } = await import('../../src/core/notify/telegram-topics.js');
    mockGetAssociation.mockReturnValue(null);
    mockReserve.mockImplementation((_chatId: string, _featureId: string, title: string, options: { leaseToken: string; leaseExpiresAt: string }) => ({
      ...activeAssociation(),
      threadId: null,
      title,
      state: 'creating',
      leaseToken: options.leaseToken,
      leaseExpiresAt: options.leaseExpiresAt,
    }));
    const api = vi.fn()
      .mockResolvedValueOnce({ ok: true, result: { type: 'supergroup', is_forum: true } })
      .mockResolvedValueOnce({ ok: true, result: { message_thread_id: 77 } });

    const threadId = await resolveFeatureTopic({ chatId: 'chat-1', featureId: 'F54', featureName: 'Topics', api });

    expect(threadId).toBe(77);
    expect(api).toHaveBeenNthCalledWith(1, 'getChat', { chat_id: 'chat-1' });
    expect(api).toHaveBeenNthCalledWith(2, 'createForumTopic', { chat_id: 'chat-1', name: 'F54 — Topics' });
    expect(mockActivate).toHaveBeenCalledWith('chat-1', 'F54', 77);
  });

  it('reuses an active association and serializes concurrent first events', async () => {
    const { resolveFeatureTopic } = await import('../../src/core/notify/telegram-topics.js');
    mockGetAssociation.mockReturnValue(activeAssociation());
    const api = vi.fn();

    const result = await Promise.all([
      resolveFeatureTopic({ chatId: 'chat-1', featureId: 'F54', api }),
      resolveFeatureTopic({ chatId: 'chat-1', featureId: 'F54', api }),
    ]);

    expect(result).toEqual([77, 77]);
    expect(api).not.toHaveBeenCalled();
    expect(mockReserve).not.toHaveBeenCalled();
  });

  it('persists an actionable error for an incompatible destination', async () => {
    const { resolveFeatureTopic } = await import('../../src/core/notify/telegram-topics.js');
    mockGetAssociation.mockReturnValue(null);
    mockReserve.mockImplementation((_chatId: string, _featureId: string, title: string, options: { leaseToken: string; leaseExpiresAt: string }) => ({
      ...activeAssociation(),
      threadId: null,
      title,
      state: 'creating',
      leaseToken: options.leaseToken,
      leaseExpiresAt: options.leaseExpiresAt,
    }));
    const api = vi.fn().mockResolvedValue({ ok: true, result: { type: 'group', is_forum: false } });

    await expect(resolveFeatureTopic({ chatId: 'chat-1', featureId: 'F54', api })).rejects.toThrow(/forum-enabled supergroup/);
    expect(mockRecordError).toHaveBeenCalledWith('chat-1', 'F54', expect.stringContaining('forum-enabled supergroup'));
  });

  it('sends feature fragments to the resolved thread and keeps buttons on the final fragment', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetAssociation.mockReturnValue(activeAssociation(91));
    mockFetch.mockImplementation(async (_url: string, options: RequestInit) => ({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
      options,
    }));
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const channel = new TelegramChannel('chat-1');
    const text = 'a'.repeat(4096) + 'b'.repeat(2);
    const markup = { inline_keyboard: [[{ text: 'Approve', callback_data: 'gate:1 approve' }]] };

    await channel.send(text, { featureId: 'F54', reply_markup: markup });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    const second = JSON.parse((mockFetch.mock.calls[1]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(first.message_thread_id).toBe(91);
    expect(first.reply_markup).toBeUndefined();
    expect(second.message_thread_id).toBe(91);
    expect(second.reply_markup).toEqual(markup);
  });

  it('recreates the same feature association once when Telegram reports a missing thread', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockGetAssociation
      .mockReturnValueOnce(activeAssociation(91))
      .mockReturnValueOnce(null);
    mockReserve.mockImplementation((_chatId: string, _featureId: string, title: string, options: { leaseToken: string; leaseExpiresAt: string }) => ({
      ...activeAssociation(),
      threadId: null,
      title,
      state: 'creating',
      leaseToken: options.leaseToken,
      leaseExpiresAt: options.leaseExpiresAt,
    }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: message thread not found' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { type: 'supergroup', is_forum: true } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_thread_id: 92 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: {} }) });

    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    await new TelegramChannel('chat-1').send('retry me', { featureId: 'F54' });

    expect(mockInvalidate).toHaveBeenCalledWith('chat-1', 'F54', expect.stringContaining('thread not found'));
    expect(mockActivate).toHaveBeenCalledWith('chat-1', 'F54', 92);
    expect(JSON.parse((mockFetch.mock.calls[3]![1] as RequestInit).body as string).message_thread_id).toBe(92);
  });
});
