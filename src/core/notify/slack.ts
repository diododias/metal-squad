import type { NotificationChannel } from './types.js';

export class SlackChannel implements NotificationChannel {
  readonly name = 'slack';

  constructor(private readonly webhookUrl: string) {}

  async send(message: string): Promise<void> {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  }
}
