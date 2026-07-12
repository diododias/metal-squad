import type { Command } from 'commander';
import { loadBacklog } from '../core/backlog/load.js';
import { resolveRepo } from '../core/repo.js';
import { assertWritableDbPath, DbAccessError } from '../db/index.js';
import { registerRepo } from '../db/repo.js';
import { diffBacklogCatalog, upsertBacklogCatalog, type BacklogCatalogDiff } from '../db/backlogCatalog.js';

function printDiff(diff: BacklogCatalogDiff): void {
  console.log(`Features novas:     ${diff.addedFeatures.join(', ') || '-'}`);
  console.log(`Features alteradas: ${diff.changedFeatures.join(', ') || '-'}`);
  console.log(`Features removidas: ${diff.archivedFeatures.join(', ') || '-'} (arquivadas, nao deletadas)`);
  console.log(`Features sem mudanca: ${String(diff.unchangedFeatures.length)}`);
}

export function registerBacklog(program: Command): void {
  const backlog = program.command('backlog').description('Gerencia o catalogo de epics/features/tasks no banco');

  backlog
    .command('load')
    .description('Valida backlog.yaml e publica o catalogo no banco (nao destrutivo)')
    .option('--file <path>', 'caminho do arquivo de backlog', undefined)
    .option('--dry-run', 'mostra o diff sem gravar no banco')
    .action(async (opts: { file?: string; dryRun?: boolean }) => { // eslint-disable-line @typescript-eslint/require-await
      try {
        const cwd = process.cwd();
        const parsed = loadBacklog(opts.file, cwd);
        const { repoId, path } = resolveRepo(cwd);

        if (opts.dryRun) {
          const diff = diffBacklogCatalog(parsed, repoId);
          console.log(`[dry-run] Diff do catalogo para ${path} (repo ${repoId}):`);
          printDiff(diff);
          return;
        }

        assertWritableDbPath();
        registerRepo(repoId, path);
        const diff = upsertBacklogCatalog(parsed, repoId);
        printDiff(diff);
        console.log(
          `Catalogo atualizado: ${String(parsed.epics.length)} epics, `
            + `${String(parsed.epics.flatMap((e) => e.features).length)} features.`,
        );
      } catch (error) {
        if (error instanceof DbAccessError) {
          throw new Error(`${error.message}\nCatalogo nao foi atualizado.`);
        }
        throw error;
      }
    });
}
