import { describe, it, expect } from 'vitest';
import { ConfigSchema, NOTIFICABLE_EVENTS } from '../../src/config/index.js';

describe('ConfigSchema notifications defaults', () => {
  it('defaults to empty channels and two events when no config provided', () => {
    const cfg = ConfigSchema.parse({});
    expect(cfg.notifications.channels).toEqual([]);
    expect(cfg.notifications.events).toEqual(['gate:created', 'run:failed']);
  });

  it('accepts all valid channel types', () => {
    const cfg = ConfigSchema.parse({
      notifications: {
        channels: [
          { type: 'telegram', chatId: '123' },
          { type: 'slack', webhookUrl: 'https://hooks.slack.com/x' },
          { type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/x' },
          { type: 'webhook', url: 'https://example.com/hook' },
          { type: 'desktop' },
        ],
        events: ['gate:created', 'run:failed', 'budget:alert', 'run:done'],
      },
    });
    expect(cfg.notifications.channels).toHaveLength(5);
  });

  it('rejects unknown event names', () => {
    expect(() =>
      ConfigSchema.parse({
        notifications: { events: ['unknown:event'] },
      }),
    ).toThrow();
  });

  it('NOTIFICABLE_EVENTS covers all expected events', () => {
    expect(NOTIFICABLE_EVENTS).toContain('gate:created');
    expect(NOTIFICABLE_EVENTS).toContain('run:failed');
    expect(NOTIFICABLE_EVENTS).toContain('budget:alert');
    expect(NOTIFICABLE_EVENTS).toContain('run:done');
  });
});
