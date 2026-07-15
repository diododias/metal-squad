import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, saveConfig, type Config } from '../config/index.js';
import { getSecret, setSecret } from '../security/secrets.js';

const TOKEN_ACCOUNT = 'msq-web-token';
const TOKEN_CONFIG_KEY = 'webToken' as const;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function getFallbackConfigPath(): string {
  return join(homedir(), '.config', 'metal-squad', 'config.json');
}

function readFallbackToken(): string | null {
  const path = getFallbackConfigPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config> & { [TOKEN_CONFIG_KEY]?: string };
    const token = raw[TOKEN_CONFIG_KEY];
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function writeFallbackToken(token: string): void {
  const path = getFallbackConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  let raw: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  raw[TOKEN_CONFIG_KEY] = token;
  writeFileSync(path, JSON.stringify(raw, null, 2));
}

/**
 * Loads the existing web token, or generates and persists a new one.
 * Preference order:
 *  1. OS keychain (account `msq-web-token`)
 *  2. `webToken` field in `~/.config/metal-squad/config.json`
 *  3. generate new -> try keychain -> fallback config JSON
 */
export async function getOrCreateWebToken(): Promise<string> {
  const fromKeychain = await getSecret(TOKEN_ACCOUNT);
  if (fromKeychain) return fromKeychain;

  const fromFallback = readFallbackToken();
  if (fromFallback) return fromFallback;

  const token = generateToken();

  try {
    await setSecret(TOKEN_ACCOUNT, token);
    return token;
  } catch {
    // Keychain unavailable in headless/container environments — fall back to config file
    writeFallbackToken(token);
    return token;
  }
}

/**
 * Generates and persists a fresh web token, invalidating the previous one.
 * Same storage preference as getOrCreateWebToken: keychain first, falling
 * back to the `webToken` field in `~/.config/metal-squad/config.json`.
 */
export async function rotateWebToken(): Promise<string> {
  const token = generateToken();
  try {
    await setSecret(TOKEN_ACCOUNT, token);
  } catch {
    writeFallbackToken(token);
    return token;
  }
  // Keep the fallback file in sync when it already holds a (now stale) token.
  if (readFallbackToken() !== null) writeFallbackToken(token);
  return token;
}

/**
 * Reads the current config (creating defaults if needed) and merges any CLI/web
 * overrides. Ensures the data directory exists.
 */
export function resolveWebConfig(overrides: { host?: string; port?: number; auth?: 'token' | 'none' } = {}): {
  host: string;
  port: number;
  auth: 'token' | 'none';
  statusSpinner: boolean;
} {
  const cfg = loadConfig();
  return {
    host: overrides.host ?? cfg.web.host,
    port: overrides.port ?? cfg.web.port,
    auth: overrides.auth ?? cfg.web.auth,
    statusSpinner: cfg.web.statusSpinner,
  };
}

/**
 * Resolves the secret used to log into `msq web`, in priority order:
 *  1. `MSQ_WEB_PASSWORD` env var — set manually by the operator, never
 *     persisted by msq. Takes precedence so the operator can rotate it
 *     just by changing their shell/session env, no `--rotate-token` needed.
 *  2. the auto-generated, persisted token (keychain/config.json fallback),
 *     kept for operators who haven't set an explicit password yet.
 */
export async function resolveWebPassword(options: { rotate?: boolean } = {}): Promise<{
  password: string;
  source: 'env' | 'generated';
}> {
  const envPassword = process.env.MSQ_WEB_PASSWORD;
  if (envPassword !== undefined && envPassword.length > 0) {
    return { password: envPassword, source: 'env' };
  }
  const password = options.rotate === true ? await rotateWebToken() : await getOrCreateWebToken();
  return { password, source: 'generated' };
}

export function persistWebConfig(overrides: { host?: string; port?: number; auth?: 'token' | 'none' }): void {
  const cfg = loadConfig();
  cfg.web = {
    host: overrides.host ?? cfg.web.host,
    port: overrides.port ?? cfg.web.port,
    auth: overrides.auth ?? cfg.web.auth,
    statusSpinner: cfg.web.statusSpinner,
  };
  saveConfig(cfg);
}
