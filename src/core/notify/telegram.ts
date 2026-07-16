import { getSecret } from '../../security/secrets.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import type { NotificationChannel, NotificationMetadata } from './types.js';
import {
  isTelegramThreadUnavailable,
  invalidateFeatureTopic,
  resolveFeatureTopic,
  TelegramTopicError,
  type TelegramApiResponse,
} from './telegram-topics.js';
import { recordFeatureTopicAssociationError } from '../../db/repo.js';

const TELEGRAM_MESSAGE_LIMIT = 4096;

export function splitMessage(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const fragments: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    fragments.push(text.slice(i, i + limit));
  }
  return fragments;
}

async function telegramRequest(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<TelegramApiResponse> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
    return parsed as TelegramApiResponse;
  }
  return { ok: response.ok };
}

function telegramRequestError(response: TelegramApiResponse, method: string): TelegramTopicError {
  const detail = response.description ?? `Telegram ${method} failed`;
  const unavailable = method === 'sendMessage' && isTelegramThreadUnavailable(detail);
  return new TelegramTopicError(`${method}: ${detail}`, method, response.error_code, unavailable);
}

export class TelegramChannel implements NotificationChannel {
  public readonly name = 'telegram';

  public constructor(
    private readonly chatId: string,
    private readonly forumTopicId?: number,
  ) {}

  public async send(message: string, metadata?: NotificationMetadata): Promise<void> {
    const token = await getSecret('telegram-bot-token');
    if (!token) return;

    const featureId = typeof metadata?.featureId === 'string' && metadata.featureId.length > 0
      ? metadata.featureId
      : undefined;
    const featureName = typeof metadata?.featureName === 'string' ? metadata.featureName : undefined;
    let threadId = featureId
      ? await resolveFeatureTopic({
          chatId: this.chatId,
          featureId,
          featureName,
          api: async (method, payload) => telegramRequest(token, method, payload),
        })
      : this.forumTopicId;

    const fragments = splitMessage(message);
    for (let attempt = 0; attempt < (featureId ? 2 : 1); attempt += 1) {
      try {
        for (let i = 0; i < fragments.length; i += 1) {
          const body: Record<string, unknown> = {
            chat_id: this.chatId,
            text: fragments[i],
          };
          if (threadId !== undefined) body.message_thread_id = threadId;
          const isLastFragment = i === fragments.length - 1;
          if (isLastFragment && metadata?.reply_markup) body.reply_markup = metadata.reply_markup;

          const response = await telegramRequest(token, 'sendMessage', body);
          if (!response.ok) throw telegramRequestError(response, 'sendMessage');
        }
        return;
      } catch (error) {
        if (!featureId || attempt > 0 || !isTelegramThreadUnavailable(error)) {
          if (featureId) {
            const detail = error instanceof Error ? error.message : String(error);
            recordFeatureTopicAssociationError(this.chatId, featureId, detail, 'error');
          }
          throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        invalidateFeatureTopic(this.chatId, featureId, detail);
        threadId = await resolveFeatureTopic({
          chatId: this.chatId,
          featureId,
          featureName,
          api: async (method, payload) => telegramRequest(token, method, payload),
        });
      }
    }
  }
}

/** @deprecated Use TelegramChannel via the notification manager instead. */
export async function notify(message: string): Promise<void> {
  const token = await getSecret('telegram-bot-token');
  const channel = resolveRuntimeConfig(process.cwd()).notifications.channels
    .find((candidate) => candidate.type === 'telegram');
  const chatId = channel?.type === 'telegram' ? channel.chatId : undefined;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
}
