import { resolve } from 'node:path';
import type { Command } from 'commander';
import { loadBacklogWithRegistration, stageBacklogFile, peekBacklogVersion } from '../core/backlog/load.js';
import { BacklogV3Schema } from '../core/backlog/schema.js';
import {
  exportBacklogV3, serializeBacklogV3, writeBacklogExportFile,
  type ExportFormat,
} from '../core/backlog/export.js';
import { resolveRepo } from '../core/repo.js';
import { assertWritableDbPath, DbAccessError } from '../db/index.js';
import { registerRepo, getRegisteredRepo } from '../db/repo.js';
import {
  applyBacklogSeed, planBacklogSeed, type BacklogSeedPlan,
  applyBacklogSeedV3, planBacklogSeedV3, type BacklogSeedPlanV3,
} from '../db/backlogCatalog.js';

function printSeedSummary(plan: BacklogSeedPlan | BacklogSeedPlanV3): void {
  const count = (status: string): number => plan.items.filter((item) => item.status === status).length;
  console.log(`Seed created:       ${String(count('created'))}`);
  console.log(`Seed sem mudanca:   ${String(count('unchanged'))}`);
  console.log(`Seed conflitos:     ${String(count('conflict'))}`);
  console.log(`Seed invalidos:     ${String(count('invalid'))}`);
  console.log(`Seed ignorados:     ${String(count('skipped'))}`);
}

function parseRepoMap(entries: string[] = []): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) throw new Error(`Invalid --repo-map entry "${entry}". Use <repoId>=<path>.`);
    const repoId = entry.slice(0, separatorIndex).trim();
    const path = entry.slice(separatorIndex + 1).trim();
    if (!repoId || !path) throw new Error(`Invalid --repo-map entry "${entry}". Use <repoId>=<path>.`);
    map[repoId] = resolve(process.cwd(), path);
  }
  return map;
}

export function registerBacklog(program: Command): void {
  const backlog = program.command('backlog').description('Gerencia o catalogo de epics/features/tasks no banco');

  backlog
    .command('load')
    .description('Consome backlog.yaml (v1/v2) ou um asset v3 e publica os itens no catalogo do banco')
    .option('--file <path>', 'caminho do arquivo de backlog', undefined)
    .option('--mode <mode>', 'modo de importacao (somente seed)', 'seed')
    .option('--format <format>', 'formato do relatorio (text ou json)', 'text')
    .option('--dry-run', 'mostra o plano sem gravar no banco')
    .option('--project <id>', 'Project alvo para asset v3 (default: mesmo id do asset)')
    .option('--repo-map <entry>', 'mapeamento repoId=path para asset v3 (repetivel)', (value: string, previous: string[]) => [...previous, value], [] as string[])
    .action(async (opts: { file?: string; mode: string; format: string; dryRun?: boolean; project?: string; repoMap: string[] }) => { // eslint-disable-line @typescript-eslint/require-await
      try {
        if (opts.mode !== 'seed') throw new Error(`Unsupported backlog load mode "${opts.mode}". Use "seed".`);
        if (opts.format !== 'text' && opts.format !== 'json') throw new Error(`Unsupported backlog load format "${opts.format}". Use "text" or "json".`);
        const cwd = process.cwd();
        const { raw, version } = peekBacklogVersion(opts.file, cwd);

        if (version === 3) {
          const asset = BacklogV3Schema.parse(raw);
          const projectId = opts.project ?? asset.project.id;
          const explicitMap = parseRepoMap(opts.repoMap);
          const repoPaths: Record<string, string> = {};
          for (const repo of asset.repositories) {
            const path = explicitMap[repo.repoId] ?? getRegisteredRepo(repo.repoId)?.path ?? '';
            if (path) repoPaths[repo.repoId] = path;
          }
          const plan = planBacklogSeedV3(asset, projectId, repoPaths);

          if (opts.dryRun) {
            if (opts.format === 'json') console.log(JSON.stringify(plan, null, 2));
            else {
              console.log(`[dry-run] Plano seed v3 para Project ${projectId}:`);
              printSeedSummary(plan);
            }
            return;
          }

          assertWritableDbPath();
          applyBacklogSeedV3(asset, plan);
          if (opts.format === 'json') console.log(JSON.stringify(plan, null, 2));
          else printSeedSummary(plan);
          return;
        }

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

  backlog
    .command('export')
    .description('Exporta o catalogo de um Project do banco para um asset v3 (YAML ou JSON)')
    .requiredOption('--project <id>', 'id do Project a exportar')
    .option('--file <path>', 'arquivo de saida (default: stdout)')
    .option('--format <format>', 'formato do asset (yaml ou json)', 'yaml')
    .option('--include-archived', 'inclui Epics/Work Items arquivados')
    .option('--include-paths', 'inclui o path local dos repositorios (nao portavel entre maquinas)')
    .action((opts: { project: string; file?: string; format: string; includeArchived?: boolean; includePaths?: boolean }) => {
      if (opts.format !== 'yaml' && opts.format !== 'json') throw new Error(`Unsupported export format "${opts.format}". Use "yaml" or "json".`);
      const format: ExportFormat = opts.format;
      const asset = exportBacklogV3(opts.project, {
        includeArchived: opts.includeArchived ?? false,
        includePaths: opts.includePaths ?? false,
      });
      const serialized = serializeBacklogV3(asset, format);
      if (!opts.file || opts.file === '-') {
        process.stdout.write(serialized);
        return;
      }
      writeBacklogExportFile(opts.file, serialized);
      console.log(`Export salvo em ${resolve(process.cwd(), opts.file)}`);
    });
}
