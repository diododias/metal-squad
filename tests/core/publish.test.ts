import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFileSync = vi.fn();

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

beforeEach(() => {
  mockExecFileSync.mockReset();
});

describe('verifyPublishContract', () => {
  it('accepts main as the configured allowed base branch', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify main') return 'base123\n';
      if (joined === 'git rev-list --count main..HEAD') return '2\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') {
        return JSON.stringify({ number: 42, url: 'https://example.test/pr/42', state: 'OPEN', baseRefName: 'main' });
      }
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['main'])).toMatchObject({
      ok: true,
      evidence: { baseBranch: 'main' },
    });
  });

  it('fails with an actionable error when no base branches are supplied', async () => {
    const { verifyPublishContract } = await import('../../src/core/git/publish.js');

    expect(verifyPublishContract('/repo', [])).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'publish: no allowed base branches were configured; set integration.baseBranch or dependency branches.',
    });
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('accepts a branch with commits ahead, upstream, and an open PR to develop', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '2\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') {
        return JSON.stringify({
          number: 42,
          url: 'https://example.test/pr/42',
          state: 'OPEN',
          baseRefName: 'develop',
          headRefName: 'feat/test',
        });
      }
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toEqual({
      ok: true,
      status: 'done',
      summary: 'publish verified on feat/test (https://example.test/pr/42).',
      evidence: {
        branch: 'feat/test',
        baseBranch: 'develop',
        commitSha: 'abc1234',
        remoteBranch: 'origin/feat/test',
        prNumber: 42,
        prUrl: 'https://example.test/pr/42',
      },
    });
  });

  it('fails when the current branch is develop', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'develop\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'publish: branch must not be develop.',
      evidence: {
        branch: 'develop',
        baseBranch: 'develop',
        commitSha: 'abc1234',
      },
    });
  });

  it('blocks when GitHub CLI is unavailable', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '1\n';
      if (joined === 'gh --version') throw new Error('gh missing');
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'blocked',
      summary: 'publish: GitHub CLI is unavailable, so PR verification could not be completed.',
    });
  });

  it('fails on detached HEAD', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'HEAD\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'gh --version') return '2.0.0\n';
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'publish: repository is not on a named working branch.',
    });
  });

  it('blocks when the base branch cannot be resolved for comparison', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') return '{}';
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'blocked',
      summary: 'publish: could not compare HEAD against develop.',
    });
  });

  it('blocks when the commit count is not numeric', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return 'oops\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') return '{}';
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'blocked',
      summary: 'publish: could not compare HEAD against develop.',
    });
  });

  it('fails when the branch has no commits ahead of develop', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '0\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') return '{}';
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'publish: branch has no commits ahead of develop.',
    });
  });

  it('blocks when the branch has no upstream and no per-branch remote config', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '1\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') return '{}';
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'blocked',
      summary: 'publish: branch has no upstream remote configured; push evidence is missing.',
      evidence: { remoteBranch: null },
    });
  });

  it('resolves the remote branch from per-branch config when @{u} is missing', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git config branch.feat/test.remote') return 'origin\n';
      if (joined === 'git config branch.feat/test.merge') return 'refs/heads/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '1\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') {
        return JSON.stringify({ number: 7, url: 'https://example.test/pr/7', state: 'OPEN', baseRefName: 'develop' });
      }
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: true,
      status: 'done',
      evidence: { remoteBranch: 'origin/feat/test' },
    });
  });

  it('blocks when no pull request is open for the branch', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '1\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') throw new Error('no pr');
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'blocked',
      summary: 'publish: no pull request is open for the current branch against develop.',
    });
  });

  it('blocks when the PR view output is not valid JSON', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '1\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') return 'not-json';
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'blocked',
      summary: 'publish: no pull request is open for the current branch against develop.',
    });
  });

  it('fails when the PR base branch is wrong', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '1\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') {
        return JSON.stringify({ number: 8, url: 'https://example.test/pr/8', state: 'OPEN', baseRefName: 'main' });
      }
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'publish: pull request base is main, expected develop.',
    });
  });

  it('accepts a stacked PR whose base is an allowed dependency branch', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/child\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/child\n';
      if (joined === 'git rev-parse --verify feat/dep-a') return 'depbase1\n';
      if (joined === 'git rev-list --count feat/dep-a..HEAD') return '3\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') {
        return JSON.stringify({
          number: 55,
          url: 'https://example.test/pr/55',
          state: 'OPEN',
          baseRefName: 'feat/dep-a',
          headRefName: 'feat/child',
        });
      }
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['feat/dep-a', 'develop'])).toMatchObject({
      ok: true,
      status: 'done',
      summary: 'publish verified on feat/child (https://example.test/pr/55).',
      evidence: { branch: 'feat/child', baseBranch: 'feat/dep-a', prNumber: 55 },
    });
  });

  it('fails when the PR base is outside the allowed set of bases', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/child\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/child\n';
      if (joined === 'git rev-parse --verify feat/dep-a') return 'depbase1\n';
      if (joined === 'git rev-list --count feat/dep-a..HEAD') return '3\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') {
        return JSON.stringify({ number: 56, url: 'https://example.test/pr/56', state: 'OPEN', baseRefName: 'main' });
      }
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['feat/dep-a', 'develop'])).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'publish: pull request base is main, expected feat/dep-a or develop.',
    });
  });

  it('fails when the PR is not open', async () => {
    mockExecFileSync.mockImplementation((command: string, args?: string[]) => {
      const joined = `${command} ${(args ?? []).join(' ')}`;
      if (joined === 'git rev-parse --abbrev-ref HEAD') return 'feat/test\n';
      if (joined === 'git rev-parse HEAD') return 'abc1234\n';
      if (joined === 'git rev-parse --abbrev-ref --symbolic-full-name @{u}') return 'origin/feat/test\n';
      if (joined === 'git rev-parse --verify develop') return 'base123\n';
      if (joined === 'git rev-list --count develop..HEAD') return '1\n';
      if (joined === 'gh --version') return '2.0.0\n';
      if (joined === 'gh pr view --json number,url,state,baseRefName,headRefName') {
        return JSON.stringify({ number: 9, url: 'https://example.test/pr/9', state: 'MERGED', baseRefName: 'develop' });
      }
      throw new Error(`unexpected command: ${joined}`);
    });

    const { verifyPublishContract } = await import('../../src/core/git/publish.js');
    expect(verifyPublishContract('/repo', ['develop'])).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'publish: pull request is not open (state=MERGED).',
    });
  });
});
