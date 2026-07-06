import { getSecret } from '../../security/secrets.js';
import { loadConfig } from '../../config/index.js';
import type { NotificationChannel } from './types.js';

export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';

  constructor(private readonly chatId: string) {}

  async send(message: string): Promise<void> {
    const token = await getSecret('telegram-bot-token');
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.chatId, text: message }),
    });
  }
}

/** @deprecated Use TelegramChannel via the notification manager instead. */
export async function notify(message: string): Promise<void> {
  const token = await getSecret('telegram-bot-token');
  const chatId = loadConfig().telegramChatId;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
}
