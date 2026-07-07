import type { Command } from 'commander';
import { cleanupStaleRuns, listRuns } from '../db/repo.js';
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
    .action(async (opts: { limit: string; repairStale?: boolean; staleMinutes?: string }) => {
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
          `[msq] ${repaired} orphan run(s) marked as failed `
            + `(${staleRunThresholdMinutes} min threshold).`,
        );
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          feature: r.feature_id,
          stage: r.stage ?? '-',
          tool: r.tool,
          status: r.status,
          tokens: r.total ?? '-',
          started: r.started_at,
          summary: r.summary ? r.summary.slice(0, 120) : '-',
        })),
      );
    });
}
