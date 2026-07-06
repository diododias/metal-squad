import { existsSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Command } from 'commander';
import { BACKLOG_FILE } from '../core/backlog/load.js';
import { resolveRepo } from '../core/repo.js';
import { registerRepo } from '../db/repo.js';

const TEMPLATE = (repo: string): string => `version: 1
repo: ${repo}
epics:
  - id: epic-1
    title: Primeiro épico
    features:
      - id: feat-1
        title: Primeira feature
        tool: claude
        effort: medium
        dependsOn: []
        tasks: []
`;

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Cria backlog.yaml no repo atual e registra o repo no DB global')
    .action(async () => {
      const cwd = process.cwd();
      if (existsSync(BACKLOG_FILE)) {
        console.log(`${BACKLOG_FILE} já existe — nada a fazer.`);
      } else {
        writeFileSync(BACKLOG_FILE, TEMPLATE(basename(cwd)));
        console.log(`Criado ${BACKLOG_FILE}`);
      }
      const { repoId, path } = resolveRepo(cwd);
      registerRepo(repoId, path);
      console.log(`Repo registrado: ${repoId}`);
    });
}
