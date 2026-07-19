import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockExecSync = vi.fn();
const directories: string[] = [];

afterEach(() => {
  mockExecSync.mockReset();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

describe('resolveRepo', () => {
  it('uses remote origin when available', async () => {
    mockExecSync.mockReturnValue(Buffer.from('git@github.com:org/repo.git\n'));
    const { resolveRepo } = await import('../../src/core/repo.js');

    const result = resolveRepo('/tmp/project');

    expect(mockExecSync).toHaveBeenCalledWith('git config --get remote.origin.url', {
      cwd: '/tmp/project',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    expect(result.path).toBe('/tmp/project');
    expect(result.repoId).toHaveLength(12);
  });

  it('falls back to the absolute path when git lookup fails', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('missing remote');
    });
    const { resolveRepo } = await import('../../src/core/repo.js');

    const result = resolveRepo('./relative/path');

    expect(result.path).toMatch(/relative\/path$/);
    expect(result.repoId).toHaveLength(12);
  });

  it('canonicalizes a directory under an allowed root before resolving its identity', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('missing remote'); });
    const root = mkdtempSync(join(tmpdir(), 'msq-repo-root-'));
    directories.push(root);
    const repo = join(root, 'repo');
    mkdirSync(repo);
    const { sanitizeRepoPath } = await import('../../src/core/repo.js');

    expect(sanitizeRepoPath(repo, [root])).toMatchObject({ path: realpathSync(repo) });
  });

  it('rejects a symlink whose canonical target escapes the allowed root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'msq-repo-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'msq-repo-outside-'));
    directories.push(root, outside);
    const linked = join(root, 'outside-link');
    symlinkSync(outside, linked);
    const { RepoPathError, sanitizeRepoPath } = await import('../../src/core/repo.js');

    expect(() => sanitizeRepoPath(linked, [root])).toThrowError(RepoPathError);
    try {
      sanitizeRepoPath(linked, [root]);
    } catch (error) {
      expect(error).toMatchObject({ code: 'REPO_PATH_NOT_ALLOWED' });
    }
  });

  it('rejects nonexistent paths and files before a caller can register them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'msq-repo-root-'));
    directories.push(root);
    const { writeFileSync } = await import('node:fs');
    const file = join(root, 'not-a-directory');
    writeFileSync(file, 'x');
    const { sanitizeRepoPath } = await import('../../src/core/repo.js');

    expect(() => sanitizeRepoPath(join(root, 'missing'), [root])).toThrow(expect.objectContaining({ code: 'REPO_PATH_NOT_FOUND' }));
    expect(() => sanitizeRepoPath(file, [root])).toThrow(expect.objectContaining({ code: 'REPO_PATH_NOT_DIRECTORY' }));
  });
});
