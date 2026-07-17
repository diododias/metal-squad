import { getLatestPublishedRunForFeature } from '../../db/repo.js';

export interface DependencyPublication {
  featureId: string;
  prNumber: number | null;
  prUrl: string;
  branchName: string;
  remoteBranch: string | null;
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
