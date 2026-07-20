import type { Command } from 'commander';
import { projectService, repoLinkService } from '../core/projectService.js';
import { parseRevision, printDomainOutput, rethrowDomainError } from './domainOutput.js';

interface ProjectOptions {
  description?: string;
  name?: string;
  position?: string;
  expectedRevision?: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  format?: string;
  repoId?: string;
  path?: string;
}

function optionalPosition(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const position = Number(value);
  if (!Number.isInteger(position) || position < 0) throw new Error('--position must be a non-negative integer.');
  return position;
}

export function registerProjects(program: Command): void {
  const projects = program.command('projects').description('Gerencia Projects e seus repositorios');

  projects.command('list').option('--include-archived').option('--include-deleted').option('--format <format>', 'text | json', 'text')
    .action((opts: ProjectOptions) => {
      try {
        printDomainOutput(projectService.list({ includeArchived: opts.includeArchived, includeDeleted: opts.includeDeleted }), opts.format);
      } catch (error) { rethrowDomainError(error, opts.format); }
    });

  projects.command('create <name>').option('--description <description>').option('--format <format>', 'text | json', 'text')
    .action((name: string, opts: ProjectOptions) => {
      try { printDomainOutput(projectService.create({ name, description: opts.description }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });

  projects.command('update <projectId>').option('--name <name>').option('--description <description>').option('--position <position>').option('--expected-revision <revision>').option('--format <format>', 'text | json', 'text')
    .action((projectId: string, opts: ProjectOptions) => {
      try {
        printDomainOutput(projectService.update(projectId, { name: opts.name, description: opts.description, position: optionalPosition(opts.position) }, parseRevision(opts.expectedRevision)), opts.format);
      } catch (error) { rethrowDomainError(error, opts.format); }
    });

  const repos = projects.command('repos').description('Gerencia vinculos entre Project e repositorio');
  repos.command('link <projectId>').option('--repo-id <repoId>').option('--path <path>').option('--format <format>', 'text | json', 'text')
    .action((projectId: string, opts: ProjectOptions) => {
      try { printDomainOutput(repoLinkService.link(projectId, { repoId: opts.repoId, path: opts.path }), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
  repos.command('move <repoId> <toProjectId>').option('--format <format>', 'text | json', 'text')
    .action((repoId: string, toProjectId: string, opts: ProjectOptions) => {
      try { printDomainOutput(repoLinkService.move(repoId, toProjectId), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
  repos.command('unlink <repoId>').option('--format <format>', 'text | json', 'text')
    .action((repoId: string, opts: ProjectOptions) => {
      try { printDomainOutput(repoLinkService.unlink(repoId), opts.format); } catch (error) { rethrowDomainError(error, opts.format); }
    });
}
