import { describe, expect, it, vi } from 'vitest';

const mockExecSync = vi.fn();

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
});
