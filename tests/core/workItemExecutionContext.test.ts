import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getWorkItemExecutionTarget = vi.fn();

vi.mock('../../src/db/repo.js', () => ({ getWorkItemExecutionTarget }));

let temporaryDirectory: string | undefined;

afterEach(() => {
  vi.clearAllMocks();
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe('resolveWorkItemExecutionContext', () => {
  it('uses the persisted repo path and returns its canonical cwd', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'msq-context-'));
    getWorkItemExecutionTarget.mockReturnValue({
      workItemId: 'F-1', repoId: 'repo-b', repoPath: temporaryDirectory, projectId: 'project-1', epicId: 'epic-1',
    });
    const { resolveWorkItemExecutionContext } = await import('../../src/core/workItemExecutionContext.js');

    expect(resolveWorkItemExecutionContext('F-1')).toEqual({
      repoId: 'repo-b', cwd: realpathSync(temporaryDirectory), projectId: 'project-1', epicId: 'epic-1', repoHealth: 'ok',
    });
  });

  it('fails before runtime work when the persisted repository path disappeared', async () => {
    getWorkItemExecutionTarget.mockReturnValue({
      workItemId: 'F-1', repoId: 'repo-b', repoPath: '/definitely/missing/msq-repo', projectId: 'project-1', epicId: 'epic-1',
    });
    const { resolveWorkItemExecutionContext } = await import('../../src/core/workItemExecutionContext.js');

    expect(() => resolveWorkItemExecutionContext('F-1')).toThrow(/Restore it or re-link the repository/);
  });
});
