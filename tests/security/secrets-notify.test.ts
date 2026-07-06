import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetPassword = vi.fn();
const mockGetPassword = vi.fn();
const mockLoadConfig = vi.fn();

vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    constructor(_service: string, _account: string) {}

    setPassword(value: string): void {
      mockSetPassword(value);
    }

    getPassword(): string {
      return mockGetPassword();
    }
  },
}));

vi.mock('../../src/config/index.js', () => ({
  loadConfig: mockLoadConfig,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue({});
});

describe('secrets', () => {
  it('stores secrets in the keyring', async () => {
    const { setSecret } = await import('../../src/security/secrets.js');

    await setSecret('telegram-bot-token', 'secret');

    expect(mockSetPassword).toHaveBeenCalledWith('secret');
  });

  it('returns the stored secret when keyring succeeds', async () => {
    mockGetPassword.mockReturnValue('value');
    const { getSecret } = await import('../../src/security/secrets.js');

    await expect(Promise.resolve(getSecret('telegram-bot-token'))).resolves.toBe('value');
  });

  it('returns null when keyring access throws', async () => {
    mockGetPassword.mockImplementation(() => {
      throw new Error('locked');
    });
    const { getSecret } = await import('../../src/security/secrets.js');

    await expect(Promise.resolve(getSecret('telegram-bot-token'))).resolves.toBeNull();
  });
});

describe('notify', () => {
  it('does nothing when token or chat id are missing', async () => {
    vi.resetModules();
    vi.doMock('../../src/security/secrets.js', () => ({
      getSecret: vi.fn().mockResolvedValue(null),
    }));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { notify } = await import('../../src/core/notify/telegram.js');
    await notify('hello');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to telegram when configured', async () => {
    vi.resetModules();
    vi.doMock('../../src/security/secrets.js', () => ({
      getSecret: vi.fn().mockResolvedValue('bot-token'),
    }));
    mockLoadConfig.mockReturnValue({ telegramChatId: 'chat-1' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    const { notify } = await import('../../src/core/notify/telegram.js');
    await notify('ship it');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ chat_id: 'chat-1', text: 'ship it' }),
    );
  });

  it('subscribes to gate, run failure and budget events', async () => {
    vi.resetModules();
    vi.doMock('../../src/security/secrets.js', () => ({
      getSecret: vi.fn().mockResolvedValue('bot-token'),
    }));
    mockLoadConfig.mockReturnValue({ telegramChatId: 'chat-1' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    const { subscribeToNotifications } = await import('../../src/core/notify/telegram.js');
    const { bus } = await import('../../src/core/events/bus.js');
    const cleanup = subscribeToNotifications();

    bus.emit('gate:created', { gateId: 7, featureId: 'feat-07' });
    bus.emit('run:failed', { runId: 9, error: 'boom' });
    bus.emit('budget:alert', { percent: 80, spent: 800, limit: 1000 });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));

    const messages = fetchSpy.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).text);
    expect(messages).toContain('metal-squad: gate 7 aguardando decisão — feature feat-07');
    expect(messages).toContain('metal-squad: run 9 falhou — boom');
    expect(messages).toContain('metal-squad: alerta de budget — 80% usado (800/1000 tokens)');

    cleanup();
    fetchSpy.mockClear();
    bus.emit('gate:created', { gateId: 8, featureId: 'feat-08' });
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
