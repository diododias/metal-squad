import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('config', () => {
  const previousHome = process.env.HOME;
  let home = '';

  afterEach(async () => {
    if (home) rmSync(home, { recursive: true, force: true });
    process.env.HOME = previousHome;
    home = '';
    await import('../../src/db/index.js').then(({ resetDb }) => {
      resetDb();
    }).catch(() => {});
  });

  it('loads defaults when config file is missing', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { loadConfig } = await import('../../src/config/index.js');

    expect(loadConfig()).toEqual({
      concurrency: 3,
      toolTimeoutMs: 600_000,
      staleRunThresholdMinutes: 120,
    });
  });

  it('saves config and creates the config directory', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, saveConfig } = await import('../../src/config/index.js');

    saveConfig({
      concurrency: 5,
      toolTimeoutMs: 1_000,
      staleRunThresholdMinutes: 30,
      telegramChatId: '123',
    });

    expect(existsSync(CONFIG_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))).toEqual({
      concurrency: 5,
      toolTimeoutMs: 1_000,
      staleRunThresholdMinutes: 30,
      telegramChatId: '123',
    });
  });

  it('loads persisted config and ensures the data dir exists', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { DB_PATH, ensureDataDir, loadConfig, saveConfig } = await import('../../src/config/index.js');

    saveConfig({
      concurrency: 2,
      toolTimeoutMs: 999,
      staleRunThresholdMinutes: 45,
    });
    ensureDataDir();

    expect(loadConfig()).toEqual({
      concurrency: 2,
      toolTimeoutMs: 999,
      staleRunThresholdMinutes: 45,
    });
    expect(existsSync(DB_PATH.replace(/\/app\.db$/, ''))).toBe(true);
  });
});
