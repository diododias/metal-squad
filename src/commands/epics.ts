import type { Command } from 'commander';
import { epicService } from '../core/epicService.js';
import type { EpicStatus } from '../core/backlog/schema.js';
import { parseRevision, printDomainOutput, rethrowDomainError } from './domainOutput.js';

interface EpicOptions {
  projectId?: string;
  description?: string;
  title?: string;
  status?: EpicStatus;
  position?: string;
  expectedRevision?: string;
  format?: string;
}

function optionalPosition(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const position = Number(value);
  if (!Number.isInteger(position) || position < 0) throw new Error('--position must be a non-negative integer.');
  return position;
}

export function registerEpics(program: Command): void {
  const epics = program.command('epics').description('Gerencia Epics de Projects');
  epics.command('list').option('--project-id <projectId>').option('--format <format>', 'text | json', 'text')
    .action((opts: EpicOptions) => {
      try { printDomainOutput(epicService.list(opts.projectId), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
  epics.command('create <projectId> <title>').option('--description <description>').option('--format <format>', 'text | json', 'text')
    .action((projectId: string, title: string, opts: EpicOptions) => {
      try { printDomainOutput(epicService.create({ projectId, title, description: opts.description }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
  epics.command('update <epicId>').option('--title <title>').option('--description <description>').option('--status <status>').option('--position <position>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((epicId: string, opts: EpicOptions) => {
      try {
        printDomainOutput(epicService.update(epicId, { title: opts.title, description: opts.description, status: opts.status, position: optionalPosition(opts.position) }, parseRevision(opts.expectedRevision)), opts.format);
      } catch (error) { rethrowDomainError(error, opts.format); }
    });
  epics.command('archive <epicId>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((epicId: string, opts: EpicOptions) => {
      try { printDomainOutput(epicService.archive(epicId, parseRevision(opts.expectedRevision), { audit: { actor: 'cli' } }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
  epics.command('delete <epicId>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((epicId: string, opts: EpicOptions) => {
      try { printDomainOutput(epicService.delete(epicId, parseRevision(opts.expectedRevision), { audit: { actor: 'cli' } }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
  epics.command('restore <epicId>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((epicId: string, opts: EpicOptions) => {
      try { printDomainOutput(epicService.restoreArchive(epicId, parseRevision(opts.expectedRevision), { audit: { actor: 'cli' } }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
}
