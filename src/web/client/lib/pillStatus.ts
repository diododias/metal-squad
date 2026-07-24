import type { PipelineStatus, RunStatus } from '../../../db/repo.js';
import type { PillStatus } from '../components/core/StatusPill.js';

/** Raw state needed to derive the visual status for a Work Item. */
export interface PillStatusInput {
  /** `null`/`undefined` means the Work Item has not been run yet. */
  status?: RunStatus | 'todo' | 'in_progress' | null;
  pipelineStatus?: PipelineStatus | null;
  blockedReason?: string | null;
}

/**
 * Maps persisted Work Item state to the single visual pill status.
 *
 * A paused or blocked pipeline is still live for lifecycle purposes, but it
 * must be visibly distinct from an actively running Work Item.
 */
export function pillStatus({ status, pipelineStatus }: PillStatusInput): PillStatus {
  switch (pipelineStatus) {
    case 'paused':
    case 'blocked':
      return 'blocked';
    case 'aborting':
    case 'aborted':
      return 'aborted';
    case 'running':
      return 'running';
    case 'done':
      return 'done';
    case 'failed':
      return 'failed';
    default:
      break;
  }

  switch (status) {
    case 'running':
    case 'done':
    case 'failed':
    case 'blocked':
    case 'aborted':
      return status;
    case 'in_progress':
      return 'running';
    case 'todo':
    case null:
    case undefined:
      return 'not_started';
  }
}
