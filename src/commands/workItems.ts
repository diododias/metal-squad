import type { Command } from 'commander';
import { workItemService } from '../core/workItemService.js';
import { printDomainOutput, rethrowDomainError } from './domainOutput.js';

interface WorkItemOptions {
  epic?: string;
  repo?: string;
  title?: string;
  description?: string;
  dependsOn?: string[];
  format?: string;
}

export function registerWorkItems(program: Command): void {
  const workItems = program.command('work-items').description('Gerencia Work Items de um Repository alvo');
  workItems.command('create')
    .option('--epic <epicId>')
    .option('--repo <repoId>')
    .option('--title <title>')
    .option('--description <description>')
    .option('--depends-on <workItemId>', 'Work Item dependency; may be repeated', collectDependsOn, [])
    .option('--format <format>', 'text | json', 'text')
    .action((opts: WorkItemOptions) => {
      try {
        if (!opts.epic || !opts.repo || !opts.title) {
          throw new Error('--epic, --repo, and --title are required.');
        }
        printDomainOutput(workItemService.create({
          epicId: opts.epic,
          repoId: opts.repo,
          title: opts.title,
          description: opts.description,
          dependsOn: opts.dependsOn,
          audit: { actor: 'cli' },
        }), opts.format);
      } catch (error) { rethrowDomainError(error, opts.format); }
    });
}

function collectDependsOn(value: string, previous: string[]): string[] {
  return [...previous, value];
}
