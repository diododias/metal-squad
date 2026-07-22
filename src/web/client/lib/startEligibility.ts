export interface StartEligibilityInput {
  dependsOn: string[];
  repoId?: string | null;
  integrityIssue?: string | null;
  doneFeatureIds: ReadonlySet<string>;
  repositories: { repoId: string; health?: string }[];
}

export interface StartEligibility {
  canStart: boolean;
  /** Human-readable reason when the item cannot start; null when eligible. */
  reason: string | null;
  blockedByDependencies: string[];
  repoUnhealthy: boolean;
}

/**
 * Single client-side start gate shared by every surface that offers
 * `action:startFeature` (BacklogItemDetail, epic work item rows). The server
 * re-validates on start; this only mirrors those rules for actionable UI.
 */
export function startEligibility({ dependsOn, repoId, integrityIssue, doneFeatureIds, repositories }: StartEligibilityInput): StartEligibility {
  const blockedByDependencies = dependsOn.filter((dep) => !doneFeatureIds.has(dep));
  const repoUnhealthy = repositories.find((repo) => repo.repoId === repoId)?.health === 'unavailable';
  const reason = repoUnhealthy
    ? 'Repository unavailable — cannot start.'
    : blockedByDependencies.length > 0
      ? `Pending dependencies: ${blockedByDependencies.join(', ')}`
      : integrityIssue
        ? `Integrity issue: ${integrityIssue}`
        : null;
  return { canStart: reason === null, reason, blockedByDependencies, repoUnhealthy };
}
