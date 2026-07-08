import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_NOTIFICATIONS = {
  channels: [],
  events: ['run:start', 'gate:created', 'run:failed', 'run:done', 'stage:approval', 'stage:input'],
};
const DEFAULT_WORKFLOW = { autoAdvanceStages: false, pollIntervalMs: 2_000 };
const DEFAULT_BUDGET = { alertAtPercent: 80 };

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
      theme: undefined,
      stageSkills: {},
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
      budget: DEFAULT_BUDGET,
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
      theme: 'dark',
      telegramChatId: '123',
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
      budget: DEFAULT_BUDGET,
      stageSkills: {},
    });

    expect(existsSync(CONFIG_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))).toEqual({
      concurrency: 5,
      toolTimeoutMs: 1_000,
      staleRunThresholdMinutes: 30,
      promptContextCharLimit: 10_000,
      theme: 'dark',
      telegramChatId: '123',
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
      budget: DEFAULT_BUDGET,
      stageSkills: {},
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
      theme: 'minimal',
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
      budget: DEFAULT_BUDGET,
      stageSkills: {},
    });
    ensureDataDir();

    expect(loadConfig()).toEqual({
      concurrency: 2,
      toolTimeoutMs: 999,
      staleRunThresholdMinutes: 45,
      promptContextCharLimit: 15_000,
      theme: 'minimal',
      stageSkills: {},
      notifications: DEFAULT_NOTIFICATIONS,
      workflow: DEFAULT_WORKFLOW,
      budget: DEFAULT_BUDGET,
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

  it('reports the config path when config.json is invalid', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, loadConfig } = await import('../../src/config/index.js');
    rmSync(CONFIG_PATH, { force: true });
    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, '.config', 'metal-squad'), { recursive: true });
      writeFileSync(CONFIG_PATH, '{"stageSkills":{"specify":[speckit-specify]}}');
    });

    expect(() => loadConfig()).toThrow(`Invalid metal-squad config at ${CONFIG_PATH}:`);
  });

  it('upgrades the previous default notification event set to include run:start', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, loadConfig } = await import('../../src/config/index.js');
    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, '.config', 'metal-squad'), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify({
        notifications: {
          channels: [],
          events: ['gate:created', 'run:failed', 'run:done', 'stage:approval', 'stage:input'],
        },
      }));
    });

    expect(loadConfig().notifications.events).toEqual(DEFAULT_NOTIFICATIONS.events);
  });

  it('keeps theme undefined when the preference is missing', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { loadConfig } = await import('../../src/config/index.js');

    expect(loadConfig().theme).toBeUndefined();
  });

  it('loads a valid persisted theme preference', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, loadConfig } = await import('../../src/config/index.js');
    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, '.config', 'metal-squad'), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify({ theme: 'dark' }));
    });

    expect(loadConfig().theme).toBe('dark');
  });

  it('preserves an unknown theme preference so startup can fall back safely', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, loadConfig } = await import('../../src/config/index.js');
    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, '.config', 'metal-squad'), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify({ theme: 'solarized' }));
    });

    expect(loadConfig().theme).toBe('solarized');
  });
});
