import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSecret = vi.fn();
const mockLoadConfig = vi.fn();
const mockFetch = vi.fn();

vi.mock('../../src/security/secrets.js', () => ({ getSecret: mockGetSecret }));
vi.mock('../../src/config/index.js', () => ({ loadConfig: mockLoadConfig }));
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetModules();
  mockGetSecret.mockReset();
  mockLoadConfig.mockReset();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true });
});

describe('TelegramChannel', () => {
  it('does nothing when token is falsy', async () => {
    mockGetSecret.mockResolvedValue(undefined);
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');

    await ch.send('hello');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('posts message to Telegram API when token present', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');

    await ch.send('hello');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('BOT_TOKEN');
    expect(url).toContain('sendMessage');
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.chat_id).toBe('chat1');
    expect(body.text).toBe('hello');
  });

  it('includes message_thread_id when forumTopicId is set', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1', 99);

    await ch.send('hello');

    const [, opts] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.message_thread_id).toBe(99);
  });

  it('omits message_thread_id when forumTopicId is undefined', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');

    await ch.send('hello');

    const [, opts] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.message_thread_id).toBeUndefined();
  });

  it('includes reply_markup from metadata when provided', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');
    const replyMarkup = { inline_keyboard: [[{ text: 'OK', callback_data: 'ok' }]] };

    await ch.send('hi', { reply_markup: replyMarkup });

    const [, opts] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.reply_markup).toEqual(replyMarkup);
  });

  it('omits reply_markup when metadata has no reply_markup', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');

    await ch.send('hi', { featureId: 'feat-1' });

    const [, opts] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.reply_markup).toBeUndefined();
  });

  it('has name = telegram', async () => {
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');
    expect(ch.name).toBe('telegram');
  });

  it('uses POST method with application/json content-type', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');

    await ch.send('msg');

    const [, opts] = mockFetch.mock.calls[0]!;
    expect((opts as RequestInit).method).toBe('POST');
    expect(((opts as RequestInit).headers as Record<string, string>)['content-type']).toBe('application/json');
  });
});

describe('notify (deprecated)', () => {
  it('does nothing when token is falsy', async () => {
    mockGetSecret.mockResolvedValue(undefined);
    mockLoadConfig.mockReturnValue({ telegramChatId: 'chat1' });
    const { notify } = await import('../../src/core/notify/telegram.js');

    await notify('hello');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does nothing when chatId is falsy', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockLoadConfig.mockReturnValue({ telegramChatId: undefined });
    const { notify } = await import('../../src/core/notify/telegram.js');

    await notify('hello');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('posts message when both token and chatId are present', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockLoadConfig.mockReturnValue({ telegramChatId: 'chat99' });
    const { notify } = await import('../../src/core/notify/telegram.js');

    await notify('deprecation test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('TOKEN');
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.chat_id).toBe('chat99');
    expect(body.text).toBe('deprecation test');
  });
});
