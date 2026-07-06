import type { Command } from 'commander';
import { cleanupStaleRuns, listRuns } from '../db/repo.js';
import { loadConfig } from '../config/index.js';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Estado dos runs e uso de tokens (todos os repos)')
    .option('-n, --limit <n>', 'quantidade de runs', '20')
    .option('--repair-stale', 'marca runs órfãos como failed antes de listar')
    .option(
      '--stale-minutes <n>',
      'limiar em minutos para considerar um run running como órfão',
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
        console.log('Nenhum run registrado.');
        return;
      }
      if (repaired > 0) {
        console.log(
          `[msq] ${repaired} run(s) órfãos marcados como failed `
            + `(${staleRunThresholdMinutes} min de tolerância).`,
        );
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          feature: r.feature_id,
          tool: r.tool,
          status: r.status,
          tokens: r.total ?? '-',
          started: r.started_at,
          summary: r.summary ? r.summary.slice(0, 120) : '-',
        })),
      );
    });
}
