import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_NOTIFICATIONS = {
  channels: [],
  events: ['run:start', 'gate:created', 'run:failed', 'run:blocked', 'run:done', 'stage:approval', 'stage:input'],
};
const DEFAULT_BUDGET = { alertAtPercent: 80 };
const DEFAULT_WEB = { host: '127.0.0.1', port: 8_743, auth: 'token', statusSpinner: true };
const DEFAULT_INTEGRATION = { baseBranch: 'develop' };
const DEFAULT_TOOLS = [
  {
    id: 'claude', adapter: 'claude', command: 'claude', baseArgs: [], env: {}, versionCheck: ['--version'],
    capabilities: { model: true, effort: true, thinking: true },
    thinkingBudget: { low: 4_000, medium: 10_000, high: 24_000 }, minTimeoutMs: 3_600_000,
  },
  {
    id: 'codex', adapter: 'codex', command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'],
    capabilities: { model: true, effort: true, thinking: false },
    thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 1_800_000,
  },
  {
    id: 'opencode', adapter: 'opencode', command: 'opencode', baseArgs: [], env: {}, versionCheck: ['--version'],
    capabilities: { model: true, effort: false, thinking: false },
    thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 0,
  },
];

describe('config', () => {
  it('accepts a zero-percent budget alert threshold', async () => {
    const { ConfigSchema } = await import('../../src/config/index.js');

    expect(ConfigSchema.parse({ budget: { alertAtPercent: 0 } }).budget.alertAtPercent).toBe(0);
  });

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

    expect(loadConfig()).toMatchObject({
      concurrency: 3,
      toolTimeoutMs: 600_000,
      heartbeatMs: 30_000,
      staleRunThresholdMinutes: 120,
      idleThresholdMs: 30_000,
      promptContextCharLimit: 20_000,
      notifications: DEFAULT_NOTIFICATIONS,
      budget: DEFAULT_BUDGET,
      web: DEFAULT_WEB,
      integration: DEFAULT_INTEGRATION,
      tools: DEFAULT_TOOLS,
    });
  });

  it('accepts multiple ids for the same adapter', async () => {
    const { ConfigSchema } = await import('../../src/config/index.js');

    const config = ConfigSchema.parse({
      tools: [
        ...DEFAULT_TOOLS,
        {
          ...DEFAULT_TOOLS[1],
          id: 'codex-canary',
          command: 'codex-canary',
        },
      ],
    });

    expect(config.tools.map((tool) => tool.id)).toContain('codex-canary');
    expect(config.tools.filter((tool) => tool.adapter === 'codex')).toHaveLength(2);
  });

  it('rejects malformed tool entries and duplicate ids with actionable paths', async () => {
    const { ConfigSchema } = await import('../../src/config/index.js');

    const malformed = ConfigSchema.safeParse({
      tools: [{ id: 'bad id', adapter: 'codex' }],
    });
    expect(malformed.success).toBe(false);
    if (!malformed.success) {
      expect(malformed.error.issues.map((issue) => issue.path.join('.'))).toContain('tools.0.command');
      expect(malformed.error.issues.map((issue) => issue.path.join('.'))).toContain('tools.0.id');
    }

    const duplicate = ConfigSchema.safeParse({
      tools: [DEFAULT_TOOLS[0], { ...DEFAULT_TOOLS[0] }],
    });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['tools', 1, 'id'], message: 'Tool id "claude" is duplicated.' }),
      ]));
    }
  });

  it('saves config and creates the config directory', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, saveConfig } = await import('../../src/config/index.js');

    saveConfig({
      concurrency: 5,
      toolTimeoutMs: 1_000,
      heartbeatMs: 30_000,
      staleRunThresholdMinutes: 30,
      idleThresholdMs: 30_000,
      promptContextCharLimit: 10_000,
      notifications: DEFAULT_NOTIFICATIONS,
      budget: DEFAULT_BUDGET,
      web: DEFAULT_WEB,
      integration: DEFAULT_INTEGRATION,
      tools: DEFAULT_TOOLS,
    });

    expect(existsSync(CONFIG_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))).toEqual({
      concurrency: 5,
      toolTimeoutMs: 1_000,
      heartbeatMs: 30_000,
      staleRunThresholdMinutes: 30,
      idleThresholdMs: 30_000,
      promptContextCharLimit: 10_000,
      notifications: DEFAULT_NOTIFICATIONS,
      budget: DEFAULT_BUDGET,
      web: DEFAULT_WEB,
      integration: DEFAULT_INTEGRATION,
      tools: DEFAULT_TOOLS,
    });
  });

  it('preserves omitted notification credentials while updating events and removes them with a channel', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { ConfigSchema, saveConfig, saveNotificationsPatch } = await import('../../src/config/index.js');
    saveConfig(ConfigSchema.parse({
      notifications: {
        channels: [{ type: 'webhook', url: 'https://example.test/secret' }],
        events: ['run:start'],
      },
    }));

    const preserved = saveNotificationsPatch({
      channels: [{ type: 'webhook' }],
      events: ['run:done'],
    });
    expect(preserved.notifications).toEqual({
      channels: [{ type: 'webhook', url: 'https://example.test/secret' }],
      events: ['run:done'],
    });

    expect(saveNotificationsPatch({ channels: [] }).notifications.channels).toEqual([]);
  });

  it('saves an App config patch without replacing untouched sections', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, ConfigSchema, saveAppConfigPatch, saveConfig } = await import('../../src/config/index.js');
    saveConfig({
      ...ConfigSchema.parse({}),
      concurrency: 2,
      web: { ...DEFAULT_WEB, port: 9_001 },
    });

    const saved = saveAppConfigPatch({
      concurrency: 5,
      web: { port: 9_002 },
    });

    expect(saved).toMatchObject({
      concurrency: 5,
      web: { ...DEFAULT_WEB, port: 9_002 },
    });
    expect(JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))).toMatchObject({
      concurrency: 5,
      web: { ...DEFAULT_WEB, port: 9_002 },
    });
  });

  it('rejects App config patches before writing when config.json is read-only', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, ConfigSchema, configWritable, saveAppConfigPatch, saveConfig } = await import('../../src/config/index.js');
    saveConfig({ ...ConfigSchema.parse({}), concurrency: 2 });
    const original = readFileSync(CONFIG_PATH, 'utf8');
    chmodSync(CONFIG_PATH, 0o444);

    expect(configWritable()).toBe(false);
    expect(() => saveAppConfigPatch({ concurrency: 5 })).toThrow(
      `Cannot write metal-squad config at ${CONFIG_PATH}: file is not writable. Check its permissions.`,
    );
    expect(readFileSync(CONFIG_PATH, 'utf8')).toBe(original);
  });

  it('rejects invalid App config patches without writing', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, ConfigSchema, saveAppConfigPatch, saveConfig } = await import('../../src/config/index.js');
    saveConfig({ ...ConfigSchema.parse({}), concurrency: 2 });
    const original = readFileSync(CONFIG_PATH, 'utf8');

    expect(() => saveAppConfigPatch({ concurrency: 0 })).toThrow();
    expect(readFileSync(CONFIG_PATH, 'utf8')).toBe(original);
  });

  it('loads persisted config and ensures the data dir exists', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { DB_PATH, ensureDataDir, loadConfig, saveConfig } = await import('../../src/config/index.js');

    saveConfig({
      concurrency: 2,
      toolTimeoutMs: 999,
      heartbeatMs: 30_000,
      staleRunThresholdMinutes: 45,
      idleThresholdMs: 30_000,
      promptContextCharLimit: 15_000,
      notifications: DEFAULT_NOTIFICATIONS,
      budget: DEFAULT_BUDGET,
      web: DEFAULT_WEB,
    });
    ensureDataDir();

    expect(loadConfig()).toMatchObject({
      concurrency: 2,
      toolTimeoutMs: 999,
      heartbeatMs: 30_000,
      staleRunThresholdMinutes: 45,
      idleThresholdMs: 30_000,
      promptContextCharLimit: 15_000,
      notifications: DEFAULT_NOTIFICATIONS,
      budget: DEFAULT_BUDGET,
      web: DEFAULT_WEB,
      tools: DEFAULT_TOOLS,
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

  it('discards retired fields and migrates a legacy Telegram chat to notifications', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    const { CONFIG_PATH, loadConfig } = await import('../../src/config/index.js');
    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, '.config', 'metal-squad'), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify({
        theme: 'dark',
        telegramChatId: '123',
        stageSkills: { implement: ['speckit-implement'] },
        workflow: { autoAdvanceStages: true },
      }));
    });

    const config = loadConfig();
    expect(config.notifications.channels).toEqual([{ type: 'telegram', chatId: '123' }]);
    expect(config).not.toHaveProperty('theme');
    expect(config).not.toHaveProperty('telegramChatId');
    expect(config).not.toHaveProperty('stageSkills');
    expect(config).not.toHaveProperty('workflow');
  });

  it('loads repo runtime overrides but ignores legacy defaults from .msq/config.yaml', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;
    process.env.SLACK_WEBHOOK_URL = 'https://example.test/hook';

    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, 'repo', '.msq'), { recursive: true });
      writeFileSync(join(home, 'repo', '.msq', 'config.yaml'), [
        'runtime:',
        '  concurrency: 5',
        '  notifications:',
        '    channels:',
        '      - type: slack',
        '        webhookUrl: ${SLACK_WEBHOOK_URL}',
        'defaults:',
        '  tool: codex',
        '  model: gpt-5.4',
        '  effort: high',
        '  stageSkills:',
        '    plan:',
        '      - speckit-plan',
      ].join('\n'));
    });

    const { loadRepoConfig, resolveRuntimeConfig } = await import('../../src/config/index.js');
    const repoConfig = loadRepoConfig(join(home, 'repo'));
    const runtime = resolveRuntimeConfig(join(home, 'repo'));

    expect(repoConfig).toEqual({ runtime: {
      concurrency: 5,
      notifications: { channels: [{ type: 'slack', webhookUrl: 'https://example.test/hook' }] },
    } });
    expect(runtime.concurrency).toBe(5);
    expect(runtime.notifications.channels).toEqual([
      { type: 'slack', webhookUrl: 'https://example.test/hook' },
    ]);
    expect(runtime.integration).toEqual(DEFAULT_INTEGRATION);
  });

  it('resolves integration.baseBranch from repo runtime config', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, 'repo', '.msq'), { recursive: true });
      writeFileSync(join(home, 'repo', '.msq', 'config.yaml'), [
        'runtime:',
        '  integration:',
        '    baseBranch: main',
      ].join('\n'));
    });

    const { loadRepoConfig, resolveRuntimeConfig } = await import('../../src/config/index.js');

    expect(loadRepoConfig(join(home, 'repo'))).toEqual({ runtime: {
      integration: { baseBranch: 'main' },
    } });
    expect(resolveRuntimeConfig(join(home, 'repo')).integration).toEqual({ baseBranch: 'main' });
  });

  it('fails clearly when repo config references a missing environment variable', async () => {
    home = mkdtempSync(join(tmpdir(), 'msq-config-'));
    process.env.HOME = home;

    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(join(home, 'repo', '.msq'), { recursive: true });
      writeFileSync(join(home, 'repo', '.msq', 'config.yaml'), [
        'runtime:',
        '  notifications:',
        '    channels:',
        '      - type: slack',
        '        webhookUrl: ${MISSING_SECRET}',
      ].join('\n'));
    });

    const { loadRepoConfig } = await import('../../src/config/index.js');

    expect(() => loadRepoConfig(join(home, 'repo'))).toThrow('.msq/config.yaml');
    expect(() => loadRepoConfig(join(home, 'repo'))).toThrow('MISSING_SECRET');
    expect(() => loadRepoConfig(join(home, 'repo'))).toThrow('runtime.notifications.channels.0.webhookUrl');
  });

  it('resolves execution defaults only from project and feature', async () => {
    const { mergeExecutionDefaults } = await import('../../src/config/index.js');

    const effective = mergeExecutionDefaults({
      tool: 'codex',
      model: 'project-model',
      effort: 'medium',
      thinking: 'off',
      skills: ['project-skill'],
      stageSkills: { plan: ['project-plan'] },
    }, {
      effort: 'high',
      skills: ['feature-skill'],
      stageSkills: { implement: ['feature-implement'] },
    });

    expect(effective).toEqual({
      tool: 'codex',
      model: 'project-model',
      effort: 'high',
      thinking: 'off',
      skills: ['feature-skill'],
      stageSkills: { plan: ['project-plan'], implement: ['feature-implement'] },
    });
  });
});
