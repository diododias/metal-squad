import { execFileSync } from 'node:child_process';
import { getLatestPublishedRunForFeature } from '../../db/repo.js';
import { logCaughtError } from '../events/logging.js';
import { GithubForge } from './forge/github.js';
import type { ForgeAdapter } from './forge/types.js';

export interface DependencyPublication {
  featureId: string;
  prNumber: number | null;
  prUrl: string;
  branchName: string;
  remoteBranch: string | null;
  baseBranch: string | null;
  /**
   * Set when the dependency PR was already merged and its head branch is gone,
   * so the usable base is the branch it was merged into.
   */
  mergedInto?: string;
}

export interface DependencyFetchFailure {
  featureId: string;
  remote: string;
  ref: string;
}

export interface DependencyFetchOutcome {
  failure: DependencyFetchFailure | null;
  /**
   * Publications rewritten to the ref that actually exists on the remote. A
   * dependency whose PR was merged points at its base branch instead of the
   * deleted head branch.
   */
  publications: DependencyPublication[];
}

function fetchRef(remote: string, ref: string, cwd: string): boolean {
  try {
    execFileSync('git', ['fetch', remote, ref], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (error) {
    logCaughtError(`git/dependencies.fetch(${remote} ${ref})`, error);
    return false;
  }
}

/**
 * A dependency PR that is already merged has its head branch deleted by the
 * forge, so fetching that ref fails forever. The merged work lives in the base
 * branch, which is the correct ref for a dependent feature to stack on.
 */
function resolveMergedFallback(
  publication: DependencyPublication,
  cwd: string,
  forge: ForgeAdapter,
): DependencyPublication | null {
  if (publication.prNumber === null || !forge.available()) return null;

  const view = forge.viewPullRequestByNumber(cwd, publication.prNumber);
  if (!view.ok || view.value?.state !== 'MERGED') return null;

  const base = view.value.baseRefName ?? publication.baseBranch;
  if (!base) return null;

  if (!fetchRef('origin', base, cwd)) return null;

  return {
    ...publication,
    branchName: base,
    remoteBranch: `origin/${base}`,
    mergedInto: base,
  };
}

/**
 * Fetch the remote ref that an agent will use as the base for a stacked
 * branch. A publication without `remoteBranch` still has a usable branch
 * name, which is fetched from `origin`.
 */
export function fetchDependencyBranches(
  publications: readonly DependencyPublication[],
  cwd: string,
  forge: ForgeAdapter = new GithubForge(),
): DependencyFetchOutcome {
  const resolved: DependencyPublication[] = [];

  for (const publication of publications) {
    const { remote, ref } = resolveDependencyFetchTarget(publication);
    if (fetchRef(remote, ref, cwd)) {
      resolved.push(publication);
      continue;
    }

    const fallback = resolveMergedFallback(publication, cwd, forge);
    if (!fallback) {
      return {
        failure: { featureId: publication.featureId, remote, ref },
        publications: resolved,
      };
    }
    resolved.push(fallback);
  }

  return { failure: null, publications: resolved };
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
      baseBranch: row.baseBranch ?? null,
    }];
  });
}
