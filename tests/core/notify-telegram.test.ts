import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSecret = vi.fn();
const mockResolveRuntimeConfig = vi.fn();
const mockFetch = vi.fn();

vi.mock('../../src/security/secrets.js', () => ({ getSecret: mockGetSecret }));
vi.mock('../../src/config/index.js', () => ({ resolveRuntimeConfig: mockResolveRuntimeConfig }));
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetModules();
  mockGetSecret.mockReset();
  mockResolveRuntimeConfig.mockReset();
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

  it('sends a message <= 4096 chars in a single sendMessage call (unchanged behavior)', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');
    const text = 'x'.repeat(4096);

    await ch.send(text);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.text).toBe(text);
  });

  it('splits a message > 4096 chars into multiple sequential sendMessage calls without losing content', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');
    const text = 'a'.repeat(4096) + 'b'.repeat(500);

    await ch.send(text);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    const secondBody = JSON.parse((mockFetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(firstBody.text).toBe('a'.repeat(4096));
    expect(secondBody.text).toBe('b'.repeat(500));
    expect(firstBody.text + secondBody.text).toBe(text);
  });

  it('attaches reply_markup only to the last fragment when the message is split', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');
    const text = 'a'.repeat(4096) + 'b'.repeat(500);
    const replyMarkup = { inline_keyboard: [[{ text: 'A', callback_data: 'input:1:0' }]] };

    await ch.send(text, { reply_markup: replyMarkup });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    const secondBody = JSON.parse((mockFetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(firstBody.reply_markup).toBeUndefined();
    expect(secondBody.reply_markup).toEqual(replyMarkup);
  });

  it('sends reply_markup on the only call when the message does not need to be split', async () => {
    mockGetSecret.mockResolvedValue('BOT_TOKEN');
    const { TelegramChannel } = await import('../../src/core/notify/telegram.js');
    const ch = new TelegramChannel('chat1');
    const replyMarkup = { inline_keyboard: [[{ text: 'A', callback_data: 'input:1:0' }]] };

    await ch.send('short message', { reply_markup: replyMarkup });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.reply_markup).toEqual(replyMarkup);
  });
});

describe('notify (deprecated)', () => {
  it('does nothing when token is falsy', async () => {
    mockGetSecret.mockResolvedValue(undefined);
    mockResolveRuntimeConfig.mockReturnValue({ telegramChatId: 'chat1' });
    const { notify } = await import('../../src/core/notify/telegram.js');

    await notify('hello');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does nothing when chatId is falsy', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockResolveRuntimeConfig.mockReturnValue({ telegramChatId: undefined });
    const { notify } = await import('../../src/core/notify/telegram.js');

    await notify('hello');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('posts message when both token and chatId are present', async () => {
    mockGetSecret.mockResolvedValue('TOKEN');
    mockResolveRuntimeConfig.mockReturnValue({ telegramChatId: 'chat99' });
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
