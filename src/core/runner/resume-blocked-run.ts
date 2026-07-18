import { getPipeline, getRun, recordRunEvent, resumePipeline } from '../../db/repo.js';
import { msqEventBus } from '../events/bus.js';

/**
 * Makes a human-blocked run eligible for the runner's existing resume path.
 * The active runner observes the persisted pipeline state and retries the
 * re-queued feature on its next control-polling cycle.
 */
export function resumeBlockedRun(runId: number): void {
  if (!Number.isInteger(runId) || runId <= 0) {
    throw new Error(`Blocked run id must be a positive integer: ${String(runId)}`);
  }

  const run = getRun(runId);
  if (!run) throw new Error(`Blocked run ${String(runId)} was not found.`);
  if (run.status !== 'blocked') {
    throw new Error(`Run ${String(runId)} is not blocked and cannot be resumed.`);
  }
  if (!run.pipeline_id) {
    throw new Error(`Blocked run ${String(runId)} has no pipeline to resume.`);
  }

  const pipeline = getPipeline(run.pipeline_id);
  if (!pipeline) throw new Error(`Pipeline ${String(run.pipeline_id)} for blocked run ${String(runId)} was not found.`);
  if (pipeline.status !== 'blocked' && pipeline.status !== 'paused') {
    throw new Error(`Pipeline ${String(pipeline.id)} is already ${pipeline.status}.`);
  }

  resumePipeline(pipeline.id);
  recordRunEvent(runId, 'blocked_resumed', { source: 'telegram', pipelineId: pipeline.id });
  msqEventBus.emit('ui:info', { message: `Blocked run ${String(runId)} approved; resuming pipeline ${String(pipeline.id)}.` });
}
