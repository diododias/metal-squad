import { loadConfig } from '../../config/index.js';
import type { NotificableEvent } from '../../config/index.js';
import type { NotificationChannel } from './types.js';
import { TelegramChannel } from './telegram.js';
import { SlackChannel } from './slack.js';
import { DiscordChannel } from './discord.js';
import { WebhookChannel } from './webhook.js';
import { DesktopChannel } from './desktop.js';

function buildChannels(): NotificationChannel[] {
  const { notifications } = loadConfig();
  return notifications.channels.map((cfg) => {
    switch (cfg.type) {
      case 'telegram': return new TelegramChannel(cfg.chatId, cfg.forumTopicId);
      case 'slack':    return new SlackChannel(cfg.webhookUrl);
      case 'discord':  return new DiscordChannel(cfg.webhookUrl);
      case 'webhook':  return new WebhookChannel(cfg.url);
      case 'desktop':  return new DesktopChannel();
    }
  });
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
