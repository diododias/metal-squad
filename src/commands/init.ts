import { existsSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Command } from 'commander';
import { BACKLOG_FILE } from '../core/backlog/load.js';
import { resolveRepo } from '../core/repo.js';
import { registerRepo } from '../db/repo.js';
import { assertWritableDbPath } from '../db/index.js';

const TEMPLATE = (repo: string): string => `version: 2
repo: ${repo}
defaults:
  tool: claude
  effort: medium
  skills: []
epics:
  - id: epic-1
    title: First epic
    features:
      - id: feat-1
        title: First feature
        tool: claude
        effort: medium
        specFile: docs/features/feat-1.md
        dependsOn: []
`;

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create backlog.yaml in the current repo and register it in the global DB')
    .action(async () => { // eslint-disable-line @typescript-eslint/require-await
      assertWritableDbPath();
      const cwd = process.cwd();
      if (existsSync(BACKLOG_FILE)) {
        console.log(`${BACKLOG_FILE} already exists — nothing to do.`);
      } else {
        writeFileSync(BACKLOG_FILE, TEMPLATE(basename(cwd)));
        console.log(`Created ${BACKLOG_FILE}`);
      }
      const { repoId, path } = resolveRepo(cwd);
      registerRepo(repoId, path);
      console.log(`Repo registered: ${repoId}`);
    });
}
