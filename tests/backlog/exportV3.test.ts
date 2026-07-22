import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Backlog v3 export/import (PRJ-20)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    previousDbPath = process.env['MSQ_DB_PATH'];
    directory = mkdtempSync(join(tmpdir(), 'msq-export-v3-'));
    process.env['MSQ_DB_PATH'] = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env['MSQ_DB_PATH'];
    else process.env['MSQ_DB_PATH'] = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  async function setup() {
    const dbModule = await import('../../src/db/index.js');
    resetDb = dbModule.resetDb;
    const repo = await import('../../src/db/repo.js');
    const exportModule = await import('../../src/core/backlog/export.js');
    const catalog = await import('../../src/db/backlogCatalog.js');
    const { backfillProjects } = await import('../../src/db/backfill.js');
    const db = dbModule.getDb('readwrite');
    backfillProjects(db);
    return { db, ...repo, ...exportModule, ...catalog };
  }

  function makeRepoPath(repoId: string): string {
    const repoPath = join(directory, repoId);
    mkdirSync(repoPath, { recursive: true });
    return repoPath;
  }

  it('exports a Project with a single repo, an Epic and a Work Item, without leaking the local path', async () => {
    const { createProject, createEpic, createWorkItem, registerRepo, linkRepo, exportBacklogV3 } = await setup();
    const repoPath = makeRepoPath('repo-a');
    const project = createProject({ name: 'Multi Repo', description: 'desc' });
    registerRepo('repo-a', repoPath);
    linkRepo(project.projectId, 'repo-a');
    const epic = createEpic({ projectId: project.projectId, title: 'Epic One' });
    createWorkItem({ epicId: epic.epicId, repoId: 'repo-a', title: 'Work One' });

    const asset = exportBacklogV3(project.projectId);

    expect(asset.version).toBe(3);
    expect(asset.project).toMatchObject({ id: project.projectId, name: 'Multi Repo', description: 'desc' });
    expect(asset.repositories).toHaveLength(1);
    expect(asset.repositories[0]).toMatchObject({ repoId: 'repo-a' });
    expect(asset.repositories[0]).not.toHaveProperty('path');
    expect(asset.epics).toHaveLength(1);
    expect(asset.epics[0]).toMatchObject({ id: epic.epicId, title: 'Epic One' });
    expect(asset.workItems).toHaveLength(1);
    expect(asset.workItems[0]).toMatchObject({ epicId: epic.epicId, repoId: 'repo-a', title: 'Work One' });
  });

  it('includes the local path only when includePaths is set', async () => {
    const { createProject, registerRepo, linkRepo, exportBacklogV3 } = await setup();
    const repoPath = makeRepoPath('repo-b');
    const project = createProject({ name: 'With Path' });
    registerRepo('repo-b', repoPath);
    linkRepo(project.projectId, 'repo-b');

    const withoutPath = exportBacklogV3(project.projectId);
    expect(withoutPath.repositories[0]).not.toHaveProperty('path');

    const withPath = exportBacklogV3(project.projectId, { includePaths: true });
    expect(withPath.repositories[0]?.path).toBe(repoPath);
  });

  it('a multi-repo Project appears once per repo, and an Epic never duplicates across repos', async () => {
    const { createProject, createEpic, createWorkItem, registerRepo, linkRepo, exportBacklogV3 } = await setup();
    const repoAPath = makeRepoPath('repo-a');
    const repoBPath = makeRepoPath('repo-b');
    const project = createProject({ name: 'Multi Repo Epic' });
    registerRepo('repo-a', repoAPath);
    registerRepo('repo-b', repoBPath);
    linkRepo(project.projectId, 'repo-a');
    linkRepo(project.projectId, 'repo-b');
    const epic = createEpic({ projectId: project.projectId, title: 'Shared Epic' });
    createWorkItem({ epicId: epic.epicId, repoId: 'repo-a', title: 'Work A' });
    createWorkItem({ epicId: epic.epicId, repoId: 'repo-b', title: 'Work B' });

    const asset = exportBacklogV3(project.projectId);

    expect(asset.repositories.map((r) => r.repoId).sort()).toEqual(['repo-a', 'repo-b']);
    expect(asset.epics.filter((e) => e.id === epic.epicId)).toHaveLength(1);
    expect(asset.workItems.map((w) => w.repoId).sort()).toEqual(['repo-a', 'repo-b']);
  });

  it('excludes archived Epics/Work Items by default and includes them with includeArchived', async () => {
    const { createProject, createEpic, createWorkItem, registerRepo, linkRepo, archiveWorkItem, exportBacklogV3 } = await setup();
    const repoPath = makeRepoPath('repo-c');
    const project = createProject({ name: 'Archived Scope' });
    registerRepo('repo-c', repoPath);
    linkRepo(project.projectId, 'repo-c');
    const epic = createEpic({ projectId: project.projectId, title: 'Epic C' });
    const workItem = createWorkItem({ epicId: epic.epicId, repoId: 'repo-c', title: 'Work C' });
    archiveWorkItem(workItem.workItemId, workItem.revision);

    const active = exportBacklogV3(project.projectId);
    expect(active.workItems).toHaveLength(0);

    const withArchived = exportBacklogV3(project.projectId, { includeArchived: true });
    expect(withArchived.workItems).toHaveLength(1);
    expect(withArchived.workItems[0]?.archivedAt).toBeTruthy();
  });

  it('refuses to export when a Work Item field looks like a secret', async () => {
    const { createProject, createEpic, createWorkItem, registerRepo, linkRepo, exportBacklogV3, db } = await setup();
    const repoPath = makeRepoPath('repo-d');
    const project = createProject({ name: 'Secret Scope' });
    registerRepo('repo-d', repoPath);
    linkRepo(project.projectId, 'repo-d');
    const epic = createEpic({ projectId: project.projectId, title: 'Epic D' });
    const workItem = createWorkItem({ epicId: epic.epicId, repoId: 'repo-d', title: 'Work D' });
    const stored = db.prepare(`SELECT data_json FROM backlog_features WHERE feature_id = ?`).get(workItem.workItemId) as { data_json: string };
    const patched = { ...JSON.parse(stored.data_json) as Record<string, unknown>, spec: 'webhook_url: https://hooks.example.com/T000/B000/xyz' };
    db.prepare(`UPDATE backlog_features SET data_json = ? WHERE feature_id = ?`).run(JSON.stringify(patched), workItem.workItemId);

    expect(() => exportBacklogV3(project.projectId)).toThrow(/secret/i);
  });

  it('round-trips a multi-repo Project through v3 seed into a different Project without silently overwriting existing state', async () => {
    const { createProject, createEpic, createWorkItem, registerRepo, linkRepo, exportBacklogV3 } = await setup();
    const repoAPath = makeRepoPath('repo-src-a');
    const repoBPath = makeRepoPath('repo-src-b');
    const source = createProject({ name: 'Source Project' });
    registerRepo('repo-src-a', repoAPath);
    registerRepo('repo-src-b', repoBPath);
    linkRepo(source.projectId, 'repo-src-a');
    linkRepo(source.projectId, 'repo-src-b');
    const epic = createEpic({ projectId: source.projectId, title: 'Round Trip Epic' });
    createWorkItem({ epicId: epic.epicId, repoId: 'repo-src-a', title: 'Item A' });
    createWorkItem({ epicId: epic.epicId, repoId: 'repo-src-b', title: 'Item B' });

    const asset = exportBacklogV3(source.projectId);

    // Restore into a disaster-recovery DB (PRJ-20's primary scenario): a
    // fresh database with no Projects/repos registered yet, so the seed
    // plan must resolve local paths via --repo-map instead of an existing link.
    resetDb();
    const secondDirectory = mkdtempSync(join(tmpdir(), 'msq-export-v3-target-'));
    process.env['MSQ_DB_PATH'] = join(secondDirectory, 'app.db');
    try {
      const targetEnv = await setup();
      const targetProjectId = asset.project.id;
      const repoPaths = { 'repo-src-a': repoAPath, 'repo-src-b': repoBPath };

      const plan = targetEnv.planBacklogSeedV3(asset, targetProjectId, repoPaths);
      expect(plan.items.filter((item) => item.status === 'created').length).toBeGreaterThan(0);
      expect(plan.items.some((item) => item.status === 'invalid')).toBe(false);

      targetEnv.applyBacklogSeedV3(asset, plan);

      const importedItems = targetEnv.listWorkItemsByScope({ projectId: targetProjectId });
      expect(importedItems.map((item) => item.title).sort()).toEqual(['Item A', 'Item B']);

      // Re-running the same plan against the now-populated DB must not
      // silently overwrite anything: everything should report as unchanged.
      const secondPlan = targetEnv.planBacklogSeedV3(asset, targetProjectId, repoPaths);
      expect(secondPlan.items.every((item) => item.status !== 'created')).toBe(true);
    } finally {
      resetDb();
      rmSync(secondDirectory, { recursive: true, force: true });
    }
  });

  it('reports an invalid plan item when a referenced repo has no local path mapping', async () => {
    const { createProject, createEpic, createWorkItem, registerRepo, linkRepo, exportBacklogV3, planBacklogSeedV3 } = await setup();
    const repoPath = makeRepoPath('repo-unmapped');
    const project = createProject({ name: 'Unmapped Repo Project' });
    registerRepo('repo-unmapped', repoPath);
    linkRepo(project.projectId, 'repo-unmapped');
    const epic = createEpic({ projectId: project.projectId, title: 'Epic' });
    createWorkItem({ epicId: epic.epicId, repoId: 'repo-unmapped', title: 'Work' });

    const asset = exportBacklogV3(project.projectId);
    const plan = planBacklogSeedV3(asset, 'other-project', {});

    const repoItem = plan.items.find((item) => item.id === 'repo:repo-unmapped');
    expect(repoItem?.status).toBe('invalid');
  });
});
