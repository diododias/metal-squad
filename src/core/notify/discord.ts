import type { NotificationChannel } from './types.js';

export class DiscordChannel implements NotificationChannel {
  public readonly name = 'discord';

  public constructor(private readonly webhookUrl: string) {}

  public async send(message: string): Promise<void> {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  }
}
