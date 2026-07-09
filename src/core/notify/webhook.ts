import type { NotificationChannel } from './types.js';

export class WebhookChannel implements NotificationChannel {
  public readonly name = 'webhook';

  public constructor(private readonly url: string) {}

  public async send(message: string, metadata?: Record<string, unknown>): Promise<void> {
    await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, ...metadata }),
    });
  }
}
