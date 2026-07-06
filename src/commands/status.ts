import type { Command } from 'commander';
import { listRuns } from '../db/repo.js';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Estado dos runs e uso de tokens (todos os repos)')
    .option('-n, --limit <n>', 'quantidade de runs', '20')
    .action(async (opts: { limit: string }) => {
      const rows = listRuns(Number(opts.limit));
      if (rows.length === 0) {
        console.log('Nenhum run registrado.');
        return;
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
