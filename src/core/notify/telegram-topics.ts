import { randomUUID } from 'node:crypto';
import {
  activateFeatureTopicAssociation,
  getFeatureTopicAssociation,
  invalidateFeatureTopicAssociation,
  recordFeatureTopicAssociationError,
  reserveFeatureTopicAssociation,
  type FeatureTopicAssociationRow,
} from '../../db/repo.js';

export interface TelegramApiResponse {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
}

export type TelegramApiRequest = (
  method: string,
  payload: Record<string, unknown>,
) => Promise<TelegramApiResponse>;

export class TelegramTopicError extends Error {
  public constructor(
    message: string,
    public readonly operation: string,
    public readonly errorCode?: number,
    public readonly threadUnavailable = false,
  ) {
    super(message);
    this.name = 'TelegramTopicError';
  }
}

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join('');
}

export function sanitizeTopicTitle(featureId: string, featureName?: string): string {
  const stableId = removeControlCharacters(featureId).replace(/\s+/g, ' ').trim() || 'feature';
  const cleanName = removeControlCharacters(featureName ?? '').replace(/\s+/g, ' ').trim();
  const prefix = cleanName ? `${stableId} — ${cleanName}` : stableId;
  if (prefix.length <= 128) return prefix;
  return prefix.slice(0, 128).trimEnd();
}

const locks = new Map<string, Promise<number>>();

function lockKey(chatId: string, featureId: string): string {
  return `${chatId}\u0000${featureId}`;
}

function isLeaseActive(row: FeatureTopicAssociationRow): boolean {
  return row.state === 'creating'
    && row.leaseExpiresAt !== null
    && Date.parse(row.leaseExpiresAt) > Date.now();
}

async function waitForActiveAssociation(chatId: string, featureId: string): Promise<FeatureTopicAssociationRow | null> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = getFeatureTopicAssociation(chatId, featureId);
    if (!current || current.state === 'active' || !isLeaseActive(current)) return current;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return getFeatureTopicAssociation(chatId, featureId);
}

function apiError(response: TelegramApiResponse, operation: string): TelegramTopicError {
  const detail = response.description ?? `Telegram ${operation} failed`;
  return new TelegramTopicError(`${operation}: ${detail}`, operation, response.error_code);
}

async function createOrResolveFeatureTopic(
  options: ResolveFeatureTopicOptions,
): Promise<number> {
  const { chatId, featureId, featureName, api } = options;
  const existing = getFeatureTopicAssociation(chatId, featureId);
  if (existing?.state === 'active' && existing.threadId !== null) return existing.threadId;

  const title = existing?.title ?? sanitizeTopicTitle(featureId, featureName);
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + (options.leaseMs ?? 30_000)).toISOString();
  const reserved = reserveFeatureTopicAssociation(chatId, featureId, title, {
    leaseToken,
    leaseExpiresAt,
  });

  if (!reserved) throw new TelegramTopicError('Unable to reserve feature topic association', 'reserve');
  if (reserved.state === 'active' && reserved.threadId !== null) return reserved.threadId;
  if (reserved.leaseToken !== leaseToken) {
    const completed = await waitForActiveAssociation(chatId, featureId);
    if (completed?.state === 'active' && completed.threadId !== null) return completed.threadId;
    return createOrResolveFeatureTopic(options);
  }

  try {
    const chatResponse = await api('getChat', { chat_id: chatId });
    if (!chatResponse.ok) throw apiError(chatResponse, 'getChat');
    const chat = chatResponse.result as { type?: unknown; is_forum?: unknown } | undefined;
    if (chat?.type !== 'supergroup' || chat.is_forum !== true) {
      throw new TelegramTopicError(
        'Telegram destination must be a forum-enabled supergroup and the bot must manage topics',
        'validate-chat',
      );
    }

    const topicResponse = await api('createForumTopic', { chat_id: chatId, name: title });
    if (!topicResponse.ok) throw apiError(topicResponse, 'createForumTopic');
    const threadId = (topicResponse.result as { message_thread_id?: unknown } | undefined)?.message_thread_id;
    if (typeof threadId !== 'number' || !Number.isInteger(threadId) || threadId <= 0) {
      throw new TelegramTopicError('Telegram createForumTopic returned no valid message_thread_id', 'createForumTopic');
    }
    activateFeatureTopicAssociation(chatId, featureId, threadId);
    return threadId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordFeatureTopicAssociationError(chatId, featureId, message);
    throw error;
  }
}

export interface ResolveFeatureTopicOptions {
  chatId: string;
  featureId: string;
  featureName?: string;
  api: TelegramApiRequest;
  leaseMs?: number;
}

export async function resolveFeatureTopic(options: ResolveFeatureTopicOptions): Promise<number> {
  const key = lockKey(options.chatId, options.featureId);
  const currentLock = locks.get(key);
  if (currentLock) return currentLock;

  const pending = createOrResolveFeatureTopic(options);
  locks.set(key, pending);
  try {
    return await pending;
  } finally {
    if (locks.get(key) === pending) locks.delete(key);
  }
}

export function invalidateFeatureTopic(
  chatId: string,
  featureId: string,
  error: string,
): void {
  invalidateFeatureTopicAssociation(chatId, featureId, error);
}

export function isTelegramThreadUnavailable(error: unknown): boolean {
  if (error instanceof TelegramTopicError && error.threadUnavailable) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /message_thread_id|message thread|topic.*(?:not found|deleted|unavailable)|thread.*(?:not found|deleted|unavailable)/i.test(message);
}
