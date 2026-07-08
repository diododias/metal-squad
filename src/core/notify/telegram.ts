import { getSecret } from '../../security/secrets.js';
import { loadConfig } from '../../config/index.js';
import type { NotificationChannel } from './types.js';

export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';

  constructor(
    private readonly chatId: string,
    private readonly forumTopicId?: number,
  ) {}

  async send(message: string, metadata?: Record<string, unknown>): Promise<void> {
    const token = await getSecret('telegram-bot-token');
    if (!token) return;

    const body: Record<string, unknown> = {
      chat_id: this.chatId,
      text: message,
    };
    if (this.forumTopicId !== undefined) {
      body.message_thread_id = this.forumTopicId;
    }
    if (metadata?.reply_markup) {
      body.reply_markup = metadata.reply_markup;
    }

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
