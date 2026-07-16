import { resolveRuntimeConfig } from '../../config/index.js';
import type { NotificableEvent } from '../../config/index.js';
import type { NotificationChannel, NotificationMetadata } from './types.js';
import { TelegramChannel } from './telegram.js';
import { SlackChannel } from './slack.js';
import { DiscordChannel } from './discord.js';
import { WebhookChannel } from './webhook.js';
import { DesktopChannel } from './desktop.js';
import { sanitizeNotificationMessage } from './sanitize.js';
import type { NotificationChannelConfig } from '../../config/index.js';
import { recordTimeoutNotificationDelivery } from '../../db/repo.js';

function buildChannels(): NotificationChannel[] {
  const { notifications } = resolveRuntimeConfig(process.cwd());
  const channels: NotificationChannelConfig[] = notifications.channels;
  return channels.reduce<NotificationChannel[]>((acc, cfg) => {
    switch (cfg.type) {
      case 'telegram': acc.push(new TelegramChannel(cfg.chatId, cfg.forumTopicId)); break;
      case 'slack':    acc.push(new SlackChannel(cfg.webhookUrl)); break;
      case 'discord':  acc.push(new DiscordChannel(cfg.webhookUrl)); break;
      case 'webhook':  acc.push(new WebhookChannel(cfg.url)); break;
      case 'desktop':  acc.push(new DesktopChannel()); break;
    }
    return acc;
  }, []);
}

export async function dispatch(
  event: NotificableEvent,
  message: string,
  metadata?: NotificationMetadata,
): Promise<void> {
  const { notifications } = resolveRuntimeConfig(process.cwd());
  if (!notifications.events.includes(event) && event !== 'timeout:approval-created') return;

  const safeMessage = sanitizeNotificationMessage(message);
  const channels = buildChannels();

  if (channels.length === 0) {
    await new DesktopChannel().send(safeMessage, metadata).catch(() => { /* ignore */ });
    return;
  }

  const results = await Promise.allSettled(channels.map(async (ch) => ch.send(safeMessage, metadata)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[notify] channel delivery failed: ${channels[index]?.name ?? 'unknown'} (${event})`, result.reason);
    }
  });
  if (metadata?.timeoutApprovalRequestId !== undefined) {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    recordTimeoutNotificationDelivery(metadata.timeoutApprovalRequestId, failure
      ? { status: 'failed', error: failure.reason instanceof Error ? failure.reason.message : String(failure.reason) }
      : { status: 'sent' });
  }
}
