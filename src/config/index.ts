import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Defaults, Feature } from '../core/backlog/schema.js';
import { EffortSchema, ThinkingSchema, ToolSchema } from '../core/backlog/schema.js';

export const CONFIG_DIR = join(homedir(), '.config', 'metal-squad');
export const DATA_DIR = join(homedir(), '.local', 'share', 'metal-squad');
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
  'timeout:approval-created',
] as const;
export type NotificableEvent = (typeof NOTIFICABLE_EVENTS)[number];

/**
 * Feature-linked notification metadata is consumed only by Telegram routing.
 * `forumTopicId` remains the explicit static destination for no-feature alerts;
 * chat ids and bot credentials are never included in web-facing state.
 */
export interface TelegramFeatureTopicMetadata {
  featureId: string;
  featureName?: string;
  requestId?: number;
  gateId?: number;
  stage?: string;
}

const TelegramChannelConfig = z.object({
  type: z.literal('telegram'),
  chatId: z.string().trim().min(1),
  forumTopicId: z.number().int().positive().optional(),
});
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
  lastResetDate: z.string().optional(),
});

const WebConfig = z.object({
  host: z.string().trim().min(1).default('127.0.0.1'),
  port: z.number().int().min(1).max(65_535).default(8_743),
  auth: z.enum(['token', 'none']).default('token'),
  statusSpinner: z.boolean().default(true),
});

const RuntimeConfigOverrideSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  toolTimeoutMs: z.number().int().positive().optional(),
  staleRunThresholdMinutes: z.number().int().positive().optional(),
  idleThresholdMs: z.number().int().positive().optional(),
  promptContextCharLimit: z.number().int().positive().optional(),
  theme: z.string().trim().min(1).optional(),
  telegramChatId: z.string().optional(),
  notifications: NotificationsConfig.partial().optional(),
  workflow: WorkflowConfig.partial().optional(),
  budget: BudgetConfig.partial().optional(),
  web: WebConfig.partial().optional(),
  stageSkills: z.record(z.string(), z.array(z.string())).optional(),
});

const RepoDefaultsSchema = z.object({
  tool: ToolSchema.optional(),
  model: z.string().trim().min(1).optional(),
  effort: EffortSchema.optional(),
  thinking: ThinkingSchema.optional(),
  skills: z.array(z.string()).optional(),
  stageSkills: z.record(z.string(), z.array(z.string())).optional(),
});

export const REPO_CONFIG_PATH = '.msq/config.yaml';
export const REPO_CONFIG_ABS_PATH = (cwd = process.cwd()): string => resolve(cwd, REPO_CONFIG_PATH);

