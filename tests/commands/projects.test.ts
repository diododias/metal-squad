import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Projects and Epics commands', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(async () => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-project-commands-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
    const dbModule = await import('../../src/db/index.js');
    resetDb = dbModule.resetDb;
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(dbModule.getDb('readwrite'));
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  function program(): Command {
    const command = new Command();
    return command;
  }

  it('emits the same project result from CLI JSON and the direct service', async () => {
    const { registerProjects } = await import('../../src/commands/projects.js');
    const { projectService } = await import('../../src/core/projectService.js');
    const command = program();
    registerProjects(command);

    await command.parseAsync(['node', 'msq', 'projects', 'create', 'CLI Project', '--description', 'from cli', '--format', 'json']);

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { entity: { projectId: string }; revision: number };
    expect(payload).toEqual(projectService.get(payload.entity.projectId) && {
      entity: projectService.get(payload.entity.projectId),
      revision: 1,
    });
  });

  it('lists an Epic created through the CLI with stable JSON', async () => {
    const { registerProjects } = await import('../../src/commands/projects.js');
    const { registerEpics } = await import('../../src/commands/epics.js');
    const command = program();
    registerProjects(command);
    registerEpics(command);
    const { projectService } = await import('../../src/core/projectService.js');
    const project = projectService.create({ name: 'Parent' }).entity;

    await command.parseAsync(['node', 'msq', 'epics', 'create', project.projectId, 'CLI Epic', '--format', 'json']);
    const created = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { entity: { epicId: string; repoId: null }; revision: number };
    expect(created.entity.repoId).toBeNull();
    expect(created.revision).toBe(1);

    await command.parseAsync(['node', 'msq', 'epics', 'list', '--project-id', project.projectId, '--format', 'json']);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual([created.entity]);
  });

  it('prints a stable domain error code for a stale revision in JSON mode', async () => {
    const { registerProjects } = await import('../../src/commands/projects.js');
    const { projectService } = await import('../../src/core/projectService.js');
    const project = projectService.create({ name: 'Conflict' }).entity;
    projectService.update(project.projectId, { name: 'Current' }, 1);
    const command = program();
    registerProjects(command);

    await expect(command.parseAsync([
      'node', 'msq', 'projects', 'update', project.projectId, '--name', 'Stale', '--expected-revision', '1', '--format', 'json',
    ])).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(JSON.parse(String(error.mock.calls.at(-1)?.[0]))).toMatchObject({ error: { code: 'REVISION_CONFLICT' } });
  });

  it('creates a Work Item through the CLI without exposing legacy feature_id names', async () => {
    const { registerWorkItems } = await import('../../src/commands/workItems.js');
    const { projectService, repoLinkService } = await import('../../src/core/projectService.js');
    const { epicService } = await import('../../src/core/epicService.js');
    const repoPath = join(directory, 'repo-a');
    mkdirSync(repoPath);
    const project = projectService.create({ name: 'CLI Work Items' }).entity;
    const { registerRepo } = await import('../../src/db/repo.js');
    registerRepo('repo-a', repoPath);
    const repo = repoLinkService.link(project.projectId, { repoId: 'repo-a' }).entity;
    const epic = epicService.create({ projectId: project.projectId, title: 'CLI epic' }).entity;
    const command = program();
    registerWorkItems(command);

    await command.parseAsync(['node', 'msq', 'work-items', 'create', '--epic', epic.epicId, '--repo', repo.repoId, '--title', 'CLI item', '--format', 'json']);

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { entity: Record<string, unknown>; revision: number };
    expect(payload.entity.workItemId).toMatch(/^F-/);
    expect(payload.entity).not.toHaveProperty('featureId');
    expect(payload.revision).toBe(1);
  });
});
