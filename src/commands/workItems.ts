import type { Command } from 'commander';
import { workItemService } from '../core/workItemService.js';
import { parseRevision, printDomainOutput, rethrowDomainError } from './domainOutput.js';

interface WorkItemOptions {
  epic?: string;
  repo?: string;
  title?: string;
  description?: string;
  dependsOn?: string[];
  expectedRevision?: string;
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

  workItems.command('archive <workItemId>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((workItemId: string, opts: WorkItemOptions) => {
      try { printDomainOutput(workItemService.archive(workItemId, parseRevision(opts.expectedRevision), { audit: { actor: 'cli' } }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });

  workItems.command('delete <workItemId>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((workItemId: string, opts: WorkItemOptions) => {
      try { printDomainOutput(workItemService.delete(workItemId, parseRevision(opts.expectedRevision), { audit: { actor: 'cli' } }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });

  workItems.command('restore <workItemId>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((workItemId: string, opts: WorkItemOptions) => {
      try { printDomainOutput(workItemService.restoreArchive(workItemId, parseRevision(opts.expectedRevision), { audit: { actor: 'cli' } }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
}

function collectDependsOn(value: string, previous: string[]): string[] {
  return [...previous, value];
}
