import type { NotificationChannel } from './types.js';

export class WebhookChannel implements NotificationChannel {
  readonly name = 'webhook';

  constructor(private readonly url: string) {}

  async send(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, ...metadata }),
    });
  }
}
