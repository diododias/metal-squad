import { execFileSync } from 'node:child_process';
import { getLatestPublishedRunForFeature } from '../../db/repo.js';
import { logCaughtError } from '../events/logging.js';

export interface DependencyPublication {
  featureId: string;
  prNumber: number | null;
  prUrl: string;
  branchName: string;
  remoteBranch: string | null;
}

export interface DependencyFetchFailure {
  featureId: string;
  remote: string;
  ref: string;
}

/**
 * Fetch the remote ref that an agent will use as the base for a stacked
 * branch. A publication without `remoteBranch` still has a usable branch
 * name, which is fetched from `origin`.
 */
export function fetchDependencyBranches(
  publications: readonly DependencyPublication[],
  cwd: string,
): DependencyFetchFailure | null {
  for (const publication of publications) {
    const { remote, ref } = resolveDependencyFetchTarget(publication);
    try {
      execFileSync('git', ['fetch', remote, ref], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      logCaughtError(`git/dependencies.fetch(${remote} ${ref})`, error);
      return { featureId: publication.featureId, remote, ref };
    }
  }

  return null;
}

function resolveDependencyFetchTarget(publication: DependencyPublication): { remote: string; ref: string } {
  const remoteBranch = publication.remoteBranch;
  const separator = remoteBranch ? remoteBranch.indexOf('/') : -1;
  if (remoteBranch && separator > 0 && separator < remoteBranch.length - 1) {
    return {
      remote: remoteBranch.slice(0, separator),
      ref: remoteBranch.slice(separator + 1),
    };
  }

  return { remote: 'origin', ref: publication.branchName };
}

/**
 * For each dependency id, recover its most recent published PR/branch so a
 * dependent feature can stack its working branch/PR on top of it. Dependencies
 * without a published PR or a resolvable branch are skipped. The result is
 * sorted most-recent-first, so the first entry is the recommended base branch.
 */
export function resolveDependencyPublications(
  repoId: string,
  dependsOn: readonly string[],
): DependencyPublication[] {
  const rows = dependsOn
    .map((featureId) => getLatestPublishedRunForFeature(repoId, featureId))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return rows.flatMap((row) => {
    if (!row.prUrl || !row.branchName) return [];
    return [{
      featureId: row.featureId,
      prNumber: row.prNumber,
      prUrl: row.prUrl,
      branchName: row.branchName,
      remoteBranch: row.remoteBranch,
    }];
  });
}
