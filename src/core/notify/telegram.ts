import { getSecret } from '../../security/secrets.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import type { NotificationChannel } from './types.js';

const TELEGRAM_MESSAGE_LIMIT = 4096;

function splitMessage(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const fragments: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    fragments.push(text.slice(i, i + limit));
  }
  return fragments;
}

export class TelegramChannel implements NotificationChannel {
  public readonly name = 'telegram';

  public constructor(
    private readonly chatId: string,
    private readonly forumTopicId?: number,
  ) {}

  public async send(message: string, metadata?: Record<string, unknown>): Promise<void> {
    const token = await getSecret('telegram-bot-token');
    if (!token) return;

    const fragments = splitMessage(message);
    for (let i = 0; i < fragments.length; i += 1) {
      const body: Record<string, unknown> = {
        chat_id: this.chatId,
        text: fragments[i],
      };
      if (this.forumTopicId !== undefined) {
        body.message_thread_id = this.forumTopicId;
      }
      const isLastFragment = i === fragments.length - 1;
      if (isLastFragment && metadata?.reply_markup) {
        body.reply_markup = metadata.reply_markup;
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
  }
}

/** @deprecated Use TelegramChannel via the notification manager instead. */
export async function notify(message: string): Promise<void> {
  const token = await getSecret('telegram-bot-token');
  const chatId = resolveRuntimeConfig(process.cwd()).telegramChatId;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
}
