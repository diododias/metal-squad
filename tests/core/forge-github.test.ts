import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecFileSync = vi.fn();

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

describe('GithubForge', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns gh stderr and exit code when PR lookup fails', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw Object.assign(new Error('gh failed'), {
        stderr: 'authentication token expired\n',
        status: 4,
      });
    });

    const { GithubForge } = await import('../../src/core/git/forge/github.js');
    expect(new GithubForge().viewPullRequest('/repo')).toEqual({
      ok: false,
      stderr: 'authentication token expired',
      code: 4,
    });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['pr', 'view', '--json', 'number,url,state,baseRefName,headRefName'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  it('keeps a successful no-PR response distinct from a gh failure', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw Object.assign(new Error('gh failed'), {
        stderr: 'no pull requests found for branch "feat/test"',
        status: 1,
      });
    });

    const { GithubForge } = await import('../../src/core/git/forge/github.js');
    expect(new GithubForge().viewPullRequest('/repo')).toEqual({ ok: true, value: null });
  });
});
