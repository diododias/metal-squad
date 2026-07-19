import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { getWorkItemExecutionTarget } from '../db/repo.js';
import { RepositoryUnavailableError, WorkItemNotFoundError } from '../db/errors.js';

export interface WorkItemExecutionContext {
  repoId: string;
  cwd: string;
  projectId: string;
  epicId: string;
  repoHealth: 'ok' | 'unavailable';
}

function canonicalExecutableDirectory(repoId: string, workItemId: string, path: string): string {
  let cwd: string;
  try {
    cwd = realpathSync(path);
  } catch {
    throw new RepositoryUnavailableError(repoId, `is unavailable: path "${path}" for Work Item ${workItemId} does not exist. Restore it or re-link the repository.`);
  }
  try {
    if (!statSync(cwd).isDirectory()) throw new Error('not a directory');
    accessSync(cwd, constants.R_OK | constants.X_OK);
  } catch {
    throw new RepositoryUnavailableError(repoId, `is unavailable: path "${cwd}" for Work Item ${workItemId} is not an accessible directory. Grant read/execute access or re-link the repository.`);
  }
  return cwd;
}

/** Resolves the persisted operational context. Never infer this from the web
 * daemon cwd: the Work Item's repo is the sole source of truth. */
export function resolveWorkItemExecutionContext(workItemId: string): WorkItemExecutionContext {
  const target = getWorkItemExecutionTarget(workItemId);
  if (!target) throw new WorkItemNotFoundError(workItemId);
  return {
    repoId: target.repoId,
    cwd: canonicalExecutableDirectory(target.repoId, workItemId, target.repoPath),
    projectId: target.projectId,
    epicId: target.epicId,
    repoHealth: 'ok',
  };
}