export const ConfigSchema = z.object({
  concurrency: z.number().int().positive().default(3),
  toolTimeoutMs: z.number().int().positive().default(600_000),
  staleRunThresholdMinutes: z.number().int().positive().default(120),
  idleThresholdMs: z.number().int().positive().default(30_000),
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
export type RuntimeConfigOverride = z.infer<typeof RuntimeConfigOverrideSchema>;
export type RepoDefaults = z.infer<typeof RepoDefaultsSchema>;

export interface RepoConfigFile {
  runtime: RuntimeConfigOverride;
  defaults: RepoDefaults;
}

export interface ResolvedExecutionDefaults {
  tool: z.infer<typeof ToolSchema>;
  model?: string;
  effort: z.infer<typeof EffortSchema>;
  thinking: z.infer<typeof ThinkingSchema>;
  skills: string[];
  stageSkills: Record<string, string[]>;
}

export interface ResolvedConfigSources {
  globalConfigPath: string;
  repoConfigPath?: string;
  backlogPath?: string;
}

export interface ResolvedConfigSnapshot {
  runtime: Config;
  repoDefaults: RepoDefaults;
  sources: ResolvedConfigSources;
}

/**
 * Execution defaults have exactly two owners: a project and one of its
 * features. App and repo configuration are infrastructure-only and must not
 * be passed through this resolver.
 */
export type ExecutionDefaultsLike = Partial<ResolvedExecutionDefaults> | Defaults | Feature;

const RepoConfigFileSchema = z.object({
  runtime: RuntimeConfigOverrideSchema.default({}),
  defaults: RepoDefaultsSchema.default({}),
});

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return ConfigSchema.parse({});
  try {
    return ConfigSchema.parse(normalizeLegacyConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid metal-squad config at ${CONFIG_PATH}: ${message}`);
  }
}

export function loadRepoConfig(cwd = process.cwd()): RepoConfigFile {
  const repoConfigPath = REPO_CONFIG_ABS_PATH(cwd);
  if (!existsSync(repoConfigPath)) return { runtime: {}, defaults: {} };
  try {
    const raw = readFileSync(repoConfigPath, 'utf8');
    const parsed: unknown = parse(raw);
    const interpolated = interpolateEnvPlaceholders(parsed, repoConfigPath);
    return RepoConfigFileSchema.parse(interpolated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid repo config at ${repoConfigPath}: ${message}`);
  }
}

export function resolveRuntimeConfig(cwd = process.cwd()): Config {
  const globalConfig = loadConfig();
  const repoConfig = loadRepoConfig(cwd);
  return mergeRuntimeConfig(globalConfig, repoConfig.runtime);
}

export function resolveConfigSnapshot(cwd = process.cwd()): ResolvedConfigSnapshot {
  const repoConfigPath = REPO_CONFIG_ABS_PATH(cwd);
  const hasRepoConfig = existsSync(repoConfigPath);
  const repoConfig = loadRepoConfig(cwd);
  return {
    runtime: mergeRuntimeConfig(loadConfig(), repoConfig.runtime),
    repoDefaults: repoConfig.defaults,
    sources: {
      globalConfigPath: CONFIG_PATH,
      ...(hasRepoConfig ? { repoConfigPath } : {}),
    },
  };
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

export function mergeStageSkills(
  base: Record<string, string[]> = {},
  overlay: Record<string, string[]> = {},
): Record<string, string[]> {
  return {
    ...base,
    ...overlay,
  };
}

export function mergeExecutionDefaults(
  projectDefaults: ResolvedExecutionDefaults,
  featureOverrides: ExecutionDefaultsLike = {},
): ResolvedExecutionDefaults {
  const overlayStageSkills = 'stageSkills' in featureOverrides ? featureOverrides.stageSkills : undefined;
  return {
    tool: featureOverrides.tool ?? projectDefaults.tool,
    model: featureOverrides.model ?? projectDefaults.model,
    effort: featureOverrides.effort ?? projectDefaults.effort,
    thinking: featureOverrides.thinking ?? projectDefaults.thinking,
    skills: featureOverrides.skills ?? projectDefaults.skills,
    stageSkills: mergeStageSkills(projectDefaults.stageSkills, overlayStageSkills),
  };
}

export function mergeRuntimeConfig(base: Config, overlay: RuntimeConfigOverride = {}): Config {
  return ConfigSchema.parse({
    ...base,
    ...overlay,
    notifications: overlay.notifications
      ? {
          ...base.notifications,
          ...overlay.notifications,
          channels: overlay.notifications.channels ?? base.notifications.channels,
          events: overlay.notifications.events ?? base.notifications.events,
        }
      : base.notifications,
    workflow: overlay.workflow
      ? {
          ...base.workflow,
          ...overlay.workflow,
        }
      : base.workflow,
    budget: overlay.budget
      ? {
          ...base.budget,
          ...overlay.budget,
        }
      : base.budget,
    web: overlay.web
      ? {
          ...base.web,
          ...overlay.web,
        }
      : base.web,
    stageSkills: mergeStageSkills(base.stageSkills, overlay.stageSkills),
  });
}

function interpolateEnvPlaceholders(value: unknown, sourcePath: string, fieldPath = ''): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match: string, envName: string) => {
      const resolved = process.env[envName];
      if (resolved === undefined) {
        const location = fieldPath ? ` at ${fieldPath}` : '';
        throw new Error(`Missing environment variable ${envName} referenced by ${sourcePath}${location}`);
      }
      return resolved;
    });
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => interpolateEnvPlaceholders(entry, sourcePath, joinFieldPath(fieldPath, String(index))));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        interpolateEnvPlaceholders(entry, sourcePath, joinFieldPath(fieldPath, key)),
      ]),
    );
  }
  return value;
}

function joinFieldPath(base: string, segment: string): string {
  return base ? `${base}.${segment}` : segment;
}
