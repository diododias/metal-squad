import type { Command } from 'commander';
import {
  cleanupStaleRuns,
  getPipelineSnapshot,
  listPipelineOverviews,
  listResumablePipelines,
  listRuns,
} from '../db/repo.js';
import { loadConfig } from '../config/index.js';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Run status and token usage (all repos)')
    .option('-n, --limit <n>', 'number of runs to display', '20')
    .option('--repair-stale', 'mark orphan runs as failed before listing')
    .option(
      '--stale-minutes <n>',
      'threshold in minutes to consider a running run as orphan',
    )
    .action(async (opts: { limit: string; repairStale?: boolean; staleMinutes?: string }) => { // eslint-disable-line @typescript-eslint/require-await
      const staleRunThresholdMinutes = opts.staleMinutes
        ? Number(opts.staleMinutes)
        : loadConfig().staleRunThresholdMinutes;
      const repaired = opts.repairStale
        ? cleanupStaleRuns(staleRunThresholdMinutes)
        : 0;
      const rows = listRuns(Number(opts.limit));
      if (rows.length === 0) {
        console.log('No runs recorded.');
        return;
      }
      if (repaired > 0) {
        console.log(
          `[msq] ${String(repaired)} orphan run(s) marked as failed `
            + `(${String(staleRunThresholdMinutes)} min threshold).`,
        );
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          pipeline_id: r.pipeline_id ?? '-',
          feature: r.feature_id,
          stage: r.stage ?? '-',
          tool: r.tool,
          run_status: r.status,
          tokens: r.total ?? '-',
          started: r.started_at,
          summary: r.summary ? r.summary.slice(0, 120) : '-',
        })),
      );

      const visiblePipelines = listPipelineOverviews(Number(opts.limit));
      if (visiblePipelines.length > 0) {
        console.log('Active/pending pipelines:');
        console.table(
          visiblePipelines.map((pipeline) => ({
            pipeline_id: pipeline.id,
            repo_id: pipeline.repoId,
            target: pipeline.featureId,
            pipeline_status: pipeline.status,
            stage: pipeline.currentStage ?? '-',
            active: pipeline.activeFeature ?? '-',
            pending: pipeline.pendingFeature ?? '-',
            wait: pipeline.pendingStageRequestKind
              ? `${pipeline.pendingStageRequestKind}:${String(pipeline.pendingStageRequestId ?? '-')}`
              : '-',
            prompt: pipeline.pendingStageRequestPrompt ?? '-',
            summary: pipeline.resumeSummary ?? '-',
          })),
        );
      }

      const resumable = listResumablePipelines();
      if (resumable.length === 0) return;
      console.log('Resumable pipelines:');
      console.table(
        resumable.map((pipeline) => {
          const snapshot = getPipelineSnapshot(pipeline);
          return {
            pipeline_id: pipeline.id,
            repo_id: pipeline.repoId,
            target: pipeline.featureId,
            status: pipeline.status,
            stage: pipeline.currentStage ?? '-',
            active: snapshot.active[0] ?? '-',
            pending: snapshot.pending[0] ?? snapshot.aborted[0] ?? '-',
            summary: pipeline.resumeSummary ?? '-',
          };
        }),
      );
    });
}
