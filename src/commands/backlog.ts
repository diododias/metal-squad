import type { Command } from 'commander';
import { loadBacklogWithRegistration, stageBacklogFile } from '../core/backlog/load.js';
import { resolveRepo } from '../core/repo.js';
import { assertWritableDbPath, DbAccessError } from '../db/index.js';
import { registerRepo } from '../db/repo.js';
import { applyBacklogSeed, planBacklogSeed, type BacklogSeedPlan } from '../db/backlogCatalog.js';

function printSeedSummary(plan: BacklogSeedPlan): void {
  const count = (status: string): number => plan.items.filter((item) => item.status === status).length;
  console.log(`Seed criado:        ${String(count('created'))}`);
  console.log(`Seed sem mudanca:   ${String(count('unchanged'))}`);
  console.log(`Seed conflitos:     ${String(count('conflict'))}`);
  console.log(`Seed invalidos:     ${String(count('invalid'))}`);
  console.log(`Seed ignorados:     ${String(count('skipped'))}`);
}

export function registerBacklog(program: Command): void {
  const backlog = program.command('backlog').description('Gerencia o catalogo de epics/features/tasks no banco');

  backlog
    .command('load')
    .description('Consome backlog.yaml e publica os itens no catalogo do banco')
    .option('--file <path>', 'caminho do arquivo de backlog', undefined)
    .option('--mode <mode>', 'modo de importacao (somente seed)', 'seed')
    .option('--format <format>', 'formato do relatorio (text ou json)', 'text')
    .option('--dry-run', 'mostra o plano sem gravar no banco')
    .action(async (opts: { file?: string; mode: string; format: string; dryRun?: boolean }) => { // eslint-disable-line @typescript-eslint/require-await
      try {
        if (opts.mode !== 'seed') throw new Error(`Unsupported backlog load mode "${opts.mode}". Use "seed".`);
        if (opts.format !== 'text' && opts.format !== 'json') throw new Error(`Unsupported backlog load format "${opts.format}". Use "text" or "json".`);
        const cwd = process.cwd();
        const loaded = loadBacklogWithRegistration(opts.file, cwd);
        const parsed = loaded.backlog;
        const { repoId, path } = resolveRepo(cwd);
        const plan = planBacklogSeed(parsed, repoId);

        if (opts.dryRun) {
          if (opts.format === 'json') console.log(JSON.stringify(plan, null, 2));
          else {
            console.log(`[dry-run] Plano seed para ${path} (repo ${repoId}):`);
            printSeedSummary(plan);
          }
          return;
        }

        assertWritableDbPath();
        registerRepo(repoId, path);
        const staged = stageBacklogFile(opts.file, cwd, parsed);
        try {
          applyBacklogSeed(parsed, plan);
          staged.commit();
          if (opts.format === 'json') console.log(JSON.stringify(plan, null, 2));
          else printSeedSummary(plan);
        } catch (error) {
          staged.rollback();
          throw error;
        }
      } catch (error) {
        if (error instanceof DbAccessError) {
          throw new Error(`${error.message}\nCatalogo nao foi atualizado.`);
        }
        throw error;
      }
    });
}
