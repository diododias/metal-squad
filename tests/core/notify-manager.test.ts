import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadConfig = vi.fn();
const mockTelegramSend = vi.fn();
const mockSlackSend = vi.fn();
const mockDiscordSend = vi.fn();
const mockWebhookSend = vi.fn();
const mockDesktopSend = vi.fn();

const MockTelegramChannel = vi.fn(() => ({ send: mockTelegramSend }));
const MockSlackChannel = vi.fn(() => ({ send: mockSlackSend }));
const MockDiscordChannel = vi.fn(() => ({ send: mockDiscordSend }));
const MockWebhookChannel = vi.fn(() => ({ send: mockWebhookSend }));
const MockDesktopChannel = vi.fn(() => ({ send: mockDesktopSend }));

vi.mock('../../src/config/index.js', () => ({
  loadConfig: mockLoadConfig,
}));
vi.mock('../../src/core/notify/telegram.js', () => ({ TelegramChannel: MockTelegramChannel }));
vi.mock('../../src/core/notify/slack.js', () => ({ SlackChannel: MockSlackChannel }));
vi.mock('../../src/core/notify/discord.js', () => ({ DiscordChannel: MockDiscordChannel }));
vi.mock('../../src/core/notify/webhook.js', () => ({ WebhookChannel: MockWebhookChannel }));
vi.mock('../../src/core/notify/desktop.js', () => ({ DesktopChannel: MockDesktopChannel }));

function makeConfig(overrides: {
  events?: string[];
  channels?: unknown[];
  telegramChatId?: string;
} = {}) {
  return {
    notifications: {
      events: overrides.events ?? ['run:start', 'run:done', 'run:failed', 'gate:created', 'stage:approval', 'stage:input', 'budget:alert'],
      channels: overrides.channels ?? [],
    },
    telegramChatId: overrides.telegramChatId,
  };
}

beforeEach(() => {
  vi.resetModules();
  mockLoadConfig.mockReset();
  mockTelegramSend.mockReset().mockResolvedValue(undefined);
  mockSlackSend.mockReset().mockResolvedValue(undefined);
  mockDiscordSend.mockReset().mockResolvedValue(undefined);
  mockWebhookSend.mockReset().mockResolvedValue(undefined);
  mockDesktopSend.mockReset().mockResolvedValue(undefined);
  MockTelegramChannel.mockClear();
  MockSlackChannel.mockClear();
  MockDiscordChannel.mockClear();
  MockWebhookChannel.mockClear();
  MockDesktopChannel.mockClear();
});

describe('dispatch', () => {
  it('does nothing when event is not in notifications.events', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({ events: ['run:done'] }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:start', 'msg');

    expect(mockDesktopSend).not.toHaveBeenCalled();
    expect(mockTelegramSend).not.toHaveBeenCalled();
  });

  it('uses DesktopChannel fallback when no channels and no telegramChatId', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({ channels: [], telegramChatId: undefined }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:start', 'fallback message');

    expect(mockDesktopSend).toHaveBeenCalledWith('fallback message', undefined);
  });

  it('passes metadata to DesktopChannel fallback', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({ channels: [] }));
    const { dispatch } = await import('../../src/core/notify/manager.js');
    const meta = { featureId: 'feat-1' };

    await dispatch('run:start', 'msg', meta);

    expect(mockDesktopSend).toHaveBeenCalledWith('msg', meta);
  });

  it('builds TelegramChannel from telegramChatId when channels is empty', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({ channels: [], telegramChatId: 'chat123' }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:start', 'hello telegram');

    expect(MockTelegramChannel).toHaveBeenCalledWith('chat123', undefined);
    expect(mockTelegramSend).toHaveBeenCalledWith('hello telegram', undefined);
  });

  it('builds TelegramChannel from explicit channel config', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [{ type: 'telegram', chatId: 'explicit123', forumTopicId: 42 }],
    }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:done', 'done');

    expect(MockTelegramChannel).toHaveBeenCalledWith('explicit123', 42);
    expect(mockTelegramSend).toHaveBeenCalledWith('done', undefined);
  });

  it('builds SlackChannel from explicit channel config', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [{ type: 'slack', webhookUrl: 'https://hooks.slack.com/abc' }],
    }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:failed', 'fail msg');

    expect(MockSlackChannel).toHaveBeenCalledWith('https://hooks.slack.com/abc');
    expect(mockSlackSend).toHaveBeenCalledWith('fail msg', undefined);
  });

  it('builds DiscordChannel from explicit channel config', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [{ type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/xyz' }],
    }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('gate:created', 'gate msg');

    expect(MockDiscordChannel).toHaveBeenCalledWith('https://discord.com/api/webhooks/xyz');
    expect(mockDiscordSend).toHaveBeenCalledWith('gate msg', undefined);
  });

  it('builds WebhookChannel from explicit channel config', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [{ type: 'webhook', url: 'https://example.com/hook' }],
    }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('budget:alert', 'budget msg');

    expect(MockWebhookChannel).toHaveBeenCalledWith('https://example.com/hook');
    expect(mockWebhookSend).toHaveBeenCalledWith('budget msg', undefined);
  });

  it('builds DesktopChannel from explicit channel config', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [{ type: 'desktop' }],
    }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:start', 'desktop msg');

    expect(MockDesktopChannel).toHaveBeenCalled();
    expect(mockDesktopSend).toHaveBeenCalledWith('desktop msg', undefined);
  });

  it('sends to all channels when multiple are configured', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [
        { type: 'telegram', chatId: 'c1' },
        { type: 'slack', webhookUrl: 'https://slack/hook' },
      ],
    }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:done', 'multi');

    expect(mockTelegramSend).toHaveBeenCalledWith('multi', undefined);
    expect(mockSlackSend).toHaveBeenCalledWith('multi', undefined);
  });

  it('does not throw when a channel send rejects', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [{ type: 'telegram', chatId: 'c1' }],
    }));
    mockTelegramSend.mockRejectedValue(new Error('network error'));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await expect(dispatch('run:start', 'msg')).resolves.toBeUndefined();
  });

  it('does not throw when DesktopChannel fallback rejects', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({ channels: [] }));
    mockDesktopSend.mockRejectedValue(new Error('desktop error'));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await expect(dispatch('run:start', 'msg')).resolves.toBeUndefined();
  });

  it('prefers explicit channels over telegramChatId when both present', async () => {
    mockLoadConfig.mockReturnValue(makeConfig({
      channels: [{ type: 'slack', webhookUrl: 'https://slack/hook' }],
      telegramChatId: 'ignored',
    }));
    const { dispatch } = await import('../../src/core/notify/manager.js');

    await dispatch('run:start', 'msg');

    expect(MockTelegramChannel).not.toHaveBeenCalled();
    expect(mockSlackSend).toHaveBeenCalledWith('msg', undefined);
  });
});
