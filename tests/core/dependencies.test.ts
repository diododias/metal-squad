import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetLatestPublishedRunForFeature = vi.fn();
const mockExecFileSync = vi.fn();

vi.mock('../../src/db/repo.js', () => ({
  getLatestPublishedRunForFeature: mockGetLatestPublishedRunForFeature,
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

beforeEach(() => {
  mockGetLatestPublishedRunForFeature.mockReset();
  mockExecFileSync.mockReset();
});

function publishedRow(overrides: Record<string, unknown> = {}) {
  return {
    featureId: 'feat-a',
    prNumber: 1,
    prUrl: 'https://example.test/pr/1',
    branchName: 'feat/a',
    remoteBranch: 'origin/feat/a',
    baseBranch: 'develop',
    startedAt: '2026-07-06T10:00:00',
    ...overrides,
  };
}

describe('resolveDependencyPublications', () => {
  it('returns published dependencies most-recent-first', async () => {
    mockGetLatestPublishedRunForFeature.mockImplementation((_repo: string, featureId: string) => {
      if (featureId === 'feat-a') {
        return publishedRow({ featureId: 'feat-a', branchName: 'feat/a', prUrl: 'u/a', startedAt: '2026-07-06T09:00:00' });
      }
      if (featureId === 'feat-b') {
        return publishedRow({ featureId: 'feat-b', branchName: 'feat/b', prUrl: 'u/b', startedAt: '2026-07-06T11:00:00' });
      }
      return null;
    });
    const { resolveDependencyPublications } = await import('../../src/core/git/dependencies.js');
    const result = resolveDependencyPublications('repo1', ['feat-a', 'feat-b']);
    expect(result.map((r) => r.featureId)).toEqual(['feat-b', 'feat-a']);
    expect(result[0]!.branchName).toBe('feat/b');
  });

  it('skips dependencies without a published PR or branch', async () => {
    mockGetLatestPublishedRunForFeature.mockImplementation((_repo: string, featureId: string) => {
      if (featureId === 'feat-a') return publishedRow({ featureId: 'feat-a' });
      if (featureId === 'feat-nopr') return null;
      if (featureId === 'feat-nobranch') return publishedRow({ featureId: 'feat-nobranch', branchName: null });
      return null;
    });
    const { resolveDependencyPublications } = await import('../../src/core/git/dependencies.js');
    const result = resolveDependencyPublications('repo1', ['feat-a', 'feat-nopr', 'feat-nobranch']);
    expect(result.map((r) => r.featureId)).toEqual(['feat-a']);
  });

  it('returns an empty array when there are no dependencies', async () => {
    const { resolveDependencyPublications } = await import('../../src/core/git/dependencies.js');
    expect(resolveDependencyPublications('repo1', [])).toEqual([]);
    expect(mockGetLatestPublishedRunForFeature).not.toHaveBeenCalled();
  });
});

function publication(overrides: Record<string, unknown> = {}) {
  return {
    featureId: 'feat-a',
    prNumber: 1,
    prUrl: 'u/a',
    branchName: 'feat/a',
    remoteBranch: 'origin/feat/a',
    baseBranch: 'develop',
    ...overrides,
  };
}

function forgeStub(view: { state?: string; baseRefName?: string }, available = true) {
  return {
    available: () => available,
    viewPullRequest: vi.fn(() => ({ ok: true as const, value: null })),
    viewPullRequestByNumber: vi.fn(() => ({ ok: true as const, value: view })),
  };
}

describe('fetchDependencyBranches', () => {
  it('fetches each published dependency from its remote ref in the agent cwd', async () => {
    const { fetchDependencyBranches } = await import('../../src/core/git/dependencies.js');

    const outcome = fetchDependencyBranches([
      publication({ featureId: 'feat-a', remoteBranch: 'upstream/stack/a' }),
      publication({ featureId: 'feat-b', branchName: 'feat/b', remoteBranch: null }),
    ], '/agent/repo');

    expect(outcome.failure).toBeNull();
    expect(outcome.publications.map((p) => p.featureId)).toEqual(['feat-a', 'feat-b']);
    expect(mockExecFileSync).toHaveBeenNthCalledWith(1, 'git', ['fetch', 'upstream', 'stack/a'], expect.objectContaining({ cwd: '/agent/repo' }));
    expect(mockExecFileSync).toHaveBeenNthCalledWith(2, 'git', ['fetch', 'origin', 'feat/b'], expect.objectContaining({ cwd: '/agent/repo' }));
  });

  it('returns the unavailable dependency and stops fetching after a failure', async () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('remote not found');
    });
    const { fetchDependencyBranches } = await import('../../src/core/git/dependencies.js');

    const outcome = fetchDependencyBranches([
      publication({ featureId: 'feat-a' }),
      publication({ featureId: 'feat-b', branchName: 'feat/b', remoteBranch: 'origin/feat/b' }),
    ], '/agent/repo', forgeStub({ state: 'OPEN' }));

    expect(outcome.failure).toEqual({ featureId: 'feat-a', remote: 'origin', ref: 'feat/a' });
    expect(outcome.publications).toEqual([]);
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });

  it('falls back to the base branch when the dependency PR was already merged', async () => {
    // The forge deletes the head branch on merge, so the original ref can never
    // be fetched again; the merged work lives in the base branch.
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('couldn\'t find remote ref feat/a');
    });
    const { fetchDependencyBranches } = await import('../../src/core/git/dependencies.js');

    const outcome = fetchDependencyBranches(
      [publication()],
      '/agent/repo',
      forgeStub({ state: 'MERGED', baseRefName: 'develop' }),
    );

    expect(outcome.failure).toBeNull();
    expect(outcome.publications[0]).toMatchObject({
      featureId: 'feat-a',
      branchName: 'develop',
      remoteBranch: 'origin/develop',
      mergedInto: 'develop',
    });
    expect(mockExecFileSync).toHaveBeenNthCalledWith(2, 'git', ['fetch', 'origin', 'develop'], expect.objectContaining({ cwd: '/agent/repo' }));
  });

  it('still blocks when the branch is gone and the PR is not merged', async () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('remote not found');
    });
    const { fetchDependencyBranches } = await import('../../src/core/git/dependencies.js');

    const outcome = fetchDependencyBranches(
      [publication()],
      '/agent/repo',
      forgeStub({ state: 'CLOSED', baseRefName: 'develop' }),
    );

    expect(outcome.failure).toEqual({ featureId: 'feat-a', remote: 'origin', ref: 'feat/a' });
  });

  it('blocks when the base branch fallback is itself unfetchable', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('remote not found');
    });
    const { fetchDependencyBranches } = await import('../../src/core/git/dependencies.js');

    const outcome = fetchDependencyBranches(
      [publication()],
      '/agent/repo',
      forgeStub({ state: 'MERGED', baseRefName: 'develop' }),
    );

    expect(outcome.failure).toEqual({ featureId: 'feat-a', remote: 'origin', ref: 'feat/a' });
  });

  it('does not invoke git for logical dependencies without publications', async () => {
    const { fetchDependencyBranches } = await import('../../src/core/git/dependencies.js');

    expect(fetchDependencyBranches([], '/agent/repo')).toEqual({ failure: null, publications: [] });
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});
