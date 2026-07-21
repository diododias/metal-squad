import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { resolveDbPath } from '../config/index.js';
import { backupDb, restoreDb } from '../db/backup.js';

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} (y/N) `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

export function registerDb(program: Command): void {
  const db = program.command('db').description('Backup e restore do banco SQLite');

  db
    .command('backup')
    .description('Cria uma copia consistente (WAL-safe) do banco e valida integridade')
    .requiredOption('--output <path>', 'caminho do arquivo de backup')
    .action(async (opts: { output: string }) => {
      const destPath = resolve(process.cwd(), opts.output);
      await backupDb(destPath);
      console.log(`Backup criado em ${destPath}`);
    });

  db
    .command('restore')
    .description('Restaura o banco a partir de um backup, com verificacao de integridade')
    .requiredOption('--input <path>', 'caminho do arquivo de backup a restaurar')
    .option('--yes', 'pula a confirmacao interativa')
    .action(async (opts: { input: string; yes?: boolean }) => {
      const sourcePath = resolve(process.cwd(), opts.input);
      const destPath = resolveDbPath();
      if (!opts.yes) {
        const proceed = await confirm(
          `Isso vai substituir o banco em ${destPath} pelo conteudo de ${sourcePath}. Continuar?`,
        );
        if (!proceed) {
          console.log('Restore cancelado.');
          return;
        }
      }
      const result = await restoreDb(sourcePath, destPath);
      console.log(`Banco restaurado em ${destPath}`);
      if (result.destinationBackupPath) {
        console.log(`Backup do estado anterior salvo em ${result.destinationBackupPath}`);
      }
    });
}
