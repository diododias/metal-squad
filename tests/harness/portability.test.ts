import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishVerification } from '../../src/core/git/publish.js';

const mockExecFileSync = vi.fn();

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: mockExecFileSync,
}));

const scenarioDir = join(process.cwd(), 'tests', 'fixtures', 'scenarios');

describe('portability harness contract', () => {
  let directory = '';
  let repoDirectory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    vi.resetModules();
    mockExecFileSync.mockReset();
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-portability-'));
    repoDirectory = join(directory, 'minimal-target');
    mkdirSync(join(repoDirectory, '.msq'), { recursive: true });
    copyFileSync(join(scenarioDir, 'portability.config.yaml'), join(repoDirectory, '.msq', 'config.yaml'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('keeps the minimal target portable across its five required axes', async () => {
    const { applyFixtureScenario } = await import('../../src/db/fixtures.js');
    ({ resetDb } = await import('../../src/db/index.js'));
    const { getCatalogFeature } = await import('../../src/db/backlogCatalog.js');
    const { resolveRuntimeConfig } = await import('../../src/config/index.js');
    const { createSkillRegistry } = await import('../../src/core/skills/index.js');
    const { stackDependencies } = await import('../../src/core/backlog/schema.js');
    const { stagePublishesResolved } = await import('../../src/core/workflow/stagePublishes.js');

    expect(existsSync(join(repoDirectory, '.claude', 'skills', 'dev-flow'))).toBe(false);
    expect(existsSync(join(repoDirectory, '.claude', 'skills', 'speckit-implement'))).toBe(false);

    const seeded = applyFixtureScenario('portability', {
      repoId: 'fixture/portability',
      repoPath: repoDirectory,
    });
    const build = getCatalogFeature('fixture/portability', 'portability-build');
    const buildSkill = createSkillRegistry().resolve(['review'], repoDirectory)[0];

    expect(seeded.dbPath).toBe(join(directory, 'app.db'));
    expect(resolveRuntimeConfig(repoDirectory).integration.baseBranch).toBe('main');
    expect(build?.workflow.stages).toEqual(['build']);
    expect(stagePublishesResolved('build', build!.workflow.mode, build!.workflow.stagePublishes)).toBe(true);
    expect(build?.dependencyTypes).toEqual({ 'portability-logical-source': 'logical' });
    expect(stackDependencies(build!)).toEqual([]);
    expect(buildSkill).toMatchObject({ name: 'review', source: 'builtin' });
  });

  it('accepts main for a publishing build and preserves an unavailable forge as blocked publish evidence', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/portable-build\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/portable-build\n';
      if (joined === 'git rev-parse --verify main') return 'base123\n';
      if (joined === 'git rev-list --count main..HEAD') return '1\n';
      throw new Error(`unexpected command: ${joined}`);
    });
    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    const { applyPublishGate } = await import('../../src/core/runner/execute.js');
    const forge = {
      available: () => true,
      viewPullRequest: () => ({ ok: true as const, value: {
        number: 19,
        url: 'https://forge.example/pr/19',
        state: 'OPEN',
        baseRefName: 'main',
      } }),
    };

    expect(verifyPublishContract(repoDirectory, ['main'], forge)).toMatchObject({
      ok: true,
      status: 'done',
      evidence: { baseBranch: 'main', prNumber: 19 },
    });

    const unavailable: PublishVerification = {
      ok: false,
      status: 'blocked',
      summary: 'publish: GitHub CLI is unavailable, so PR verification could not be completed.',
      evidence: { branch: 'feat/portable-build', baseBranch: 'main', commitSha: 'abc1234', remoteBranch: 'origin/feat/portable-build', prNumber: null, prUrl: null },
    };
    const gated = applyPublishGate(
      { ok: true, summary: 'build complete' },
      true,
      repoDirectory,
      [],
      () => unavailable,
    );

    expect(gated).toMatchObject({
      ok: false,
      publishVerificationStatus: 'blocked',
      publishEvidence: unavailable.evidence,
    });
    expect(gated.summary).toContain('GitHub CLI is unavailable');
  });
});
