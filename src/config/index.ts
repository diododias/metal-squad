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

export const ConfigSchema = z.object({
  concurrency: z.number().int().positive().default(3),
  toolTimeoutMs: z.number().int().positive().default(600_000),
  staleRunThresholdMinutes: z.number().int().positive().default(120),
  telegramChatId: z.string().optional(),
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

export function resolveDbPath(): string {
  return process.env[DB_PATH_ENV] || DEFAULT_DB_PATH;
}

export function ensureDataDir(dbPath = resolveDbPath()): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}
