import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { delimiter, relative, resolve, sep } from 'node:path';
import { logCaughtError } from './events/logging.js';

export interface RepoIdentity {
  repoId: string;
  path: string;
}

/** Configurable path-list for repositories submitted through the web API.
 * When unset, only the web server's own repository is eligible. */
export const REPO_ALLOWLIST_ENV = 'MSQ_REPO_ALLOWLIST';

export class RepoPathError extends Error {
  public constructor(
    public readonly code: 'REPO_PATH_NOT_FOUND' | 'REPO_PATH_NOT_DIRECTORY' | 'REPO_PATH_NOT_ALLOWED',
    message: string,
  ) {
    super(message);
    this.name = 'RepoPathError';
  }
}

export function resolveRepoAllowlist(cwd = process.cwd()): string[] {
  const configured = process.env[REPO_ALLOWLIST_ENV];
  const roots = configured?.split(delimiter).map((entry) => entry.trim()).filter(Boolean) ?? [cwd];
  return roots.map((root) => {
    try {
      return realpathSync(root);
    } catch {
      throw new RepoPathError('REPO_PATH_NOT_FOUND', `Allowed repository root does not exist: ${root}`);
    }
  });
}

/** Canonicalizes an untrusted repository path and rejects anything outside the
 * configured roots before it can be registered. */
export function sanitizeRepoPath(path: string, allowedRoots = resolveRepoAllowlist()): RepoIdentity {
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(path);
  } catch {
    throw new RepoPathError('REPO_PATH_NOT_FOUND', 'Repository path does not exist.');
  }

  if (!statSync(canonicalPath).isDirectory()) {
    throw new RepoPathError('REPO_PATH_NOT_DIRECTORY', 'Repository path must be a directory.');
  }

  const allowed = allowedRoots.some((root) => {
    const canonicalRoot = realpathSync(root);
    const relation = relative(canonicalRoot, canonicalPath);
    return relation === '' || (!relation.startsWith('..') && !relation.includes(`..${sep}`));
  });
  if (!allowed) {
    throw new RepoPathError('REPO_PATH_NOT_ALLOWED', 'Repository path is outside the allowed roots.');
  }
  return resolveRepo(canonicalPath);
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
  } catch (error) {
    // sem git/remote — usa o path
    logCaughtError('core/repo.resolveRepo', error);
  }
  const repoId = createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return { repoId, path };
}
