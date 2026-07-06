import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackChannel } from '../../src/core/notify/slack.js';
import { DiscordChannel } from '../../src/core/notify/discord.js';
import { WebhookChannel } from '../../src/core/notify/webhook.js';
import { DesktopChannel } from '../../src/core/notify/desktop.js';

describe('SlackChannel', () => {
  it('posts JSON with text field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const ch = new SlackChannel('https://hooks.slack.com/test');
    await ch.send('hello slack');

    expect(fetchMock).toHaveBeenCalledWith('https://hooks.slack.com/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello slack' }),
    });

    vi.unstubAllGlobals();
  });
});

describe('DiscordChannel', () => {
  it('posts JSON with content field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const ch = new DiscordChannel('https://discord.com/api/webhooks/test');
    await ch.send('hello discord');

    expect(fetchMock).toHaveBeenCalledWith('https://discord.com/api/webhooks/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hello discord' }),
    });

    vi.unstubAllGlobals();
  });
});

describe('WebhookChannel', () => {
  it('posts message and metadata to the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const ch = new WebhookChannel('https://example.com/hook');
    await ch.send('hello webhook', { runId: 42 });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/hook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello webhook', runId: 42 }),
    });

    vi.unstubAllGlobals();
  });
});

describe('DesktopChannel', () => {
  it('does not throw even when the platform command is unavailable', async () => {
    const ch = new DesktopChannel();
    await expect(ch.send('test')).resolves.toBeUndefined();
  });
});
