import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

const CONFIG_DIR = join(homedir(), '.config', 'metal-squad');
const DATA_DIR = join(homedir(), '.local', 'share', 'metal-squad');
export const DB_PATH_ENV = 'MSQ_DB_PATH';

export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
export const DEFAULT_DB_PATH = join(DATA_DIR, 'app.db');
export const DB_PATH = resolveDbPath();

export const NOTIFICABLE_EVENTS = ['gate:created', 'run:failed', 'budget:alert', 'run:done'] as const;
export type NotificableEvent = (typeof NOTIFICABLE_EVENTS)[number];

const TelegramChannelConfig = z.object({ type: z.literal('telegram'), chatId: z.string(), forumTopicId: z.number().int().positive().optional() });
const SlackChannelConfig = z.object({ type: z.literal('slack'), webhookUrl: z.string() });
const DiscordChannelConfig = z.object({ type: z.literal('discord'), webhookUrl: z.string() });
const WebhookChannelConfig = z.object({ type: z.literal('webhook'), url: z.string() });
const DesktopChannelConfig = z.object({ type: z.literal('desktop') });

export const NotificationChannelConfig = z.discriminatedUnion('type', [
  TelegramChannelConfig,
  SlackChannelConfig,
  DiscordChannelConfig,
  WebhookChannelConfig,
  DesktopChannelConfig,
]);
export type NotificationChannelConfig = z.infer<typeof NotificationChannelConfig>;

const NotificationsConfig = z.object({
  channels: z.array(NotificationChannelConfig).default([]),
  events: z.array(z.enum(NOTIFICABLE_EVENTS)).default(['gate:created', 'run:failed']),
});

export const ConfigSchema = z.object({
  concurrency: z.number().int().positive().default(3),
  toolTimeoutMs: z.number().int().positive().default(600_000),
  staleRunThresholdMinutes: z.number().int().positive().default(120),
  promptContextCharLimit: z.number().int().positive().default(20_000),
  telegramChatId: z.string().optional(),
  notifications: NotificationsConfig.default({}),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return ConfigSchema.parse({});
  return ConfigSchema.parse(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')));
}

export function saveConfig(cfg: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

/** Creates config.json with defaults on first run. No-op if the file already exists. */
export function initConfig(): void {
  if (existsSync(CONFIG_PATH)) return;
  saveConfig(ConfigSchema.parse({}));
}

export function resolveDbPath(): string {
  return process.env[DB_PATH_ENV] || DEFAULT_DB_PATH;
}

export function ensureDataDir(dbPath = resolveDbPath()): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}
