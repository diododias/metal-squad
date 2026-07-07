import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_NOTIFICATIONS = {
  channels: [],
  events: ['gate:created', 'run:failed', 'run:done', 'stage:approval', 'stage:input'],
};
const DEFAULT_WORKFLOW = { autoAdvanceStages: false, pollIntervalMs: 2_000 };

describe('config', () => {
  const previousHome = process.env.HOME;
  let home = '';

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    if (home) rmSync(home, { recursive: true, force: true });
    process.env.HOME = previousHome;
    delete process.env.MSQ_DB_PATH;
    home = '';
    vi.resetModules();
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
      promptContextCharLimit: 20_000,
      stageSkills: {},
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
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
      promptContextCharLimit: 10_000,
      telegramChatId: '123',
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
    });

    expect(existsSync(CONFIG_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))).toEqual({
      concurrency: 5,
      toolTimeoutMs: 1_000,
      staleRunThresholdMinutes: 30,
      promptContextCharLimit: 10_000,
      telegramChatId: '123',
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
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
      promptContextCharLimit: 15_000,
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
    });
    ensureDataDir();

    expect(loadConfig()).toEqual({
      concurrency: 2,
      toolTimeoutMs: 999,
      staleRunThresholdMinutes: 45,
      promptContextCharLimit: 15_000,
      stageSkills: {},
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
    });
    expect(existsSync(DB_PATH.replace(/\/app\.db$/, ''))).toBe(true);
  });

  it('supports overriding the db path with MSQ_DB_PATH', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;
    process.env.MSQ_DB_PATH = join(home, 'custom-db', 'runs.sqlite');

    const { DB_PATH, ensureDataDir, resolveDbPath } = await import('../../src/config/index.js');

    expect(DB_PATH).toBe(join(home, 'custom-db', 'runs.sqlite'));
    expect(resolveDbPath()).toBe(join(home, 'custom-db', 'runs.sqlite'));

    ensureDataDir();
    expect(existsSync(join(home, 'custom-db'))).toBe(true);
  });
});
