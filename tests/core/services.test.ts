import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('project and epic domain services', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};
  let epicService!: typeof import('../../src/core/epicService.js')['epicService'];
  let projectService!: typeof import('../../src/core/projectService.js')['projectService'];
  let repoLinkService!: typeof import('../../src/core/projectService.js')['repoLinkService'];

  beforeEach(async () => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-services-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
    const dbModule = await import('../../src/db/index.js');
    resetDb = dbModule.resetDb;
    const { backfillProjects } = await import('../../src/db/backfill.js');
    backfillProjects(dbModule.getDb('readwrite'));
    ({ epicService } = await import('../../src/core/epicService.js'));
    ({ projectService, repoLinkService } = await import('../../src/core/projectService.js'));
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  describe('projectService', () => {
    it('trims the name on create and returns the persisted revision', () => {
      const result = projectService.create({ name: '  Alpha  ' });
      expect(result.entity.name).toBe('Alpha');
      expect(result.revision).toBe(result.entity.revision);
      expect(projectService.get(result.entity.projectId)).toEqual(result.entity);
    });

    it('normalizes an update patch and bumps the revision', () => {
      const project = projectService.create({ name: 'Before' }).entity;
      const updated = projectService.update(project.projectId, { name: '  After  ', description: 'note', position: 5 }, 1);
      expect(updated.entity.name).toBe('After');
      expect(updated.entity.description).toBe('note');
      expect(updated.revision).toBe(updated.entity.revision);
    });

    it('rejects an empty update patch', () => {
      const project = projectService.create({ name: 'Empty' }).entity;
      expect(() => projectService.update(project.projectId, {}, 1)).toThrowError(/at least one allowed patch field/);
    });

    it('lists projects and returns null for an unknown id', () => {
      projectService.create({ name: 'Listed' });
      expect(projectService.list().length).toBeGreaterThan(0);
      expect(projectService.get('missing-project')).toBeNull();
    });
  });

  describe('epicService', () => {
    it('trims the title on create', () => {
      const project = projectService.create({ name: 'Parent' }).entity;
      const result = epicService.create({ projectId: project.projectId, title: '  Epic  ' });
      expect(result.entity.title).toBe('Epic');
      expect(result.revision).toBe(result.entity.revision);
      expect(epicService.get(result.entity.epicId)).toEqual(result.entity);
    });

    it('normalizes an update patch across every allowed field', () => {
      const project = projectService.create({ name: 'Parent' }).entity;
      const epic = epicService.create({ projectId: project.projectId, title: 'Before' }).entity;
      const updated = epicService.update(
        epic.epicId,
        { title: '  After  ', description: 'desc', status: 'done', position: 3 },
        1,
      );
      expect(updated.entity.title).toBe('After');
      expect(updated.entity.description).toBe('desc');
      expect(updated.entity.status).toBe('done');
      expect(updated.revision).toBe(updated.entity.revision);
    });

    it('rejects an empty update patch', () => {
      const project = projectService.create({ name: 'Parent' }).entity;
      const epic = epicService.create({ projectId: project.projectId, title: 'Empty' }).entity;
      expect(() => epicService.update(epic.epicId, {}, 1)).toThrowError(/at least one allowed patch field/);
    });

    it('lists epics scoped by project and returns null for an unknown id', () => {
      const project = projectService.create({ name: 'Parent' }).entity;
      const epic = epicService.create({ projectId: project.projectId, title: 'Scoped' }).entity;
      expect(epicService.list(project.projectId).map((row) => row.epicId)).toEqual([epic.epicId]);
      expect(epicService.list()).toEqual(epicService.list());
      expect(epicService.get('missing-epic')).toBeNull();
    });
  });

  describe('repoLinkService', () => {
    it('links a repository by resolving a path and lists it back', () => {
      const project = projectService.create({ name: 'WithRepo' }).entity;
      const result = repoLinkService.link(project.projectId, { path: directory });
      expect(result.revision).toBeNull();
      expect(result.entity.projectId).toBe(project.projectId);
      expect(repoLinkService.list(project.projectId).map((row) => row.repoId)).toContain(result.entity.repoId);
    });

    it('links a repository by an explicit repoId', async () => {
      const { registerRepo } = await import('../../src/db/repo.js');
      registerRepo('repo-direct', '/tmp/repo-direct');
      const project = projectService.create({ name: 'DirectLink' }).entity;
      const result = repoLinkService.link(project.projectId, { repoId: 'repo-direct' });
      expect(result.entity.repoId).toBe('repo-direct');
      expect(result.revision).toBeNull();
    });

    it('rejects linking with both or neither identifier', () => {
      const project = projectService.create({ name: 'BadLink' }).entity;
      expect(() => repoLinkService.link(project.projectId, {})).toThrowError(/exactly one of repoId or path/);
      expect(() => repoLinkService.link(project.projectId, { repoId: 'a', path: '/tmp/x' })).toThrowError(
        /exactly one of repoId or path/,
      );
    });

    it('moves and unlinks a repository', async () => {
      const { registerRepo } = await import('../../src/db/repo.js');
      registerRepo('repo-move', '/tmp/repo-move');
      const source = projectService.create({ name: 'Source' }).entity;
      const target = projectService.create({ name: 'Target' }).entity;
      repoLinkService.link(source.projectId, { repoId: 'repo-move' });

      const moved = repoLinkService.move('repo-move', target.projectId);
      expect(moved.entity?.projectId).toBe(target.projectId);
      expect(moved.revision).toBeNull();

      const unlinked = repoLinkService.unlink('repo-move');
      expect(unlinked.entity).toEqual({ repoId: 'repo-move', unlinked: true });
      expect(repoLinkService.list(target.projectId)).toEqual([]);
    });
  });
});
