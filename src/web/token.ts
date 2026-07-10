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
 * Reads the current config (creating defaults if needed) and merges any CLI/web
 * overrides. Ensures the data directory exists.
 */
export function resolveWebConfig(overrides: { host?: string; port?: number; auth?: 'token' | 'none' } = {}): {
  host: string;
  port: number;
  auth: 'token' | 'none';
} {
  const cfg = loadConfig();
  return {
    host: overrides.host ?? cfg.web.host,
    port: overrides.port ?? cfg.web.port,
    auth: overrides.auth ?? cfg.web.auth,
  };
}

export function persistWebConfig(overrides: { host?: string; port?: number; auth?: 'token' | 'none' }): void {
  const cfg = loadConfig();
  cfg.web = {
    host: overrides.host ?? cfg.web.host,
    port: overrides.port ?? cfg.web.port,
    auth: overrides.auth ?? cfg.web.auth,
  };
  saveConfig(cfg);
}
