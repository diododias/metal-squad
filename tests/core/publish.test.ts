import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFileSync = vi.fn();

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

beforeEach(() => {
  mockExecFileSync.mockReset();
});

describe('verifyPublishContract', () => {
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
    expect(verifyPublishContract('/repo')).toEqual({
      ok: true,
      status: 'done',
      summary: 'implement publish verified on feat/test (https://example.test/pr/42).',
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
    expect(verifyPublishContract('/repo')).toMatchObject({
      ok: false,
      status: 'failed',
      summary: 'implement: branch must not be develop.',
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
    expect(verifyPublishContract('/repo')).toMatchObject({
      ok: false,
      status: 'blocked',
      summary: 'implement: GitHub CLI is unavailable, so PR verification could not be completed.',
    });
  });
});
