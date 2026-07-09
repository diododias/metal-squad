import type { RunSummary } from '../db/repo.js';

/**
 * C1: the main dashboard groups runs into a fixed, ordered set of blocks
 * instead of one flat table. TODO has no corresponding RunSummary status —
 * it is populated from features that have never been run (pendingFeatures),
 * so getRunGroup only ever returns 'execution' | 'done' | 'canceled'.
 */
export type DashboardGroupId = 'execution' | 'todo' | 'done' | 'canceled';

export const DASHBOARD_GROUP_ORDER: DashboardGroupId[] = ['todo', 'execution', 'done', 'canceled'];

// F31 section 3: the 'canceled' group (failed + aborted, unchanged) is
// relabeled FALHA / CANCELED — the id stays 'canceled' so run-status mapping
// below and any persisted references don't shift, only the on-screen label
// changes.
export const DASHBOARD_GROUP_LABEL: Record<DashboardGroupId, string> = {
  todo: 'TODO',
  execution: 'IN PROGRESS / BLOCKED',
  done: 'DONE',
  canceled: 'FALHA / CANCELED',
};

type RunGroup = Exclude<DashboardGroupId, 'todo'>;

/**
 * Maps a run status to its dashboard block. 'blocked' joins 'running' under
 * EXECUTION/BLOCKED because both represent work still in flight that the
 * user may need to act on. 'failed' joins 'aborted' under CANCELED: both are
 * terminal states that will not progress further without a fresh run.
 */
export function getRunGroup(status: RunSummary['status']): RunGroup {
  switch (status) {
    case 'running':
    case 'blocked':
      return 'execution';
    case 'done':
      return 'done';
    case 'failed':
    case 'aborted':
      return 'canceled';
    default:
      return 'canceled';
  }
}

/**
 * Stable-sorts runs by dashboard group order (EXECUTION/BLOCKED, DONE,
 * CANCELED — TODO has no runs) while preserving each group's existing
 * relative order (most-recent-first, per listRunsForTui). Used as the
 * canonical run order for both display and keyboard navigation, so the
 * on-screen block layout and the selection index never diverge.
 */
export function sortRunsByGroup(runs: RunSummary[]): RunSummary[] {
  return [...runs]
    .map((run, index) => ({ run, index }))
    .sort((left, right) => {
      const orderLeft = DASHBOARD_GROUP_ORDER.indexOf(getRunGroup(left.run.status));
      const orderRight = DASHBOARD_GROUP_ORDER.indexOf(getRunGroup(right.run.status));
      if (orderLeft !== orderRight) return orderLeft - orderRight;
      return left.index - right.index;
    })
    .map((entry) => entry.run);
}
