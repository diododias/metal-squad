import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetPassword = vi.fn();
const mockDeletePassword = vi.fn();
const mockGetPassword = vi.fn();
const mockLoadConfig = vi.fn();

vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    constructor(_service: string, _account: string) {}

    setPassword(value: string): void {
      mockSetPassword(value);
    }

    deletePassword(): void {
      mockDeletePassword();
    }

    getPassword(): string {
      return mockGetPassword();
    }
  },
}));

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: mockLoadConfig,
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

  it('removes secrets from the keyring without reading them', async () => {
    const { clearSecret } = await import('../../src/security/secrets.js');

    await clearSecret('telegram-bot-token');

    expect(mockDeletePassword).toHaveBeenCalledTimes(1);
    expect(mockGetPassword).not.toHaveBeenCalled();
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
});
