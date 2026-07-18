import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Defaults, Feature } from '../core/backlog/schema.js';
import { AdapterSchema, EffortSchema, ThinkingSchema, ToolSchema } from '../core/backlog/schema.js';
import { getCatalogMeta, updateCatalogDefaults } from '../db/backlogCatalog.js';
import { resolveRepo } from '../core/repo.js';
import { logCaughtError } from '../core/events/logging.js';

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
  'run:blocked',
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

/** Write-only channel payload used by the Settings editor. Omitted credentials
 * retain the credential of the channel at the same position. */
export type NotificationChannelPatch =
  | { type: 'telegram'; chatId?: string }
  | { type: 'slack'; webhookUrl?: string }
  | { type: 'discord'; webhookUrl?: string }
  | { type: 'webhook'; url?: string }
  | { type: 'desktop' };

const DEFAULT_NOTIFICATION_EVENTS: NotificableEvent[] = [
  'run:start',
  'gate:created',
  'run:failed',
  'run:blocked',
  'run:done',
  'stage:approval',
  'stage:input',
];

const NotificationsConfig = z.object({
  channels: z.array(NotificationChannelConfig).default([]),
  events: z.array(z.enum(NOTIFICABLE_EVENTS)).default(DEFAULT_NOTIFICATION_EVENTS),
});

const BudgetConfig = z.object({
  alertAtPercent: z.number().int().min(0).max(100).default(80),
  lastResetDate: z.string().optional(),
});

const WebConfig = z.object({
  host: z.string().trim().min(1).default('127.0.0.1'),
  port: z.number().int().min(1).max(65_535).default(8_743),
  auth: z.enum(['token', 'none']).default('token'),
  statusSpinner: z.boolean().default(true),
});

const ToolCapabilitiesConfig = z.object({
  model: z.boolean(),
  effort: z.boolean(),
  thinking: z.boolean(),
}).strict();

const ThinkingBudgetConfig = z.object({
  low: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
}).strict();

const ToolRegistryEntrySchema = z.object({
  id: z.string().trim().min(1).regex(/^[a-z][a-z0-9-]*$/, 'Tool id must use lowercase letters, numbers, and hyphens.'),
  adapter: AdapterSchema,
  command: z.string().trim().min(1),
  baseArgs: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  versionCheck: z.array(z.string()).min(1).default(['--version']),
  capabilities: ToolCapabilitiesConfig.optional(),
  thinkingBudget: ThinkingBudgetConfig.optional(),
  minTimeoutMs: z.number().int().nonnegative().optional(),
}).strict();

export const DEFAULT_TOOL_REGISTRY: z.input<typeof ToolRegistryEntrySchema>[] = [
  {
    id: 'claude',
    adapter: 'claude',
    command: 'claude',
    baseArgs: [],
    env: {},
    versionCheck: ['--version'],
    capabilities: { model: true, effort: true, thinking: true },
    thinkingBudget: { low: 4_000, medium: 10_000, high: 24_000 },
    minTimeoutMs: 0,
  },
  {
    id: 'codex',
    adapter: 'codex',
    command: 'codex',
    baseArgs: [],
    env: {},
    versionCheck: ['--version'],
    capabilities: { model: true, effort: true, thinking: false },
    thinkingBudget: { low: 0, medium: 0, high: 0 },
    minTimeoutMs: 1_800_000,
  },
  {
    id: 'opencode',
    adapter: 'opencode',
    command: 'opencode',
    baseArgs: [],
    env: {},
    versionCheck: ['--version'],
    capabilities: { model: true, effort: false, thinking: false },
    thinkingBudget: { low: 0, medium: 0, high: 0 },
    minTimeoutMs: 0,
  },
];

const ToolRegistrySchema = z.array(ToolRegistryEntrySchema)
  .min(1)
  .superRefine((tools, ctx) => {
    const ids = new Set<string>();
    for (const [index, tool] of tools.entries()) {
      if (ids.has(tool.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: `Tool id "${tool.id}" is duplicated.`,
        });
      }
      ids.add(tool.id);
    }
  });

const RuntimeConfigOverrideSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  toolTimeoutMs: z.number().int().positive().optional(),
  heartbeatMs: z.number().int().nonnegative().optional(),
  staleRunThresholdMinutes: z.number().int().positive().optional(),
  idleThresholdMs: z.number().int().positive().optional(),
  promptContextCharLimit: z.number().int().positive().optional(),
  notifications: NotificationsConfig.partial().optional(),
  budget: BudgetConfig.partial().optional(),
  web: WebConfig.partial().optional(),
});

export const REPO_CONFIG_PATH = '.msq/config.yaml';
export const REPO_CONFIG_ABS_PATH = (cwd = process.cwd()): string => resolve(cwd, REPO_CONFIG_PATH);

