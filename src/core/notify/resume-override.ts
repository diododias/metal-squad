import { spawn } from 'node:child_process';
import { findResumablePipeline, getLatestRunForPipeline, getPipeline, recordRunEvent } from '../../db/repo.js';
import { getAdapter } from '../adapters/index.js';
import { msqEventBus } from '../events/bus.js';
import type { Tool } from '../backlog/schema.js';

export interface ResumeOverridePayload {
  pipelineId: number;
  tool?: Tool;
  model?: string;
  effort?: string;
}

/**
 * Spawns a detached `msq resume <pipelineId>` process with an optional
 * tool/model/effort override. Validates that the pipeline exists, is
 * resumable, and that the chosen adapter is available before spawning.
 */
export function resumePipelineWithOverride(payload: ResumeOverridePayload): void {
  const { pipelineId, tool, model, effort } = payload;

  const pipeline = getPipeline(pipelineId) ?? findResumablePipeline(String(pipelineId));
  if (!pipeline) {
    msqEventBus.emit('ui:notice', { message: `Pipeline ${String(pipelineId)} not found — resume aborted.` });
    return;
  }

  if (!pipeline.cwd) {
    msqEventBus.emit('ui:notice', { message: `Pipeline ${String(pipelineId)} has no cwd persisted — resume aborted.` });
    return;
  }

  if (tool) {
    const adapter = getAdapter(tool);
    if (!adapter.isAvailable?.()) {
      msqEventBus.emit('ui:notice', { message: `Tool "${tool}" is unavailable — resume aborted, no run created.` });
      return;
    }
  }

  const entrypoint = process.argv[1];
  if (!entrypoint) {
    msqEventBus.emit('ui:notice', { message: `Could not resume pipeline ${String(pipelineId)}: CLI entrypoint was not resolved.` });
    return;
  }

  const args = [...process.execArgv, entrypoint, 'resume', String(pipelineId)];
  if (tool) args.push('--tool', tool);
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    cwd: pipeline.cwd,
  });

  child.once('error', (error) => {
    msqEventBus.emit('ui:notice', { message: `Could not resume pipeline ${String(pipelineId)}: ${error.message}` });
  });

  child.unref();

  const latestRun = getLatestRunForPipeline(pipelineId);
  if (latestRun) {
    recordRunEvent(latestRun.id, 'resume_override', { source: 'telegram', tool: tool ?? null });
  }

  msqEventBus.emit('ui:info', {
    message: `Resuming pipeline ${String(pipelineId)}${tool ? ` with ${tool}` : ''}${model ? `/${model}` : ''}...`,
  });
}
