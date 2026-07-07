import { loadConfig } from '../../config/index.js';
import type { NotificableEvent } from '../../config/index.js';
import type { NotificationChannel } from './types.js';
import { TelegramChannel } from './telegram.js';
import { SlackChannel } from './slack.js';
import { DiscordChannel } from './discord.js';
import { WebhookChannel } from './webhook.js';
import { DesktopChannel } from './desktop.js';
import type { NotificationChannelConfig } from '../../config/index.js';

function buildChannels(): NotificationChannel[] {
  const { notifications, telegramChatId } = loadConfig();
  const channels: NotificationChannelConfig[] = notifications.channels.length > 0
    ? notifications.channels
    : telegramChatId
      ? [{ type: 'telegram', chatId: telegramChatId }]
      : [];
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
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { notifications } = loadConfig();
  if (!notifications.events.includes(event)) return;

  const channels = buildChannels();

  if (channels.length === 0) {
    await new DesktopChannel().send(message, metadata).catch(() => {});
    return;
  }

  await Promise.allSettled(channels.map((ch) => ch.send(message, metadata)));
}