export const ConfigSchema = z.object({
  concurrency: z.number().int().positive().default(3),
  toolTimeoutMs: z.number().int().positive().default(600_000),
  heartbeatMs: z.number().int().positive().default(30_000),
  staleRunThresholdMinutes: z.number().int().positive().default(120),
  idleThresholdMs: z.number().int().positive().default(30_000),
  promptContextCharLimit: z.number().int().positive().default(20_000),
  notifications: NotificationsConfig.default({}),
  budget: BudgetConfig.default({}),
  web: WebConfig.default({}),
  tools: ToolRegistrySchema.default(DEFAULT_TOOL_REGISTRY),
});
export type Config = z.infer<typeof ConfigSchema>;
export interface AppConfigPatch extends Omit<Partial<Config>, 'notifications' | 'budget' | 'web'> {
  notifications?: Partial<Config['notifications']>;
  budget?: Partial<Config['budget']>;
  web?: Partial<Config['web']>;
}
export type ToolRegistryEntry = z.infer<typeof ToolRegistryEntrySchema>;
export type WebConfig = z.infer<typeof WebConfig>;
export type RuntimeConfigOverride = z.infer<typeof RuntimeConfigOverrideSchema>;

export interface NotificationsPatch {
  channels?: NotificationChannelPatch[];
  events?: NotificableEvent[];
}

export interface RepoConfigFile {
  runtime: RuntimeConfigOverride;
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
  if (!existsSync(repoConfigPath)) return { runtime: {} };
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
  migrateLegacyStageSkills(cwd);
  const globalConfig = loadConfig();
  const repoConfig = loadRepoConfig(cwd);
  return mergeRuntimeConfig(globalConfig, repoConfig.runtime);
}

export function resolveConfigSnapshot(cwd = process.cwd()): ResolvedConfigSnapshot {
  migrateLegacyStageSkills(cwd);
  const repoConfigPath = REPO_CONFIG_ABS_PATH(cwd);
  const hasRepoConfig = existsSync(repoConfigPath);
  const repoConfig = loadRepoConfig(cwd);
  return {
    runtime: mergeRuntimeConfig(loadConfig(), repoConfig.runtime),
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

export function saveNotificationsPatch(patch: NotificationsPatch): Config {
  const current = loadConfig();
  const channels = patch.channels?.map((channel, index) => {
    const existing = current.notifications.channels[index];
    switch (channel.type) {
      case 'telegram':
        return { type: channel.type, chatId: channel.chatId ?? (existing?.type === 'telegram' ? existing.chatId : undefined) };
      case 'slack':
      case 'discord':
        return {
          type: channel.type,
          webhookUrl: channel.webhookUrl ?? (existing?.type === channel.type ? existing.webhookUrl : undefined),
        };
      case 'webhook':
        return { type: channel.type, url: channel.url ?? (existing?.type === 'webhook' ? existing.url : undefined) };
      case 'desktop':
        return channel;
    }
  });
  const merged = ConfigSchema.parse({
    ...current,
    notifications: {
      ...current.notifications,
      ...patch,
      ...(channels ? { channels } : {}),
    },
  });

  saveConfig(merged);
  return merged;
}

/** Returns whether the current config file, or the nearest existing parent for it, can be written. */
export function configWritable(): boolean {
  let probePath = existsSync(CONFIG_PATH) ? CONFIG_PATH : CONFIG_DIR;

  while (!existsSync(probePath)) {
    const parentPath = dirname(probePath);
    if (parentPath === probePath) return false;
    probePath = parentPath;
  }

  try {
    accessSync(probePath, constants.W_OK);
    return true;
  } catch (error) {
    logCaughtError('config/index.isPathWritable', error);
    return false;
  }
}

/** Applies an App-owned config patch without replacing untouched config sections. */
export function saveAppConfigPatch(patch: AppConfigPatch): Config {
  const current = loadConfig();
  const merged = ConfigSchema.parse({
    ...current,
    ...patch,
    notifications: patch.notifications ? { ...current.notifications, ...patch.notifications } : current.notifications,
    budget: patch.budget ? { ...current.budget, ...patch.budget } : current.budget,
    web: patch.web ? { ...current.web, ...patch.web } : current.web,
  });

  if (!configWritable()) {
    throw new Error(`Cannot write metal-squad config at ${CONFIG_PATH}: file is not writable. Check its permissions.`);
  }

  saveConfig(merged);
  return merged;
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
    theme?: unknown;
    workflow?: unknown;
    stageSkills?: unknown;
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
  delete cfg.telegramChatId;
  delete cfg.theme;
  delete cfg.workflow;
  delete cfg.stageSkills;

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

/**
 * `stageSkills` used to be an application-wide setting. Project defaults are
 * now its owner, so copy a valid legacy value into an already-published
 * catalog. We intentionally retain the old JSON field on disk until a catalog
 * exists: this lets a first `backlog load` create the project before the next
 * config resolution performs the migration, without making startup fail.
 */
function migrateLegacyStageSkills(cwd: string): void {
  if (!existsSync(CONFIG_PATH)) return;
  try {
    const raw: unknown = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const stageSkills = z.record(z.string(), z.array(z.string())).safeParse(
      (raw as { stageSkills?: unknown }).stageSkills,
    );
    if (!stageSkills.success || Object.keys(stageSkills.data).length === 0) return;

    const { repoId } = resolveRepo(cwd);
    if (!getCatalogMeta(repoId)) return;
    updateCatalogDefaults(repoId, { stageSkills: stageSkills.data });
    writeFileSync(CONFIG_PATH, `${JSON.stringify(normalizeLegacyConfig(raw), null, 2)}\n`);
  } catch (error) {
    // Legacy config must never prevent startup. Invalid JSON is reported by
    // loadConfig with its actionable path-specific error instead.
    logCaughtError('config/index.migrateLegacyStageSkills', error);
  }
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
