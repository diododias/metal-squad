import type { NotificationChannel } from './types.js';

export class SlackChannel implements NotificationChannel {
  public readonly name = 'slack';

  public constructor(private readonly webhookUrl: string) {}

  public async send(message: string): Promise<void> {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  }
}
