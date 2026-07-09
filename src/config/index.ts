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

export const NOTIFICABLE_EVENTS = [
  'run:start',
  'gate:created',
  'run:failed',
  'budget:alert',
  'run:done',
  'stage:approval',
  'stage:input',
] as const;
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

const DEFAULT_NOTIFICATION_EVENTS: NotificableEvent[] = [
  'run:start',
  'gate:created',
  'run:failed',
  'run:done',
  'stage:approval',
  'stage:input',
];

const NotificationsConfig = z.object({
  channels: z.array(NotificationChannelConfig).default([]),
  events: z.array(z.enum(NOTIFICABLE_EVENTS)).default(DEFAULT_NOTIFICATION_EVENTS),
});

const WorkflowConfig = z.object({
  autoAdvanceStages: z.boolean().default(false),
  pollIntervalMs: z.number().int().positive().default(2_000),
});

const BudgetConfig = z.object({
  alertAtPercent: z.number().int().min(1).max(100).default(80),
});

const WebConfig = z.object({
  host: z.string().trim().min(1).default('127.0.0.1'),
  port: z.number().int().min(1).max(65_535).default(8_743),
  auth: z.enum(['token', 'none']).default('token'),
});

export const ConfigSchema = z.object({
  concurrency: z.number().int().positive().default(3),
  toolTimeoutMs: z.number().int().positive().default(600_000),
  staleRunThresholdMinutes: z.number().int().positive().default(120),
  promptContextCharLimit: z.number().int().positive().default(20_000),
  theme: z.string().trim().min(1).optional(),
  telegramChatId: z.string().optional(),
  notifications: NotificationsConfig.default({}),
  workflow: WorkflowConfig.default({}),
  budget: BudgetConfig.default({}),
  web: WebConfig.default({}),
  stageSkills: z.record(z.string(), z.array(z.string())).default({}),
});
export type Config = z.infer<typeof ConfigSchema>;
export type WebConfig = z.infer<typeof WebConfig>;

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return ConfigSchema.parse({});
  try {
    return ConfigSchema.parse(normalizeLegacyConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid metal-squad config at ${CONFIG_PATH}: ${message}`);
  }
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
  return process.env[DB_PATH_ENV] ?? DEFAULT_DB_PATH;
}

export function ensureDataDir(dbPath = resolveDbPath()): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}

function normalizeLegacyConfig(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const cfg = structuredClone(raw) as {
    telegramChatId?: string;
    notifications?: {
      channels?: { type: string; chatId?: string }[];
      events?: string[];
    };
  };

  if (cfg.telegramChatId && (!cfg.notifications?.channels || cfg.notifications.channels.length === 0)) {
    cfg.notifications = {
      ...cfg.notifications,
      channels: [{ type: 'telegram', chatId: cfg.telegramChatId }],
    };
  }

  const events = cfg.notifications?.events ?? [];
  const legacyEventDefaults = [
    ['gate:created', 'run:failed'],
    ['gate:created', 'run:failed', 'run:done', 'stage:approval', 'stage:input'],
  ];
  const isLegacyDefault = legacyEventDefaults.some((candidate) =>
    events.length === candidate.length
    && candidate.every((event) => events.includes(event)),
  );
  if (isLegacyDefault) {
    cfg.notifications = {
      ...cfg.notifications,
      events: DEFAULT_NOTIFICATION_EVENTS,
    };
  }

  return cfg;
}
