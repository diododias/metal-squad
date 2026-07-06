import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export interface RepoIdentity {
  repoId: string;
  path: string;
}

/** repo_id estável: origin remoto quando existe, senão hash do path absoluto. */
export function resolveRepo(cwd = process.cwd()): RepoIdentity {
  const path = resolve(cwd);
  let seed = path;
  try {
    seed =
      execSync('git config --get remote.origin.url', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || path;
  } catch {
    // sem git/remote — usa o path
  }
  const repoId = createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return { repoId, path };
}
