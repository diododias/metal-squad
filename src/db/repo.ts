import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { getDb, withTransaction } from './index.js';
import {
  EpicNotFoundError,
  CrossRepositoryDependencyError,
  DependencyCycleError,
  DependencyNotFoundError,
  ProjectNotFoundError,
  RepositoryNotInProjectError,
  RepositoryUnavailableError,
  RepoAlreadyLinkedError,
  RepoInUseError,
  RepoNotLinkedToProjectError,
  RevisionConflictError,
} from './errors.js';
import { listOccupiedFeatureIds } from './backlogCatalog.js';
import { allocateFeatureId } from '../core/backlog/featureId.js';
import { DefaultsSchema, FeatureSchema, type Defaults, type Feature, type WorkItem } from '../core/backlog/schema.js';
import { topoOrder } from '../core/orchestrator/graph.js';
import { sanitizeToolCallRecord, type PublishEvidence, type SessionStatusSnapshot, type TokenUsage, type ToolCallRecord } from '../core/adapters/types.js';
import { resolveDbPath } from '../config/index.js';
import { msqEventBus, logCaughtError } from '../core/events/index.js';
import type {
  ContextQueryEvent,
  ContextQueryKind,
  ContextQueryTool,
  OutputSource,
  OutputStream,
  RunOutputEvent,
  TokensUpdateEvent,
} from '../core/events/types.js';
import { resolveContextWindow } from '../core/tasks/blocks.js';
import type { Tool, Workflow } from '../core/backlog/schema.js';
import { EpicSchema, type EpicStatus } from '../core/backlog/schema.js';
import type {
  SessionContextTelemetrySnapshot,
  StageTransitionDecision,
  TransitionDecisionReason,
} from '../core/workflow/sessionPolicy.js';

export function registerRepo(repoId: string, path: string): void {
  getDb('readwrite')
    .prepare(
      `INSERT INTO repos (repo_id, path) VALUES (?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET path = excluded.path`,
    )
    .run(repoId, path);
}

export interface RegisteredRepoRow {
  repoId: string;
  path: string;
}

export function getRegisteredRepo(repoId: string): RegisteredRepoRow | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly').prepare(
    `SELECT repo_id AS repoId, path FROM repos WHERE repo_id = ?`,
  ).get(repoId) as RegisteredRepoRow | undefined) ?? null;
}

export interface AuditContext {
  actor?: string;
  requestId?: string;
}

export interface ProjectRow {
  projectId: string;
  name: string;
  description: string | null;
  position: number;
  archivedAt: string | null;
  deletedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  position?: number;
  audit?: AuditContext;
}

export interface UpdateProjectPatch {
  name?: string;
  description?: string | null;
  position?: number;
}

export interface ProjectQueryOptions {
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export interface ProjectRepoRow {
  repoId: string;
  projectId: string;
  path: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCounts {
  projectId: string;
  repoCount: number;
  epicCount: number;
  workItemCount: number;
}

/** Read-model row for the global web state. Keep aggregation SQL in the DB
 * layer instead of letting the WebSocket projection own persistence details. */
export interface ProjectStateSummaryRow {
  projectId: string;
  name: string;
  position: number;
  description: string | null;
  revision: number;
  archivedAt: string | null;
  epicCount: number;
  workItemCount: number;
  archivedCount: number;
  activeRuns: number;
  totalTokens: number;
}

/** Repository metadata for the global state. Path remains server-side. */
export interface RepositoryStateSummaryRow {
  repoId: string;
  projectId: string | null;
  path: string;
}

export interface EpicRow {
  epicId: string;
  projectId: string;
  repoId: string | null;
  title: string;
  description: string | null;
  status: EpicStatus;
  position: number;
  archivedAt: string | null;
  deletedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEpicInput {
  projectId: string;
  title: string;
  description?: string | null;
  audit?: AuditContext;
}

export interface UpdateEpicPatch {
  title?: string;
  description?: string | null;
  status?: EpicStatus;
  position?: number;
}

/** Public Work Item contract. `workItemId` deliberately hides the legacy
 * `backlog_features.feature_id` storage name at every new boundary. */
export interface WorkItemRow extends Omit<WorkItem, 'id'> {
  workItemId: string;
  epicId: string;
  repoId: string;
  type: 'feature';
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkItemInput {
  epicId: string;
  repoId: string;
  title: string;
  description?: string | null;
  dependsOn?: string[];
  audit?: AuditContext;
}

/** Minimal persisted ownership data needed before a Work Item can touch the
 * filesystem. The caller deliberately owns path canonicalization and access
 * checks so DB reads stay cheap and side-effect free. */
export interface WorkItemExecutionTarget {
  workItemId: string;
  repoId: string;
  repoPath: string;
  projectId: string;
  epicId: string;
}

type ProjectRepoLinkRow = Omit<ProjectRepoRow, 'path'>;

const PROJECT_SELECT = `
  SELECT project_id AS projectId, name, description, position,
         archived_at AS archivedAt, deleted_at AS deletedAt,
         revision, created_at AS createdAt, updated_at AS updatedAt
    FROM projects`;

const PROJECT_REPO_SELECT = `
  SELECT pr.repo_id AS repoId, pr.project_id AS projectId, r.path,
         pr.position, pr.created_at AS createdAt, pr.updated_at AS updatedAt
    FROM project_repos pr
    JOIN repos r ON r.repo_id = pr.repo_id`;

const PROJECT_REPO_LINK_SELECT = `
  SELECT repo_id AS repoId, project_id AS projectId, position,
         created_at AS createdAt, updated_at AS updatedAt
    FROM project_repos`;

const EPIC_SELECT = `
  SELECT epic_id AS epicId, project_id AS projectId, repo_id AS repoId,
         title, description, status, position, archived_at AS archivedAt,
         deleted_at AS deletedAt, revision, updated_at AS updatedAt,
         updated_at AS createdAt
    FROM backlog_epics`;

export function createProject(input: CreateProjectInput): ProjectRow {
  return withTransaction((database) => {
    const projectId = randomUUID();
    const position = input.position ?? nextProjectPosition(database);
    database.prepare(
      `INSERT INTO projects (project_id, name, description, position, revision)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(projectId, input.name, input.description ?? null, position);
    const project = getProjectFromDatabase(database, projectId);
    if (!project) throw new ProjectNotFoundError(projectId);
    recordAuditEvent(database, input.audit, 'project', projectId, 'create', null, project);
    return project;
  });
}

export function getProject(projectId: string, options: ProjectQueryOptions = {}): ProjectRow | null {
  if (!hasDbFile()) return null;
  const where = projectVisibilityWhere(options);
  return (getDb('readonly').prepare(`${PROJECT_SELECT} WHERE project_id = ?${where}`).get(projectId) as ProjectRow | undefined) ?? null;
}

export function listProjects(options: ProjectQueryOptions = {}): ProjectRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(`${PROJECT_SELECT} WHERE 1 = 1${projectVisibilityWhere(options)} ORDER BY position ASC, created_at ASC`)
    .all() as ProjectRow[];
}

export function createEpic(input: CreateEpicInput): EpicRow {
  return withTransaction((database) => {
    assertProjectExists(database, input.projectId);
    const epicId = randomUUID();
    const position = nextEpicPosition(database, input.projectId);
    const entity = epicEntity({ epicId, title: input.title, description: input.description ?? null, status: 'todo' });
    database.prepare(
      `INSERT INTO backlog_epics
         (epic_id, project_id, repo_id, title, description, status, position, data_json, revision)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1)`,
    ).run(epicId, input.projectId, entity.title, input.description ?? null, entity.status, position, JSON.stringify(entity));
    const epic = getEpicFromDatabase(database, epicId);
    if (!epic) throw new EpicNotFoundError(epicId);
    recordAuditEvent(database, input.audit, 'epic', epicId, 'create', null, epic);
    return epic;
  });
}

export function getEpic(epicId: string): EpicRow | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly').prepare(`${EPIC_SELECT} WHERE epic_id = ? AND archived_at IS NULL AND deleted_at IS NULL`).get(epicId) as EpicRow | undefined) ?? null;
}

export function listEpics(projectId?: string): EpicRow[] {
  if (!hasDbFile()) return [];
  const query = projectId
    ? `${EPIC_SELECT} WHERE project_id = ? AND archived_at IS NULL AND deleted_at IS NULL ORDER BY position ASC, updated_at ASC`
    : `${EPIC_SELECT} WHERE archived_at IS NULL AND deleted_at IS NULL ORDER BY position ASC, updated_at ASC`;
  return (projectId ? getDb('readonly').prepare(query).all(projectId) : getDb('readonly').prepare(query).all()) as EpicRow[];
}

export function updateEpic(epicId: string, patch: UpdateEpicPatch, expectedRevision: number, options: { audit?: AuditContext } = {}): EpicRow {
  return withTransaction((database) => {
    const before = getEpicFromDatabase(database, epicId);
    if (!before) throw new EpicNotFoundError(epicId);
    if (before.revision !== expectedRevision) throw new RevisionConflictError(epicId, expectedRevision, before.revision, 'Epic');
    const entity = epicEntity({
      epicId,
      title: patch.title ?? before.title,
      description: patch.description === undefined ? before.description : patch.description,
      status: patch.status ?? before.status,
    });
    const position = patch.position ?? before.position;
    const result = database.prepare(
      `UPDATE backlog_epics
          SET title = ?, description = ?, status = ?, position = ?, data_json = ?,
              revision = revision + 1, updated_at = datetime('now')
        WHERE epic_id = ? AND revision = ?`,
    ).run(entity.title, entity.description, entity.status, position, JSON.stringify(entity), epicId, expectedRevision);
    if (result.changes !== 1) {
      const current = getEpicFromDatabase(database, epicId);
      throw new RevisionConflictError(epicId, expectedRevision, current?.revision ?? before.revision, 'Epic');
    }
    const after = getEpicFromDatabase(database, epicId);
    if (!after) throw new EpicNotFoundError(epicId);
    recordAuditEvent(database, options.audit, 'epic', epicId, 'update', before, after);
    return after;
  });
}

/** Compatibility adapter for the legacy catalog table. It snapshots the
 * repository defaults at creation time and writes both normalized columns and
 * `data_json` inside the same transaction as the audit event. */
export function createWorkItem(input: CreateWorkItemInput): WorkItemRow {
  return withTransaction((database) => {
    const epic = getEpicFromDatabase(database, input.epicId);
    if (!epic) throw new EpicNotFoundError(input.epicId);

    const repository = database.prepare(
      `SELECT r.path, pr.project_id AS projectId
         FROM repos r LEFT JOIN project_repos pr ON pr.repo_id = r.repo_id
        WHERE r.repo_id = ?`,
    ).get(input.repoId) as { path: string; projectId: string | null } | undefined;
    if (repository?.projectId !== epic.projectId) {
      throw new RepositoryNotInProjectError(input.repoId, epic.projectId);
    }
    if (!isRepositoryUsable(repository.path)) throw new RepositoryUnavailableError(input.repoId);

    const dependsOn = [...new Set(input.dependsOn ?? [])];
    const dependencyRows = dependsOn.map((workItemId) => {
      const row = database.prepare(
        `SELECT feature_id AS featureId, repo_id AS repoId FROM backlog_features WHERE feature_id = ?`,
      ).get(workItemId) as { featureId: string; repoId: string } | undefined;
      if (!row) throw new DependencyNotFoundError(workItemId);
      if (row.repoId !== input.repoId) throw new CrossRepositoryDependencyError(workItemId, row.repoId);
      return row;
    });
    void dependencyRows;

    const defaults = getRepositoryDefaults(database, input.repoId);
    const reserved = listOccupiedFeatureIds(database);
    const workItemId = allocateFeatureId(reserved);
    const feature = FeatureSchema.parse({
      id: workItemId,
      title: input.title,
      dependsOn,
      tasks: [],
      tool: defaults.tool,
      ...(defaults.model === undefined ? {} : { model: defaults.model }),
      effort: defaults.effort,
      thinking: defaults.thinking,
      skills: defaults.skills,
      workflow: defaults.workflow,
      ...(defaults.maxTokens === undefined ? {} : { maxTokens: defaults.maxTokens }),
      autoStart: false,
    });
    assertNoWorkItemCycle(database, input.repoId, input.epicId, feature);

    const description = input.description ?? null;
    const data = { ...feature, type: 'feature' as const, ...(description === null ? {} : { description }) };
    const position = (database.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM backlog_features WHERE epic_id = ?`,
    ).get(input.epicId) as { position: number }).position;
    database.prepare(
      `INSERT INTO backlog_features
         (feature_id, epic_id, repo_id, title, description, depends_on, spec_file, position, data_json, revision, archived_at, deleted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, NULL, NULL, datetime('now'))`,
    ).run(workItemId, input.epicId, input.repoId, feature.title, description, JSON.stringify(dependsOn), position, JSON.stringify(data));
    const workItem = getWorkItemFromDatabase(database, workItemId);
    if (!workItem) throw new Error(`Work Item was not created: ${workItemId}`);
    recordAuditEvent(database, input.audit, 'work_item', workItemId, 'create', null, workItem);
    return workItem;
  });
}

/** Finds the persisted repo/project ownership for a live Work Item. */
export function getWorkItemExecutionTarget(workItemId: string): WorkItemExecutionTarget | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly').prepare(
    `SELECT f.feature_id AS workItemId, f.repo_id AS repoId, r.path AS repoPath,
            e.project_id AS projectId, f.epic_id AS epicId
       FROM backlog_features f
       JOIN backlog_epics e ON e.epic_id = f.epic_id
       JOIN repos r ON r.repo_id = f.repo_id
      WHERE f.feature_id = ? AND f.archived_at IS NULL AND f.deleted_at IS NULL`,
  ).get(workItemId) as WorkItemExecutionTarget | undefined) ?? null;
}

export function updateProject(
  projectId: string,
  patch: UpdateProjectPatch,
  expectedRevision: number,
  options: { audit?: AuditContext } = {},
): ProjectRow {
  return withTransaction((database) => {
    const before = getProjectFromDatabase(database, projectId);
    if (!before) throw new ProjectNotFoundError(projectId);
    if (before.revision !== expectedRevision) {
      throw new RevisionConflictError(projectId, expectedRevision, before.revision);
    }

    const name = patch.name ?? before.name;
    const description = patch.description === undefined ? before.description : patch.description;
    const position = patch.position ?? before.position;
    const result = database.prepare(
      `UPDATE projects
          SET name = ?, description = ?, position = ?, revision = revision + 1,
              updated_at = datetime('now')
        WHERE project_id = ? AND revision = ?`,
    ).run(name, description, position, projectId, expectedRevision);
    if (result.changes !== 1) {
      const current = getProjectFromDatabase(database, projectId);
      throw new RevisionConflictError(projectId, expectedRevision, current?.revision ?? before.revision);
    }
    const after = getProjectFromDatabase(database, projectId);
    if (!after) throw new ProjectNotFoundError(projectId);
    recordAuditEvent(database, options.audit, 'project', projectId, 'update', before, after);
    return after;
  });
}

export function listProjectRepos(projectId: string): ProjectRepoRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(`${PROJECT_REPO_SELECT} WHERE pr.project_id = ? ORDER BY pr.position ASC, pr.created_at ASC`)
    .all(projectId) as ProjectRepoRow[];
}

export function linkRepo(
  projectId: string,
  repoId: string,
  options: { audit?: AuditContext; position?: number } = {},
): ProjectRepoRow {
  return withTransaction((database) => {
    assertProjectExists(database, projectId);
    const existing = getProjectRepoLink(database, repoId);
    if (existing) throw new RepoAlreadyLinkedError(repoId, existing.projectId);
    const position = options.position ?? nextProjectRepoPosition(database, projectId);
    try {
      database.prepare(
        `INSERT INTO project_repos (repo_id, project_id, position) VALUES (?, ?, ?)`,
      ).run(repoId, projectId, position);
    } catch (error) {
      // The preflight above gives a useful error in the common case. This
      // second check closes the race when another connection links the repo
      // between that read and the unique-key insert.
      const concurrentLink = getProjectRepoLink(database, repoId);
      if (concurrentLink) throw new RepoAlreadyLinkedError(repoId, concurrentLink.projectId);
      throw error;
    }
    const after = getProjectRepo(database, repoId);
    if (!after) throw new Error(`Repository link was not created for ${repoId}`);
    recordAuditEvent(database, options.audit, 'project_repo', repoId, 'link', null, after);
    return after;
  });
}

export function moveRepo(
  repoId: string,
  toProjectId: string,
  options: { audit?: AuditContext; position?: number } = {},
): ProjectRepoRow | null {
  return withTransaction((database) => {
    assertProjectExists(database, toProjectId);
    const before = getProjectRepoLink(database, repoId);
    if (!before) return null;
    if (before.projectId === toProjectId) return getProjectRepo(database, repoId);
    assertRepoHasNoWorkItems(database, repoId, before.projectId);
    const position = options.position ?? nextProjectRepoPosition(database, toProjectId);
    database.prepare(
      `UPDATE project_repos
          SET project_id = ?, position = ?, updated_at = datetime('now')
        WHERE repo_id = ?`,
    ).run(toProjectId, position, repoId);
    const after = getProjectRepo(database, repoId);
    if (!after) throw new Error(`Repository link was not moved for ${repoId}`);
    recordAuditEvent(database, options.audit, 'project_repo', repoId, 'move', before, after);
    return after;
  });
}

export function unlinkRepo(
  repoId: string,
  options: { audit?: AuditContext; projectId?: string } = {},
): boolean {
  return withTransaction((database) => {
    const before = getProjectRepoLink(database, repoId);
    if (!before) return false;
    if (options.projectId !== undefined && before.projectId !== options.projectId) {
      throw new RepoNotLinkedToProjectError(repoId, options.projectId);
    }
    assertRepoHasNoWorkItems(database, repoId, before.projectId);
    database.prepare(`DELETE FROM project_repos WHERE repo_id = ?`).run(repoId);
    recordAuditEvent(database, options.audit, 'project_repo', repoId, 'unlink', before, null);
    return true;
  });
}

export function getProjectCounts(projectId: string): ProjectCounts | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly').prepare(projectCountsSql('WHERE p.project_id = ?')).get(projectId) as ProjectCounts | undefined) ?? null;
}

export function listProjectCounts(options: ProjectQueryOptions = {}): ProjectCounts[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(`${projectCountsSql(`WHERE 1 = 1${projectVisibilityWhere(options)}`)} ORDER BY p.position ASC, p.created_at ASC`)
    .all() as ProjectCounts[];
}

/** Active Project summaries for the state-push read model. */
export function listProjectStateSummaries(): ProjectStateSummaryRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly').prepare(`
    SELECT p.project_id AS projectId, p.name, p.position, p.description, p.revision,
           p.archived_at AS archivedAt,
           (SELECT COUNT(*) FROM backlog_epics e
             WHERE e.project_id = p.project_id AND e.archived_at IS NULL AND e.deleted_at IS NULL) AS epicCount,
           (SELECT COUNT(*) FROM backlog_features f JOIN backlog_epics e ON e.epic_id = f.epic_id
             WHERE e.project_id = p.project_id AND f.archived_at IS NULL AND f.deleted_at IS NULL) AS workItemCount,
           ((SELECT COUNT(*) FROM backlog_epics e
              WHERE e.project_id = p.project_id AND e.archived_at IS NOT NULL)
            + (SELECT COUNT(*) FROM backlog_features f JOIN backlog_epics e ON e.epic_id = f.epic_id
              WHERE e.project_id = p.project_id AND f.archived_at IS NOT NULL)) AS archivedCount,
           (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.project_id AND r.status = 'running') AS activeRuns,
           (SELECT COALESCE(SUM(COALESCE(r.total_tokens, 0)), 0) FROM runs r
             WHERE r.project_id = p.project_id) AS totalTokens
      FROM projects p
     WHERE p.archived_at IS NULL AND p.deleted_at IS NULL
     ORDER BY p.position ASC, p.created_at ASC
  `).all() as ProjectStateSummaryRow[];
}

/** Every registered repository, including unlinked rows. No filesystem health
 * check is performed in this hot query. */
export function listRepositoryStateSummaries(): RepositoryStateSummaryRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly').prepare(`
    SELECT r.repo_id AS repoId, pr.project_id AS projectId, r.path
      FROM repos r
      LEFT JOIN project_repos pr ON pr.repo_id = r.repo_id
      LEFT JOIN projects p ON p.project_id = pr.project_id
     WHERE p.deleted_at IS NULL OR p.project_id IS NULL
     ORDER BY r.created_at ASC, r.repo_id ASC
  `).all() as RepositoryStateSummaryRow[];
}

/** Monotonic state revision: Project/repository mutations record audit events
 * in the same transaction, so consumers can detect concurrent mutations. */
export function getProjectStateRevision(): number {
  if (!hasDbFile()) return 0;
  return (getDb('readonly').prepare(`SELECT COALESCE(MAX(id), 0) AS revision FROM audit_events`).get() as { revision: number }).revision;
}

function projectCountsSql(where: string): string {
  return `
    SELECT p.project_id AS projectId,
           (SELECT COUNT(*) FROM project_repos pr WHERE pr.project_id = p.project_id) AS repoCount,
           (SELECT COUNT(*) FROM backlog_epics e WHERE e.project_id = p.project_id) AS epicCount,
           (SELECT COUNT(*)
              FROM backlog_features f
              JOIN backlog_epics e ON e.epic_id = f.epic_id
             WHERE e.project_id = p.project_id AND f.deleted_at IS NULL) AS workItemCount
      FROM projects p
      ${where}`;
}

function projectVisibilityWhere(options: ProjectQueryOptions): string {
  return `${options.includeArchived ? '' : ' AND archived_at IS NULL'}${options.includeDeleted ? '' : ' AND deleted_at IS NULL'}`;
}

function getProjectFromDatabase(database: ReturnType<typeof getDb>, projectId: string): ProjectRow | null {
  return (database.prepare(`${PROJECT_SELECT} WHERE project_id = ?`).get(projectId) as ProjectRow | undefined) ?? null;
}

function getEpicFromDatabase(database: ReturnType<typeof getDb>, epicId: string): EpicRow | null {
  return (database.prepare(`${EPIC_SELECT} WHERE epic_id = ?`).get(epicId) as EpicRow | undefined) ?? null;
}

function getWorkItemFromDatabase(database: ReturnType<typeof getDb>, workItemId: string): WorkItemRow | null {
  const row = database.prepare(
    `SELECT feature_id AS workItemId, epic_id AS epicId, repo_id AS repoId, title,
            description, depends_on AS dependsOn, data_json AS dataJson, revision,
            updated_at AS updatedAt
       FROM backlog_features
      WHERE feature_id = ? AND archived_at IS NULL AND deleted_at IS NULL`,
  ).get(workItemId) as {
    workItemId: string;
    epicId: string;
    repoId: string;
    title: string;
    description: string | null;
    dependsOn: string;
    dataJson: string;
    revision: number;
    updatedAt: string;
  } | undefined;
  if (!row) return null;
  const stored = JSON.parse(row.dataJson) as Record<string, unknown>;
  const feature = FeatureSchema.parse(stored);
  return {
    ...feature,
    workItemId: row.workItemId,
    epicId: row.epicId,
    repoId: row.repoId,
    type: 'feature',
    description: row.description ?? (typeof stored.description === 'string' ? stored.description : undefined),
    revision: row.revision,
    createdAt: row.updatedAt,
    updatedAt: row.updatedAt,
  };
}

function getRepositoryDefaults(database: ReturnType<typeof getDb>, repoId: string): Defaults {
  const row = database.prepare(
    `SELECT defaults_json AS defaultsJson FROM backlog_catalog_meta WHERE repo_id = ?`,
  ).get(repoId) as { defaultsJson: string } | undefined;
  return DefaultsSchema.parse(row ? JSON.parse(row.defaultsJson) : {});
}

function isRepositoryUsable(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function assertNoWorkItemCycle(
  database: ReturnType<typeof getDb>,
  repoId: string,
  epicId: string,
  candidate: Feature,
): void {
  const rows = database.prepare(
    `SELECT epic_id AS epicId, data_json AS dataJson
       FROM backlog_features
      WHERE repo_id = ? AND archived_at IS NULL AND deleted_at IS NULL`,
  ).all(repoId) as { epicId: string; dataJson: string }[];
  const byEpic = new Map<string, Feature[]>();
  for (const row of rows) {
    const features = byEpic.get(row.epicId) ?? [];
    features.push(FeatureSchema.parse(JSON.parse(row.dataJson)));
    byEpic.set(row.epicId, features);
  }
  const candidateEpic = byEpic.get(epicId) ?? [];
  candidateEpic.push(candidate);
  byEpic.set(epicId, candidateEpic);
  try {
    topoOrder({
      version: 2,
      repo: repoId,
      defaults: DefaultsSchema.parse({}),
      epics: [...byEpic.entries()].map(([id, features]) => ({ id, title: id, status: 'todo' as const, features })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DependencyCycleError(message);
  }
}

function epicEntity(input: { epicId: string; title: string; description: string | null; status: EpicStatus }): Record<string, unknown> {
  return EpicSchema.parse({
    id: input.epicId,
    title: input.title,
    ...(input.description === null ? {} : { description: input.description }),
    status: input.status,
    features: [],
  });
}

function getProjectRepoLink(database: ReturnType<typeof getDb>, repoId: string): ProjectRepoLinkRow | null {
  return (database.prepare(`${PROJECT_REPO_LINK_SELECT} WHERE repo_id = ?`).get(repoId) as ProjectRepoLinkRow | undefined) ?? null;
}

function getProjectRepo(database: ReturnType<typeof getDb>, repoId: string): ProjectRepoRow | null {
  return (database.prepare(`${PROJECT_REPO_SELECT} WHERE pr.repo_id = ?`).get(repoId) as ProjectRepoRow | undefined) ?? null;
}

function assertProjectExists(database: ReturnType<typeof getDb>, projectId: string): void {
  if (!getProjectFromDatabase(database, projectId)) throw new ProjectNotFoundError(projectId);
}

function assertRepoHasNoWorkItems(database: ReturnType<typeof getDb>, repoId: string, projectId: string): void {
  const row = database.prepare(
    `SELECT 1
       FROM backlog_features f
       JOIN backlog_epics e ON e.epic_id = f.epic_id
      WHERE f.repo_id = ? AND e.project_id = ? AND f.deleted_at IS NULL
      LIMIT 1`,
  ).get(repoId, projectId) as { 1: number } | undefined;
  if (row) throw new RepoInUseError(repoId);
}

function nextProjectPosition(database: ReturnType<typeof getDb>): number {
  const row = database.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS position FROM projects`).get() as { position: number };
  return row.position;
}

function nextProjectRepoPosition(database: ReturnType<typeof getDb>, projectId: string): number {
  const row = database.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM project_repos WHERE project_id = ?`,
  ).get(projectId) as { position: number };
  return row.position;
}

function nextEpicPosition(database: ReturnType<typeof getDb>, projectId: string): number {
  const row = database.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM backlog_epics WHERE project_id = ?`,
  ).get(projectId) as { position: number };
  return row.position;
}

function recordAuditEvent(
  database: ReturnType<typeof getDb>,
  context: AuditContext | undefined,
  entityKind: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
): void {
  database.prepare(
    `INSERT INTO audit_events (request_id, actor, entity_kind, entity_id, action, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    context?.requestId ?? randomUUID(),
    context?.actor ?? 'system',
    entityKind,
    entityId,
    action,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
  );
}

export type FeatureTopicAssociationState = 'creating' | 'active' | 'invalid' | 'error';

export interface FeatureTopicAssociationRow {
  chatId: string;
  featureId: string;
  threadId: number | null;
  title: string;
  state: FeatureTopicAssociationState;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapFeatureTopicAssociation(row: Record<string, unknown> | undefined): FeatureTopicAssociationRow | null {
  if (!row) return null;
  return {
    chatId: String(row.chatId),
    featureId: String(row.featureId),
    threadId: typeof row.threadId === 'number' ? row.threadId : null,
    title: String(row.title),
    state: row.state as FeatureTopicAssociationState,
    leaseToken: typeof row.leaseToken === 'string' ? row.leaseToken : null,
    leaseExpiresAt: typeof row.leaseExpiresAt === 'string' ? row.leaseExpiresAt : null,
    lastError: typeof row.lastError === 'string' ? row.lastError : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

const FEATURE_TOPIC_SELECT = `
  SELECT chat_id AS chatId, feature_id AS featureId, thread_id AS threadId,
         title, state, lease_token AS leaseToken,
         lease_expires_at AS leaseExpiresAt, last_error AS lastError,
         created_at AS createdAt, updated_at AS updatedAt
    FROM feature_topic_associations
`;

export function getFeatureTopicAssociation(chatId: string, featureId: string): FeatureTopicAssociationRow | null {
  if (!hasDbFile()) return null;
  const row = getDb('readonly')
    .prepare(`${FEATURE_TOPIC_SELECT} WHERE chat_id = ? AND feature_id = ?`)
    .get(chatId, featureId) as Record<string, unknown> | undefined;
  return mapFeatureTopicAssociation(row);
}

export function listFeatureTopicAssociations(chatId?: string): FeatureTopicAssociationRow[] {
  if (!hasDbFile()) return [];
  const query = chatId
    ? `${FEATURE_TOPIC_SELECT} WHERE chat_id = ? ORDER BY feature_id ASC`
    : `${FEATURE_TOPIC_SELECT} ORDER BY chat_id ASC, feature_id ASC`;
  const rows = (chatId ? getDb('readonly').prepare(query).all(chatId) : getDb('readonly').prepare(query).all()) as Record<string, unknown>[];
  return rows.map((row) => mapFeatureTopicAssociation(row)).filter((row): row is FeatureTopicAssociationRow => row !== null);
}

export interface FeatureTopicReservationOptions {
  leaseToken: string;
  leaseExpiresAt: string;
}

export function reserveFeatureTopicAssociation(
  chatId: string,
  featureId: string,
  title: string,
  options: FeatureTopicReservationOptions,
): FeatureTopicAssociationRow | null {
  return withTransaction((database) => {
    const existing = database
      .prepare(`${FEATURE_TOPIC_SELECT} WHERE chat_id = ? AND feature_id = ?`)
      .get(chatId, featureId) as Record<string, unknown> | undefined;
    const current = mapFeatureTopicAssociation(existing);
    const leaseIsActive = current?.state === 'creating'
      && current.leaseExpiresAt !== null
      && Date.parse(current.leaseExpiresAt) > Date.now();
    if (current?.state === 'active' || leaseIsActive) return current;

    database.prepare(`
      INSERT INTO feature_topic_associations
        (chat_id, feature_id, thread_id, title, state, lease_token, lease_expires_at, last_error)
      VALUES (?, ?, NULL, ?, 'creating', ?, ?, NULL)
      ON CONFLICT(chat_id, feature_id) DO UPDATE SET
        thread_id = NULL,
        title = feature_topic_associations.title,
        state = 'creating',
        lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at,
        last_error = NULL,
        updated_at = datetime('now')
    `).run(chatId, featureId, title, options.leaseToken, options.leaseExpiresAt);

    const reserved = database
      .prepare(`${FEATURE_TOPIC_SELECT} WHERE chat_id = ? AND feature_id = ?`)
      .get(chatId, featureId) as Record<string, unknown> | undefined;
    return mapFeatureTopicAssociation(reserved);
  });
}

export function activateFeatureTopicAssociation(chatId: string, featureId: string, threadId: number): void {
  getDb('readwrite').prepare(`
    UPDATE feature_topic_associations
       SET thread_id = ?, state = 'active', lease_token = NULL,
           lease_expires_at = NULL, last_error = NULL, updated_at = datetime('now')
     WHERE chat_id = ? AND feature_id = ?
  `).run(threadId, chatId, featureId);
}

export function invalidateFeatureTopicAssociation(chatId: string, featureId: string, error?: string): void {
  getDb('readwrite').prepare(`
    UPDATE feature_topic_associations
       SET thread_id = NULL, state = 'invalid', lease_token = NULL,
           lease_expires_at = NULL, last_error = ?, updated_at = datetime('now')
     WHERE chat_id = ? AND feature_id = ?
  `).run(error ?? null, chatId, featureId);
}

export function recordFeatureTopicAssociationError(
  chatId: string,
  featureId: string,
  error: string,
  state: FeatureTopicAssociationState = 'error',
): void {
  getDb('readwrite').prepare(`
    UPDATE feature_topic_associations
       SET state = ?, last_error = ?, lease_token = NULL,
           lease_expires_at = NULL, updated_at = datetime('now')
     WHERE chat_id = ? AND feature_id = ?
  `).run(state, error, chatId, featureId);
}

export interface CreateRunOptions {
  pipelineId?: number;
  stage?: string;
}

export type RunStatus = 'running' | 'done' | 'failed' | 'blocked' | 'aborted';

export interface RunPublishState {
  verified: boolean;
  error: string | null;
  evidence: PublishEvidence;
}
export type PipelineStatus = 'running' | 'paused' | 'aborting' | 'aborted' | 'done' | 'failed' | 'blocked';

export interface PipelineSnapshot {
  plan: string[];
  done: string[];
  pending: string[];
  active: string[];
  aborted: string[];
  workflowRevisions?: PipelineWorkflowRevisions;
}

export type PipelineWorkflowRevision = Pick<Workflow, 'mode' | 'stages' | 'syncTasksToBacklog' | 'sessionPolicy' | 'stepGuidance' | 'stagePublishes'>;
export type PipelineWorkflowRevisions = Record<string, PipelineWorkflowRevision>;

export function createRun(
  repoId: string,
  featureId: string,
  tool: string,
  opts: CreateRunOptions = {},
): number {
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO runs (repo_id, project_id, feature_id, tool, pipeline_id, stage)
       VALUES (?, (SELECT project_id FROM project_repos WHERE repo_id = ?), ?, ?, ?, ?)`,
    )
    .run(repoId, repoId, featureId, tool, opts.pipelineId ?? null, opts.stage ?? null);
  const runId = Number(info.lastInsertRowid);
  recordRunEvent(runId, 'started', opts.stage ? { stage: opts.stage } : undefined);
  return runId;
}

export function finishRun(
  runId: number,
  status: RunStatus,
  summary?: string,
): void {
  getDb('readwrite')
    .prepare(`UPDATE runs SET status = ?, summary = ?, ended_at = datetime('now') WHERE id = ?`)
    .run(status, summary ?? null, runId);
  recordRunEvent(runId, status, summary ? { summary } : undefined);
}

export function updateRunPublishState(runId: number, publish: RunPublishState): void {
  getDb('readwrite')
    .prepare(
      `UPDATE runs
       SET publish_verified = ?,
           publish_error = ?,
           branch_name = ?,
           base_branch = ?,
           commit_sha = ?,
           remote_branch = ?,
           pr_number = ?,
           pr_url = ?
       WHERE id = ?`,
    )
    .run(
      publish.verified ? 1 : 0,
      publish.error,
      publish.evidence.branch,
      publish.evidence.baseBranch,
      publish.evidence.commitSha,
      publish.evidence.remoteBranch,
      publish.evidence.prNumber,
      publish.evidence.prUrl,
      runId,
    );
}

export interface PublishedRunRow {
  featureId: string;
  prNumber: number | null;
  prUrl: string | null;
  branchName: string | null;
  remoteBranch: string | null;
  baseBranch: string | null;
  startedAt: string;
}

// Most recent run of a feature that produced a pull request (pr_url set). Used
// to recover a dependency's published PR/branch so a dependent feature can
// stack its own branch/PR on top of it.
export function getLatestPublishedRunForFeature(
  repoId: string,
  featureId: string,
): PublishedRunRow | null {
  if (!hasDbFile()) return null;
  const db = getDb('readonly');
  const runColumns = new Set(
    (db.prepare(`PRAGMA table_info(runs)`).all() as { name?: string }[])
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string'),
  );
  if (!runColumns.has('pr_url')) return null;
  const row = db
    .prepare(
      `SELECT
         r.feature_id AS featureId,
         ${getRunColumnProjection(runColumns, 'pr_number', 'prNumber')},
         ${getRunColumnProjection(runColumns, 'pr_url', 'prUrl')},
         ${getRunColumnProjection(runColumns, 'branch_name', 'branchName')},
         ${getRunColumnProjection(runColumns, 'remote_branch', 'remoteBranch')},
         ${getRunColumnProjection(runColumns, 'base_branch', 'baseBranch')},
         r.started_at AS startedAt
       FROM runs r
       WHERE r.repo_id = ? AND r.feature_id = ? AND r.pr_url IS NOT NULL
       ${runColumns.has('publish_verified')
         // A verified publication outranks a merely recent one: a run that
         // timed out before verification must not become the stacking base.
         ? `ORDER BY COALESCE(r.publish_verified, 0) DESC, r.started_at DESC`
         : `ORDER BY r.started_at DESC`}
       LIMIT 1`,
    )
    .get(repoId, featureId) as PublishedRunRow | undefined;
  return row ?? null;
}

export function upsertRunSessionStatus(snapshot: SessionStatusSnapshot): void {
  const database = getDb('readwrite');
  const legacyStatus = snapshot.status === 'completed'
    ? 'done'
    : snapshot.status === 'interrupted'
      ? 'aborted'
      : snapshot.status === 'failed' || snapshot.status === 'timed_out'
        ? 'failed'
        : null;
  database.prepare(
    `UPDATE runs
       SET session_status = ?,
           session_started_at = ?,
           session_updated_at = ?,
           session_elapsed_ms = ?,
           session_last_output_at = ?,
           session_idle_ms = ?,
           session_reason = ?,
           session_terminal = ?,
           status = CASE WHEN ? IS NULL THEN status WHEN status IN ('running', 'done', 'failed', 'aborted') THEN ? ELSE status END,
           ended_at = CASE WHEN ? = 1 AND ended_at IS NULL THEN ? ELSE ended_at END
     WHERE id = ? AND (session_terminal = 0 OR ? = 1)`,
  ).run(
    snapshot.status,
    snapshot.startedAt,
    snapshot.updatedAt,
    snapshot.elapsedMs,
    snapshot.lastOutputAt,
    snapshot.idleMs,
    snapshot.reason,
    snapshot.terminal ? 1 : 0,
    legacyStatus,
    legacyStatus,
    snapshot.terminal ? 1 : 0,
    snapshot.updatedAt,
    snapshot.runId,
    snapshot.terminal ? 1 : 0,
  );
  recordRunEvent(snapshot.runId, `status:${snapshot.status}`, snapshot as unknown as Record<string, unknown>);
}

export type RunToolCallRow = ToolCallRecord;

export function upsertRunToolCall(record: ToolCallRecord): void {
  record = sanitizeToolCallRecord(record);
  const args = record.arguments == null ? null : JSON.stringify(record.arguments).slice(0, 20_000);
  getDb('readwrite').prepare(
    `INSERT INTO run_tool_calls (
       run_id, id, feature_id, tool, sequence, phase, name, arguments_json, output, step,
       started_at, completed_at, error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, id) DO UPDATE SET
       phase = CASE WHEN run_tool_calls.phase IN ('completed', 'failed') THEN run_tool_calls.phase ELSE excluded.phase END,
       sequence = MIN(run_tool_calls.sequence, excluded.sequence),
       arguments_json = COALESCE(excluded.arguments_json, run_tool_calls.arguments_json),
       output = COALESCE(excluded.output, run_tool_calls.output),
       step = COALESCE(excluded.step, run_tool_calls.step),
       completed_at = COALESCE(excluded.completed_at, run_tool_calls.completed_at),
       error = COALESCE(excluded.error, run_tool_calls.error)`,
  ).run(
    record.runId,
    record.id.slice(0, 200),
    record.featureId,
    record.tool,
    record.sequence,
    record.phase,
    record.name.slice(0, 200),
    args,
    record.output?.slice(0, 20_000) ?? null,
    record.step?.slice(0, 200) ?? null,
    record.startedAt,
    record.completedAt,
    record.error?.slice(0, 500) ?? null,
  );
}

export function listRunToolCalls(runId: number, limit = 200): RunToolCallRow[] {
  if (!hasDbFile()) return [];
  type RawToolCallRow = Omit<RunToolCallRow, 'arguments'> & { argumentsJson: string | null };
  const rows = getDb('readonly').prepare(
    `SELECT run_id AS runId, id, feature_id AS featureId, tool, sequence, phase, name,
            arguments_json AS argumentsJson, output, step, started_at AS startedAt,
            completed_at AS completedAt, error
       FROM (
         SELECT *
         FROM run_tool_calls
         WHERE run_id = ?
         ORDER BY sequence DESC, started_at DESC
         LIMIT ?
       ) recent
       ORDER BY sequence ASC, started_at ASC`,
  ).all(runId, limit) as RawToolCallRow[];
  return rows.map(({ argumentsJson, ...row }) => ({
    ...row,
    arguments: argumentsJson ? parseJsonValue(argumentsJson) : null,
  }));
}

export function getRunSessionStatus(runId: number): SessionStatusSnapshot | null {
  if (!hasDbFile()) return null;
  const row = getDb('readonly').prepare(
    `SELECT id AS runId, feature_id AS featureId, tool, session_status AS status,
            session_started_at AS startedAt, session_updated_at AS updatedAt,
            session_elapsed_ms AS elapsedMs, session_last_output_at AS lastOutputAt,
            session_idle_ms AS idleMs, session_reason AS reason, session_terminal AS terminal
       FROM runs WHERE id = ? AND session_status IS NOT NULL`,
  ).get(runId) as (Omit<SessionStatusSnapshot, 'terminal'> & { terminal: number }) | undefined;
  return row ? { ...row, terminal: Boolean(row.terminal) } : null;
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    logCaughtError('db/repo.parseJsonValue', error);
    return null;
  }
}

export function cleanupStaleRuns(olderThanMinutes: number): number {
  const info = getDb('readwrite')
    .prepare(
      `UPDATE runs
       SET status = 'failed', ended_at = datetime('now')
       WHERE status = 'running'
         AND started_at <= datetime('now', '-' || ? || ' minutes')`,
    )
    .run(olderThanMinutes);
  return info.changes;
}

export function recordUsage(runId: number, usage: TokenUsage): void {
  updateRunUsage(runId, usage);
}

export function updateRunUsage(runId: number, usage: TokenUsage | TokensUpdateEvent): void {
  const db = getDb('readwrite');
  const previous = db
    .prepare(
      `SELECT tool,
              COALESCE(input_tokens, 0) AS inputTokens,
              COALESCE(cached_input_tokens, 0) AS cachedInputTokens,
              COALESCE(output_tokens, 0) AS outputTokens,
              COALESCE(total_tokens, 0) AS totalTokens
       FROM runs
       WHERE id = ?`,
    )
    .get(runId) as {
      tool?: Tool;
      inputTokens?: number;
      cachedInputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    } | undefined;

  db
    .prepare(
      `UPDATE runs
       SET input_tokens = ?, cached_input_tokens = ?, output_tokens = ?, total_tokens = ?
       WHERE id = ?`,
    )
    .run(usage.input, usage.cachedInput ?? null, usage.output, usage.total, runId);

  const tool = (('tool' in usage ? usage.tool : undefined) ?? previous?.tool);
  if (tool) {
    const contextWindowTokens = resolveContextWindow({ tool });
    const contextWindowPercent = computeContextWindowPercent(usage.total, contextWindowTokens);
    db.prepare(
      `UPDATE runs
       SET context_window_tokens = ?, context_window_percent = ?
       WHERE id = ?`,
    ).run(contextWindowTokens, contextWindowPercent, runId);
  }

  db
    .prepare(`INSERT INTO token_usage (run_id, input, cached_input, output, total) VALUES (?, ?, ?, ?, ?)`)
    .run(runId, usage.input, usage.cachedInput ?? 0, usage.output, usage.total);

  applyTaskUsageDelta(db, runId, previous, usage, tool);
}

export interface RunOutputRow {
  id: number;
  runId: number;
  featureId: string;
  tool: string;
  stream: OutputStream;
  source: OutputSource;
  line: string;
  createdAt: string;
  toolName: string | null;
  level: string | null;
}

export function appendRunOutput(event: RunOutputEvent): void {
  const createdAt = event.createdAt ?? new Date().toISOString();
  getDb('readwrite')
    .prepare(
      `INSERT INTO run_output (run_id, feature_id, tool, stream, source, line, created_at, tool_name, level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.runId,
      event.featureId ?? '',
      event.tool ?? 'tool',
      event.stream,
      event.source ?? event.stream,
      event.line,
      createdAt,
      event.toolName ?? null,
      event.level ?? null,
    );
}

export interface ContextQueryRow {
  id: number;
  runId: number;
  featureId: string | null;
  tool: string | null;
  queryTool: ContextQueryTool;
  kind: ContextQueryKind;
  target: string | null;
  observedBytes: number;
  latencyMs: number | null;
  cacheHit: boolean | null;
  rawLine: string;
  createdAt: string;
}

export interface RunContextSummary {
  totalQueries: number;
  doraQueries: number;
  serenaQueries: number;
  shellReads: number;
  structuredRate: number | null;
  observedBytes: number;
  cacheHits: number;
  cacheMisses: number;
}

export function recordContextQuery(event: ContextQueryEvent): void {
  getDb('readwrite')
    .prepare(
      `INSERT INTO context_queries (
         run_id, feature_id, tool, query_tool, kind, target, observed_bytes, latency_ms, cache_hit, raw_line
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.runId,
      event.featureId ?? null,
      event.tool ?? null,
      event.queryTool,
      event.kind,
      event.target ?? null,
      event.observedBytes,
      event.latencyMs ?? null,
      event.cacheHit == null ? null : (event.cacheHit ? 1 : 0),
      event.rawLine,
    );
}

export function listRunContextQueries(runId: number, limit = 200): ContextQueryRow[] {
  if (!hasDbFile()) return [];
  const rows = getDb('readonly')
    .prepare(
      `SELECT
         id,
         run_id AS runId,
         feature_id AS featureId,
         tool,
         query_tool AS queryTool,
         kind,
         target,
         observed_bytes AS observedBytes,
         latency_ms AS latencyMs,
         cache_hit AS cacheHit,
         raw_line AS rawLine,
         created_at AS createdAt
       FROM context_queries
       WHERE run_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(runId, limit) as (Omit<ContextQueryRow, 'cacheHit'> & { cacheHit: number | null })[];
  return rows.map((row) => ({
    ...row,
    cacheHit: row.cacheHit == null ? null : Boolean(row.cacheHit),
  }));
}

export function summarizeRunContextQueries(runId: number): RunContextSummary {
  const rows = listRunContextQueries(runId, 500);
  let doraQueries = 0;
  let serenaQueries = 0;
  let shellReads = 0;
  let observedBytes = 0;
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const row of rows) {
    if (row.queryTool === 'dora') doraQueries += 1;
    else if (row.queryTool === 'serena') serenaQueries += 1;
    else shellReads += 1;

    observedBytes += row.observedBytes;
    if (row.cacheHit === true) cacheHits += 1;
    if (row.cacheHit === false) cacheMisses += 1;
  }

  const structuredQueries = doraQueries + serenaQueries;
  const totalQueries = structuredQueries + shellReads;
  return {
    totalQueries,
    doraQueries,
    serenaQueries,
    shellReads,
    structuredRate: totalQueries > 0 ? structuredQueries / totalQueries : null,
    observedBytes,
    cacheHits,
    cacheMisses,
  };
}

export function listRunOutput(runId: number, limit = 120): RunOutputRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT id, run_id AS runId, feature_id AS featureId, tool, stream, source, line, created_at AS createdAt, tool_name AS toolName, level
       FROM (
         SELECT *
         FROM run_output
         WHERE run_id = ?
         ORDER BY id DESC
         LIMIT ?
       ) recent
       ORDER BY id ASC`,
    )
    .all(runId, limit) as RunOutputRow[];
}

export function listRunOutputAfterId(runId: number, afterId: number, limit = 200): RunOutputRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT id, run_id AS runId, feature_id AS featureId, tool, stream, source, line, created_at AS createdAt, tool_name AS toolName, level
       FROM run_output
       WHERE run_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(runId, afterId, limit) as RunOutputRow[];
}

export interface RunRow {
  id: number;
  repo_id: string;
  feature_id: string;
  tool: string;
  pipeline_id: number | null;
  stage: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  total: number | null;
}

export function listRuns(limit = 50): RunRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `WITH latest_usage AS (
         SELECT u.run_id AS runId, u.total
         FROM token_usage u
         JOIN (
           SELECT run_id, MAX(id) AS id
           FROM token_usage
           GROUP BY run_id
         ) latest_token_usage ON latest_token_usage.id = u.id
       )
       SELECT r.*, lu.total
         FROM runs r
         LEFT JOIN latest_usage lu ON lu.runId = r.id
        ORDER BY r.id DESC
        LIMIT ?`,
    )
    .all(limit) as RunRow[];
}

export function getRun(runId: number): RunRow | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly')
    .prepare(`SELECT * FROM runs WHERE id = ?`)
    .get(runId) as RunRow | undefined) ?? null;
}

// T002: RunSummary interface
export interface RunSummary {
  runId: number;
  repoId: string;
  /** Immutable Project snapshot captured when the run was created. */
  projectId?: string | null;
  integrityIssue?: string;
  featureId: string;
  tool: 'claude' | 'codex' | 'opencode';
  pipelineId: number | null;
  stage: string | null;
  rawStatus: RunStatus;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  totalTokens: number | null;
  inputTokens: number | null;
  cachedInputTokens?: number | null;
  outputTokens: number | null;
  contextWindowTokens?: number | null;
  contextWindowPercent?: number | null;
  pipelineTotalTokens?: number | null;
  pipelineInputTokens?: number | null;
  pipelineCachedInputTokens?: number | null;
  pipelineOutputTokens?: number | null;
  gateId: number | null;
  gateDecision: string | null;
  pipelineStatus: PipelineStatus | null;
  pipelineCurrentStage: string | null;
  pipelineResumeSummary: string | null;
  pendingStageRequestId: number | null;
  pendingStageRequestKind: StageRequestKind | null;
  pendingStageRequestPrompt: string | null;
  pendingStageRequestOptions?: string[] | null;
  pendingStageRequestCreatedAt: string | null;
  sessionStatus?: SessionStatusSnapshot['status'] | null;
  sessionStartedAt?: string | null;
  sessionUpdatedAt?: string | null;
  sessionElapsedMs?: number | null;
  sessionLastOutputAt?: string | null;
  sessionIdleMs?: number | null;
  sessionReason?: string | null;
  sessionTerminal?: boolean;
  latestTransitionDecision?: 'reuse' | 'new_session' | null;
  latestTransitionReason?: TransitionDecisionReason | null;
  latestTransitionToStage?: string | null;
  latestTransitionContextWindowPercent?: number | null;
  latestTransitionPreviousSessionId?: string | null;
  latestTransitionNextSessionId?: string | null;
  publishVerified?: boolean | null;
  publishError?: string | null;
  branchName?: string | null;
  baseBranch?: string | null;
  commitSha?: string | null;
  remoteBranch?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
}

function getRunColumnProjection(
  availableColumns: Set<string>,
  columnName: string,
  alias: string,
): string {
  return availableColumns.has(columnName)
    ? `r.${columnName} AS ${alias}`
    : `NULL AS ${alias}`;
}

// T003: listRunsForTui — most recent run per feature per repo (US2 deduplication via CTE)
export interface ProjectScope {
  projectId?: string;
}

export function listRunsForTui(limit = 50, repoId?: string, scope: ProjectScope = {}): RunSummary[] {
  if (!hasDbFile()) return [];
  const filters: string[] = [];
  const params: (string | number)[] = [];
  if (repoId) { filters.push('repo_id = ?'); params.push(repoId); }
  if (scope.projectId) { filters.push('project_id = ?'); params.push(scope.projectId); }
  const repoFilter = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(limit);
  const db = getDb('readonly');
  const runColumns = new Set(
    (db.prepare(`PRAGMA table_info(runs)`).all() as { name?: string }[])
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string'),
  );

  const rows = db
    .prepare(
      `WITH latest AS (
         SELECT MAX(id) AS id
         FROM runs
         ${repoFilter}
         GROUP BY repo_id, feature_id
       ),
       latest_usage AS (
         SELECT u.run_id AS runId, u.input, u.cached_input AS cachedInput, u.output, u.total
         FROM token_usage u
         JOIN (
           SELECT run_id, MAX(id) AS id
           FROM token_usage
           GROUP BY run_id
         ) latest_token_usage ON latest_token_usage.id = u.id
       ),
       pipeline_totals AS (
         SELECT
           r.pipeline_id AS pipelineId,
           r.feature_id AS featureId,
           SUM(COALESCE(r.input_tokens, lu.input, 0)) AS pipelineInputTokens,
           SUM(COALESCE(r.cached_input_tokens, lu.cachedInput, 0)) AS pipelineCachedInputTokens,
           SUM(COALESCE(r.output_tokens, lu.output, 0)) AS pipelineOutputTokens,
           SUM(COALESCE(r.total_tokens, lu.total, 0)) AS pipelineTotalTokens
         FROM runs r
         LEFT JOIN latest_usage lu ON lu.runId = r.id
         WHERE r.pipeline_id IS NOT NULL
         GROUP BY r.pipeline_id, r.feature_id
       ),
       pending_stage_requests AS (
         SELECT sr.*
         FROM stage_requests sr
         JOIN (
           SELECT MAX(id) AS id
           FROM stage_requests
           WHERE status = 'pending'
           GROUP BY pipeline_id, feature_id
         ) latest_pending ON latest_pending.id = sr.id
       ),
       latest_transitions AS (
         SELECT td.*
         FROM stage_transition_decisions td
         JOIN (
           SELECT MAX(id) AS id
           FROM stage_transition_decisions
           GROUP BY pipeline_id, feature_id
         ) latest_transition ON latest_transition.id = td.id
       )
       SELECT
         r.id          AS runId,
         r.repo_id     AS repoId,
         r.project_id  AS projectId,
         r.feature_id  AS featureId,
         r.tool,
         r.pipeline_id AS pipelineId,
         r.stage       AS stage,
         r.status      AS rawStatus,
         CASE
           WHEN psr.id IS NOT NULL THEN 'blocked'
           WHEN p.status IN ('paused', 'blocked') THEN 'blocked'
           WHEN p.status IN ('aborting', 'aborted') THEN 'aborted'
           WHEN p.status = 'failed' THEN 'failed'
           WHEN p.status = 'running' AND r.status = 'done' THEN 'running'
           ELSE r.status
         END           AS status,
         r.started_at  AS startedAt,
         r.ended_at      AS endedAt,
         COALESCE(r.total_tokens, lu.total) AS totalTokens,
         COALESCE(r.input_tokens, lu.input) AS inputTokens,
         COALESCE(r.cached_input_tokens, lu.cachedInput) AS cachedInputTokens,
         COALESCE(r.output_tokens, lu.output) AS outputTokens,
         r.context_window_tokens AS contextWindowTokens,
         r.context_window_percent AS contextWindowPercent,
         COALESCE(pt.pipelineTotalTokens, COALESCE(r.total_tokens, lu.total)) AS pipelineTotalTokens,
         COALESCE(pt.pipelineInputTokens, COALESCE(r.input_tokens, lu.input)) AS pipelineInputTokens,
         COALESCE(pt.pipelineCachedInputTokens, COALESCE(r.cached_input_tokens, lu.cachedInput)) AS pipelineCachedInputTokens,
         COALESCE(pt.pipelineOutputTokens, COALESCE(r.output_tokens, lu.output)) AS pipelineOutputTokens,
         g.id            AS gateId,
         g.decision    AS gateDecision,
         p.status      AS pipelineStatus,
         p.current_stage AS pipelineCurrentStage,
         p.resume_summary AS pipelineResumeSummary,
         psr.id AS pendingStageRequestId,
         psr.kind AS pendingStageRequestKind,
         psr.prompt AS pendingStageRequestPrompt,
         psr.options AS pendingStageRequestOptions,
         psr.created_at AS pendingStageRequestCreatedAt,
         r.session_status AS sessionStatus,
         r.session_started_at AS sessionStartedAt,
         r.session_updated_at AS sessionUpdatedAt,
         r.session_elapsed_ms AS sessionElapsedMs,
         r.session_last_output_at AS sessionLastOutputAt,
         r.session_idle_ms AS sessionIdleMs,
         r.session_reason AS sessionReason,
         r.session_terminal AS sessionTerminal,
         ltd.decision AS latestTransitionDecision,
         ltd.reason AS latestTransitionReason,
         ltd.to_stage AS latestTransitionToStage,
         ltd.context_window_percent AS latestTransitionContextWindowPercent,
         ltd.previous_session_id AS latestTransitionPreviousSessionId,
         ltd.next_session_id AS latestTransitionNextSessionId,
         ${getRunColumnProjection(runColumns, 'publish_verified', 'publishVerified')},
         ${getRunColumnProjection(runColumns, 'publish_error', 'publishError')},
         ${getRunColumnProjection(runColumns, 'branch_name', 'branchName')},
         ${getRunColumnProjection(runColumns, 'base_branch', 'baseBranch')},
         ${getRunColumnProjection(runColumns, 'commit_sha', 'commitSha')},
         ${getRunColumnProjection(runColumns, 'remote_branch', 'remoteBranch')},
         ${getRunColumnProjection(runColumns, 'pr_number', 'prNumber')},
         ${getRunColumnProjection(runColumns, 'pr_url', 'prUrl')}
       FROM runs r
       JOIN latest ON latest.id = r.id
       LEFT JOIN latest_usage lu ON lu.runId = r.id
       LEFT JOIN gates g ON g.run_id = r.id AND g.resolved_at IS NULL
       LEFT JOIN pipelines p ON p.id = r.pipeline_id
       LEFT JOIN pipeline_totals pt
         ON pt.pipelineId = r.pipeline_id
        AND pt.featureId = r.feature_id
       LEFT JOIN pending_stage_requests psr
         ON psr.pipeline_id = r.pipeline_id
        AND psr.feature_id = r.feature_id
       LEFT JOIN latest_transitions ltd
         ON ltd.pipeline_id = r.pipeline_id
        AND ltd.feature_id = r.feature_id
       ORDER BY r.id DESC
       LIMIT ?`,
    )
    .all(...params) as RunSummary[];
  for (const row of rows) {
    row.pendingStageRequestOptions = decodeStageRequestOptions(row.pendingStageRequestOptions) ?? null;
    if (!row.projectId) row.integrityIssue = 'Run has no Project snapshot.';
  }
  return rows;
}

// F34 item 1: full run history for a feature (not deduplicated to the latest
// run per feature/repo like listRunsForTui), so RunDetail/FeaturePreview can
// look back at previous attempts of the same feature for stage breakdown,
// failure context, and token cost estimation.
export interface RunHistoryEntry {
  runId: number;
  repoId: string;
  featureId: string;
  tool: 'claude' | 'codex' | 'opencode';
  stage: string | null;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  totalTokens: number | null;
  pipelineResumeSummary: string | null;
}

export function listRunHistoryForFeature(repoId: string, featureId: string, limit = 20): RunHistoryEntry[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `WITH latest_usage AS (
         SELECT u.run_id AS runId, u.total
         FROM token_usage u
         JOIN (
           SELECT run_id, MAX(id) AS id
           FROM token_usage
           GROUP BY run_id
         ) latest_token_usage ON latest_token_usage.id = u.id
       ),
       pending_stage_requests AS (
         SELECT sr.*
         FROM stage_requests sr
         JOIN (
           SELECT MAX(id) AS id
           FROM stage_requests
           WHERE status = 'pending'
           GROUP BY pipeline_id, feature_id
         ) latest_pending ON latest_pending.id = sr.id
       )
       SELECT
         r.id          AS runId,
         r.repo_id     AS repoId,
         r.feature_id  AS featureId,
         r.tool,
         r.stage       AS stage,
         CASE
           WHEN psr.id IS NOT NULL THEN 'blocked'
           WHEN p.status IN ('paused', 'blocked') THEN 'blocked'
           WHEN p.status IN ('aborting', 'aborted') THEN 'aborted'
           WHEN p.status = 'failed' THEN 'failed'
           WHEN p.status = 'running' AND r.status = 'done' THEN 'running'
           ELSE r.status
         END           AS status,
         r.started_at  AS startedAt,
         r.ended_at    AS endedAt,
         COALESCE(r.total_tokens, lu.total) AS totalTokens,
         p.resume_summary AS pipelineResumeSummary
       FROM runs r
       LEFT JOIN latest_usage lu ON lu.runId = r.id
       LEFT JOIN pipelines p ON p.id = r.pipeline_id
       LEFT JOIN pending_stage_requests psr
         ON psr.pipeline_id = r.pipeline_id
        AND psr.feature_id = r.feature_id
       WHERE r.repo_id = ? AND r.feature_id = ?
       ORDER BY r.started_at DESC
       LIMIT ?`,
    )
    .all(repoId, featureId, limit) as RunHistoryEntry[];
}

// Union of feature ids present in pipelines.done_json across every pipeline run
// for a repo (i.e. every `msq run` invocation, including resumes). "Done" here
// follows the same policy the scheduler already applies when writing done_json:
// a feature counts as done if it completed per its retry/onFail policy, not
// strictly if the underlying run succeeded (see execute.ts shouldCountAsDone).
export function listCompletedFeatureIds(repoId?: string, scope: ProjectScope = {}): Set<string> {
  if (!hasDbFile()) return new Set();
  const clauses: string[] = [];
  const params: string[] = [];
  if (repoId) { clauses.push('repo_id = ?'); params.push(repoId); }
  if (scope.projectId) { clauses.push('project_id = ?'); params.push(scope.projectId); }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb('readonly')
    .prepare(
      `SELECT
         id,
         repo_id AS repoId,
         feature_id AS featureId,
         status,
         cwd,
         current_stage AS currentStage,
         auto_advance AS autoAdvance,
         plan_json AS planJson,
         done_json AS doneJson,
         pending_json AS pendingJson,
         active_json AS activeJson,
         aborted_json AS abortedJson,
         requested_abort_feature_id AS requestedAbortFeatureId,
         resume_count AS resumeCount,
         resume_summary AS resumeSummary,
         created_at AS createdAt,
         updated_at AS updatedAt,
         ended_at AS endedAt
       FROM pipelines
       ${where}`,
    )
    .all(...params) as PipelineRow[];
  const done = new Set<string>();
  for (const row of rows) {
    for (const featureId of getPipelineSnapshot(row).done) done.add(featureId);
  }
  return done;
}

export interface PipelineOverview {
  id: number;
  repoId: string;
  featureId: string;
  status: PipelineStatus;
  currentStage: string | null;
  activeFeature: string | null;
  pendingFeature: string | null;
  resumeSummary: string | null;
  pendingStageRequestId: number | null;
  pendingStageRequestKind: StageRequestKind | null;
  pendingStageRequestPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listPipelineOverviews(limit = 20): PipelineOverview[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `WITH pending_stage_requests AS (
         SELECT sr.*
         FROM stage_requests sr
         JOIN (
           SELECT MAX(id) AS id
           FROM stage_requests
           WHERE status = 'pending'
           GROUP BY pipeline_id, feature_id
         ) latest_pending ON latest_pending.id = sr.id
       )
       SELECT
         p.id AS id,
         p.repo_id AS repoId,
         p.feature_id AS featureId,
         p.status AS status,
         p.current_stage AS currentStage,
         json_extract(p.active_json, '$[0]') AS activeFeature,
         COALESCE(json_extract(p.pending_json, '$[0]'), json_extract(p.aborted_json, '$[0]')) AS pendingFeature,
         p.resume_summary AS resumeSummary,
         psr.id AS pendingStageRequestId,
         psr.kind AS pendingStageRequestKind,
         psr.prompt AS pendingStageRequestPrompt,
         p.created_at AS createdAt,
         p.updated_at AS updatedAt
       FROM pipelines p
       LEFT JOIN pending_stage_requests psr
         ON psr.pipeline_id = p.id
        AND psr.feature_id = p.feature_id
       WHERE p.status NOT IN ('done', 'failed', 'aborted')
          OR psr.id IS NOT NULL
          OR json_array_length(p.pending_json) > 0
          OR json_array_length(p.active_json) > 0
          OR json_array_length(p.aborted_json) > 0
       ORDER BY p.id DESC
       LIMIT ?`,
    )
    .all(limit) as PipelineOverview[];
}

// T004: GateRow and GateDecision types
export type GateDecision = 'approved' | 'skipped' | 'retried';

export interface GateRow {
  id: number;
  runId: number;
  featureId: string;
  repoId: string;
  projectId?: string | null;
  integrityIssue?: string;
  createdAt: string;
  resolvedAt: string | null;
  decision: GateDecision | null;
}

export function getGate(id: number): GateRow | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly')
    .prepare(
      `SELECT id, run_id AS runId, feature_id AS featureId, repo_id AS repoId,
              created_at AS createdAt, resolved_at AS resolvedAt, decision
         FROM gates
        WHERE id = ?`,
    )
    .get(id) as GateRow | undefined) ?? null;
}

// T005: openGates — SELECT WHERE resolved_at IS NULL, ORDER BY created_at ASC
export function openGates(scope: ProjectScope = {}): GateRow[] {
  if (!hasDbFile()) return [];
  const rows = getDb('readonly')
    .prepare(
      `SELECT
         g.id, g.run_id AS runId, g.feature_id AS featureId, g.repo_id AS repoId,
         r.project_id AS projectId, g.created_at AS createdAt, g.resolved_at AS resolvedAt, g.decision
       FROM gates g
       LEFT JOIN runs r ON r.id = g.run_id
       WHERE g.resolved_at IS NULL${scope.projectId ? ' AND r.project_id = ?' : ''}
       ORDER BY g.created_at ASC`,
    )
    .all(...(scope.projectId ? [scope.projectId] : [])) as GateRow[];
  for (const row of rows) if (!row.projectId) row.integrityIssue = 'Gate has no resolvable Project snapshot.';
  return rows;
}

// T006: resolveGate — sets resolved_at + decision atomically, no-op if already resolved
export function resolveGate(id: number, decision: GateDecision): void {
  const info = getDb('readwrite')
    .prepare(
      `UPDATE gates
       SET resolved_at = datetime('now'), decision = ?
       WHERE id = ? AND resolved_at IS NULL`,
    )
    .run(decision, id);
  if (info.changes > 0) {
    const gate = getDb('readonly')
      .prepare(`SELECT run_id AS runId FROM gates WHERE id = ?`)
      .get(id) as { runId: number } | undefined;
    if (gate) recordRunEvent(gate.runId, 'gate_resolved', { gateId: id, decision });
    msqEventBus.emit('gate:resolved', { gateId: id, decision });
  }
}

// F1: force-bypass an approval gate. Plain resolveGate only records a
// decision — it does not unblock execution, since a budget-violation or
// on-fail 'gate' policy pauses the whole pipeline separately (see
// core/runner/execute.ts handleGlobalBudgetViolation). Today the user has to
// approve the gate *and then* separately find the paused run in the run
// detail screen to hit resume. forceResolveGate consolidates both steps: it
// resolves the gate as 'approved' and, if that gate's pipeline is paused or
// blocked, resumes it immediately.
export function forceResolveGate(id: number): { resumedPipelineId: number | null } {
  resolveGate(id, 'approved');
  const gate = getDb('readonly')
    .prepare(`SELECT run_id AS runId FROM gates WHERE id = ?`)
    .get(id) as { runId: number } | undefined;
  if (!gate) return { resumedPipelineId: null };

  const run = getDb('readonly')
    .prepare(`SELECT pipeline_id AS pipelineId FROM runs WHERE id = ?`)
    .get(gate.runId) as { pipelineId: number | null } | undefined;
  if (!run?.pipelineId) return { resumedPipelineId: null };

  const pipeline = getPipeline(run.pipelineId);
  if (pipeline && (pipeline.status === 'paused' || pipeline.status === 'blocked')) {
    resumePipeline(run.pipelineId);
    return { resumedPipelineId: run.pipelineId };
  }
  return { resumedPipelineId: null };
}

// T007: createGate — INSERT, returns new gate id
export function createGate(runId: number, featureId: string, repoId: string): number {
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO gates (run_id, feature_id, repo_id) VALUES (?, ?, ?)`,
    )
    .run(runId, featureId, repoId);
  const gateId = Number(info.lastInsertRowid);
  recordRunEvent(runId, 'gate_wait', { gateId });
  msqEventBus.emit('gate:created', { gateId, runId, featureId, repoId });
  return gateId;
}

export function createRetryRecord(
  runId: number,
  attempt: number,
  error?: string,
  waitMs?: number,
  tool?: Tool,
  model?: string,
): void {
  getDb('readwrite')
    .prepare(
      `INSERT INTO retry_history (run_id, attempt, error, tool, model)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(runId, attempt, error ?? null, tool ?? null, model ?? null);
  recordRunEvent(runId, 'retry', {
    attempt,
    ...(waitMs !== undefined ? { waitMs } : {}),
  });
}

export function updateRunTool(runId: number, tool: Tool): void {
  getDb('readwrite')
    .prepare(`UPDATE runs SET tool = ? WHERE id = ?`)
    .run(tool, runId);
}

export interface RetryHistoryRow {
  attempt: number;
  error: string | null;
  retriedAt: string;
  tool: string | null;
  model: string | null;
}

export function listRetryHistory(runId: number): RetryHistoryRow[] {
  const rows = getDb('readonly')
    .prepare(
      `SELECT attempt, error, retried_at AS retriedAt, tool, model
       FROM retry_history
       WHERE run_id = ?
       ORDER BY attempt ASC`,
    )
    .all(runId) as RetryHistoryRow[];
  return rows;
}

export function getRunAccumulatedTokens(runId: number): number {
  const row = getDb('readonly')
    .prepare(`SELECT COALESCE(SUM(total), 0) AS total FROM token_usage WHERE run_id = ?`)
    .get(runId) as { total: number };
  return row.total;
}

export interface RunEventRow {
  id: number;
  runId: number;
  event: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function recordRunEvent(
  runId: number,
  event: string,
  metadata?: Record<string, unknown>,
): void {
  getDb('readwrite')
    .prepare(`INSERT INTO run_events (run_id, event, metadata) VALUES (?, ?, ?)`)
    .run(runId, event, metadata ? JSON.stringify(metadata) : null);
}

export function listRunEvents(runId: number): RunEventRow[] {
  if (!hasDbFile()) return [];
  const rows = getDb('readonly')
    .prepare(
      `SELECT id, run_id AS runId, event, metadata, created_at AS createdAt
       FROM run_events
       WHERE run_id = ?
       ORDER BY id ASC`,
    )
    .all(runId) as (Omit<RunEventRow, 'metadata'> & { metadata: string | null })[];
  return rows.map((row) => ({
    ...row,
    metadata: row.metadata ? safeJsonParse(row.metadata) : null,
  }));
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch (error) {
    logCaughtError('db/repo.safeJsonParse', error);
    return null;
  }
}

export interface StatsRunRow {
  id: number;
  repoId: string;
  projectId?: string | null;
  integrityIssue?: string;
  featureId: string;
  tool: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  contextWindowTokens?: number | null;
  contextWindowPercent?: number | null;
}

export interface StatsFilters {
  sinceDays?: number;
  repoId?: string;
  projectId?: string;
  tool?: string;
}

export function listRunsForStats(filters: StatsFilters = {}): StatsRunRow[] {
  if (!hasDbFile()) return [];
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filters.sinceDays !== undefined) {
    clauses.push(`r.started_at >= datetime('now', '-' || ? || ' days')`);
    params.push(filters.sinceDays);
  }
  if (filters.repoId) {
    clauses.push('r.repo_id = ?');
    params.push(filters.repoId);
  }
  if (filters.projectId) {
    clauses.push('r.project_id = ?');
    params.push(filters.projectId);
  }
  if (filters.tool) {
    clauses.push('r.tool = ?');
    params.push(filters.tool);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb('readonly')
    .prepare(
      `WITH latest_usage AS (
         SELECT u.run_id AS runId, u.input, u.cached_input AS cachedInput, u.output, u.total
         FROM token_usage u
         JOIN (
           SELECT run_id, MAX(id) AS id
           FROM token_usage
           GROUP BY run_id
         ) latest_token_usage ON latest_token_usage.id = u.id
       )
       SELECT
         r.id,
         r.repo_id AS repoId,
         r.project_id AS projectId,
         r.feature_id AS featureId,
         r.tool,
         r.status,
         r.started_at AS startedAt,
         r.ended_at AS endedAt,
         COALESCE(r.input_tokens, lu.input) AS inputTokens,
         COALESCE(r.cached_input_tokens, lu.cachedInput) AS cachedInputTokens,
         COALESCE(r.output_tokens, lu.output) AS outputTokens,
         COALESCE(r.total_tokens, lu.total) AS totalTokens,
         r.context_window_tokens AS contextWindowTokens,
         r.context_window_percent AS contextWindowPercent
       FROM runs r
       LEFT JOIN latest_usage lu ON lu.runId = r.id
       ${where}
       ORDER BY r.id DESC`,
    )
    .all(...params) as StatsRunRow[];
  for (const row of rows) if (!row.projectId) row.integrityIssue = 'Run has no Project snapshot.';
  return rows;
}

// F34 item 5c: historical average/median total_tokens among completed runs
// with the same tool, used by FeaturePreview as a rough cost estimate before
// starting a feature. The `runs` table does not track model/effort per run,
// so this is intentionally scoped to `tool` only — callers must surface that
// limitation to the user rather than presenting it as an exact match.
export function getHistoricalTokenStatsForFeatureProfile(
  tool: string,
): { sampleSize: number; avgTotalTokens: number | null; medianTotalTokens: number | null } {
  if (!hasDbFile()) return { sampleSize: 0, avgTotalTokens: null, medianTotalTokens: null };
  const rows = getDb('readonly')
    .prepare(
      `WITH latest_usage AS (
         SELECT u.run_id AS runId, u.total
         FROM token_usage u
         JOIN (
           SELECT run_id, MAX(id) AS id
           FROM token_usage
           GROUP BY run_id
         ) latest_token_usage ON latest_token_usage.id = u.id
       )
       SELECT COALESCE(r.total_tokens, lu.total) AS totalTokens
       FROM runs r
       LEFT JOIN latest_usage lu ON lu.runId = r.id
       WHERE r.tool = ? AND r.status = 'done'`,
    )
    .all(tool) as { totalTokens: number | null }[];
  const values = rows
    .map((row) => row.totalTokens)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  if (values.length === 0) return { sampleSize: 0, avgTotalTokens: null, medianTotalTokens: null };
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 === 0
    ? ((values[mid - 1] ?? 0) + (values[mid] ?? 0)) / 2
    : (values[mid] ?? 0);
  return {
    sampleSize: values.length,
    avgTotalTokens: Math.round(avg),
    medianTotalTokens: Math.round(median),
  };
}

export interface TaskRun {
  id: number;
  runId: number;
  taskId: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'blocked';
  stage: string | null;
  startedAt: string | null;
  endedAt: string | null;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextWindowTokens?: number | null;
  contextWindowPercent?: number | null;
}

export function upsertTaskRun(
  runId: number,
  taskId: string,
  title: string,
  status: TaskRun['status'],
  stage?: string,
  startedAt?: string,
  endedAt?: string,
): void {
  const db = getDb('readwrite');
  db.prepare(
    `INSERT INTO task_runs (run_id, task_id, title, status, stage, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  ).run(runId, taskId, title, status, stage ?? null, startedAt ?? null, endedAt ?? null);
  db.prepare(
    `UPDATE task_runs
     SET status = ?, stage = COALESCE(?, stage), ended_at = COALESCE(?, ended_at)
     WHERE run_id = ? AND task_id = ?`,
  ).run(status, stage ?? null, endedAt ?? null, runId, taskId);
}

export function listTaskRunsForRun(runId: number): TaskRun[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT id, run_id AS runId, task_id AS taskId, title, status, stage,
              started_at AS startedAt, ended_at AS endedAt,
              input_tokens AS inputTokens,
              cached_input_tokens AS cachedInputTokens,
              output_tokens AS outputTokens,
              total_tokens AS totalTokens,
              context_window_tokens AS contextWindowTokens,
              context_window_percent AS contextWindowPercent
       FROM task_runs
       WHERE run_id = ?
       ORDER BY id ASC`,
    )
    .all(runId) as TaskRun[];
}

interface PreviousUsageSnapshot {
  tool?: Tool;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

function applyTaskUsageDelta(
  db: ReturnType<typeof getDb>,
  runId: number,
  previous: PreviousUsageSnapshot | undefined,
  usage: TokenUsage | TokensUpdateEvent,
  tool?: Tool,
): void {
  const deltaInput = clampUsageDelta(usage.input, previous?.inputTokens);
  const deltaCachedInput = clampUsageDelta(usage.cachedInput ?? 0, previous?.cachedInputTokens);
  const deltaOutput = clampUsageDelta(usage.output, previous?.outputTokens);
  const deltaTotal = clampUsageDelta(usage.total, previous?.totalTokens);

  if (deltaInput === 0 && deltaCachedInput === 0 && deltaOutput === 0 && deltaTotal === 0) {
    return;
  }

  const activeTask = db
    .prepare(
      `SELECT id,
              COALESCE(input_tokens, 0) AS inputTokens,
              COALESCE(cached_input_tokens, 0) AS cachedInputTokens,
              COALESCE(output_tokens, 0) AS outputTokens,
              COALESCE(total_tokens, 0) AS totalTokens
       FROM task_runs
       WHERE run_id = ? AND status = 'running'
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(runId) as {
      id: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      totalTokens: number;
    } | undefined;

  if (!activeTask) return;

  const nextTotal = activeTask.totalTokens + deltaTotal;
  const contextWindowTokens = tool ? resolveContextWindow({ tool }) : null;
  const contextWindowPercent = contextWindowTokens
    ? computeContextWindowPercent(nextTotal, contextWindowTokens)
    : null;

  db.prepare(
    `UPDATE task_runs
     SET input_tokens = COALESCE(input_tokens, 0) + ?,
         cached_input_tokens = COALESCE(cached_input_tokens, 0) + ?,
         output_tokens = COALESCE(output_tokens, 0) + ?,
         total_tokens = COALESCE(total_tokens, 0) + ?,
         context_window_tokens = COALESCE(?, context_window_tokens),
         context_window_percent = COALESCE(?, context_window_percent)
     WHERE id = ?`,
  ).run(
    deltaInput,
    deltaCachedInput,
    deltaOutput,
    deltaTotal,
    contextWindowTokens,
    contextWindowPercent,
    activeTask.id,
  );
}

function clampUsageDelta(next: number, previous: number | undefined): number {
  return Math.max(0, next - (previous ?? 0));
}

function computeContextWindowPercent(totalTokens: number, contextWindowTokens: number): number {
  if (contextWindowTokens <= 0) return 0;
  return Math.round(((totalTokens / contextWindowTokens) * 100) * 10) / 10;
}

// C3 (folded into F24 — task & stage progress): cross-run view of tasks
// currently running, so the main dashboard can surface in-progress task
// titles without requiring the user to first open a specific run's detail
// screen (listTaskRunsForRun above is scoped to a single runId).
export interface RunningTaskSummary {
  runId: number;
  featureId: string;
  taskId: string;
  title: string;
  stage: string | null;
  startedAt: string | null;
}

export function listRunningTaskRuns(limit = 20): RunningTaskSummary[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT t.run_id AS runId, r.feature_id AS featureId, t.task_id AS taskId,
              t.title, t.stage, t.started_at AS startedAt
       FROM task_runs t
       JOIN runs r ON r.id = t.run_id
       WHERE t.status = 'running'
       ORDER BY t.started_at DESC, t.id DESC
       LIMIT ?`,
    )
    .all(limit) as RunningTaskSummary[];
}

function hasDbFile(): boolean {
  return getResolvedDbPathExists();
}

function getResolvedDbPathExists(): boolean {
  const dbPath = resolveDbPath();
  return dbPath === ':memory:' || existsSync(dbPath);
}

export interface PipelineRow {
  id: number;
  repoId: string;
  featureId: string;
  status: PipelineStatus;
  cwd: string | null;
  currentStage: string | null;
  autoAdvance: number;
  planJson: string;
  doneJson: string;
  pendingJson: string;
  activeJson: string;
  abortedJson: string;
  workflowSnapshotJson?: string;
  requestedAbortFeatureId: string | null;
  resumeCount: number;
  resumeSummary: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export type StageRequestKind = 'approval' | 'input';
export type StageApprovalResponse = 'advance' | 'hold' | 'retry';

export interface StageRequestRow {
  id: number;
  pipelineId: number;
  runId: number | null;
  featureId: string;
  repoId?: string | null;
  projectId?: string | null;
  integrityIssue?: string;
  stage: string;
  kind: StageRequestKind;
  prompt: string;
  options?: string[] | null;
  status: 'pending' | 'resolved';
  response: string | null;
  source: 'manual' | 'auto';
  createdAt: string;
  resolvedAt: string | null;
}

export interface StageTransitionDecisionRow extends StageTransitionDecision {
  id: number;
  createdAt: string;
}

export function getRunContextTelemetry(runId: number): SessionContextTelemetrySnapshot {
  const row = getDb('readonly')
    .prepare(
      `SELECT id AS runId, stage, context_window_percent AS contextWindowPercent
       FROM runs
       WHERE id = ?`,
    )
    .get(runId) as {
      runId: number;
      stage: string | null;
      contextWindowPercent: number | null;
    } | undefined;

  return {
    runId,
    stage: row?.stage ?? null,
    contextWindowPercent: row?.contextWindowPercent ?? null,
    reliable: typeof row?.contextWindowPercent === 'number' && Number.isFinite(row.contextWindowPercent) && row.contextWindowPercent >= 0,
  };
}

export function createStageTransitionDecision(
  decision: StageTransitionDecision,
): number {
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO stage_transition_decisions
         (pipeline_id, feature_id, from_run_id, from_stage, to_stage, policy_mode, decision, reason, context_window_percent, previous_session_id, next_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      decision.pipelineId,
      decision.featureId,
      decision.fromRunId,
      decision.fromStage,
      decision.toStage,
      decision.policyMode,
      decision.decision,
      decision.reason,
      decision.contextWindowPercent,
      decision.previousSessionId,
      decision.nextSessionId,
    );
  return Number(info.lastInsertRowid);
}

export function updateStageTransitionDecisionNextSessionId(
  id: number,
  nextSessionId: string | null,
): void {
  getDb('readwrite')
    .prepare(
      `UPDATE stage_transition_decisions
       SET next_session_id = ?
       WHERE id = ?`,
    )
    .run(nextSessionId, id);
}

export function listStageTransitionDecisions(
  pipelineId: number,
  featureId?: string,
): StageTransitionDecisionRow[] {
  if (!hasDbFile()) return [];
  const sql = featureId
    ? `SELECT id,
              pipeline_id AS pipelineId,
              feature_id AS featureId,
              from_run_id AS fromRunId,
              from_stage AS fromStage,
              to_stage AS toStage,
              policy_mode AS policyMode,
              decision,
              reason,
              context_window_percent AS contextWindowPercent,
              previous_session_id AS previousSessionId,
              next_session_id AS nextSessionId,
              created_at AS createdAt
       FROM stage_transition_decisions
       WHERE pipeline_id = ? AND feature_id = ?
       ORDER BY id ASC`
    : `SELECT id,
              pipeline_id AS pipelineId,
              feature_id AS featureId,
              from_run_id AS fromRunId,
              from_stage AS fromStage,
              to_stage AS toStage,
              policy_mode AS policyMode,
              decision,
              reason,
              context_window_percent AS contextWindowPercent,
              previous_session_id AS previousSessionId,
              next_session_id AS nextSessionId,
              created_at AS createdAt
       FROM stage_transition_decisions
       WHERE pipeline_id = ?
       ORDER BY id ASC`;

  return featureId
    ? getDb('readonly').prepare(sql).all(pipelineId, featureId) as StageTransitionDecisionRow[]
    : getDb('readonly').prepare(sql).all(pipelineId) as StageTransitionDecisionRow[];
}

export function createPipeline(
  repoId: string,
  featureId: string,
  autoAdvance: boolean,
  opts: {
    cwd?: string;
    snapshot?: PipelineSnapshot;
    resumeSummary?: string;
  } = {},
): number {
  const snapshot = opts.snapshot ?? {
    plan: [],
    done: [],
    pending: [],
    active: [],
    aborted: [],
  };
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO pipelines
         (repo_id, project_id, feature_id, auto_advance, cwd, plan_json, done_json, pending_json, active_json, aborted_json, workflow_snapshot_json, resume_summary)
       VALUES (?, (SELECT project_id FROM project_repos WHERE repo_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      repoId,
      repoId,
      featureId,
      autoAdvance ? 1 : 0,
      opts.cwd ?? null,
      encodeJson(snapshot.plan),
      encodeJson(snapshot.done),
      encodeJson(snapshot.pending),
      encodeJson(snapshot.active),
      encodeJson(snapshot.aborted),
      JSON.stringify(snapshot.workflowRevisions ?? {}),
      opts.resumeSummary ?? summarizeSnapshot(snapshot),
    );
  return Number(info.lastInsertRowid);
}

export function updatePipelineStage(pipelineId: number, stage: string): void {
  getDb('readwrite')
    .prepare(
      `UPDATE pipelines
       SET current_stage = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(stage, pipelineId);
}

export function finishPipeline(
  pipelineId: number,
  status: PipelineStatus,
): void {
  getDb('readwrite')
    .prepare(
      `UPDATE pipelines
       SET status = ?, updated_at = datetime('now'), ended_at = datetime('now')
       WHERE id = ?`,
    )
    .run(status, pipelineId);
}

export function setPipelineStatus(
  pipelineId: number,
  status: PipelineStatus,
  opts: { ended?: boolean; clearAbortRequest?: boolean } = {},
): void {
  const endedAt = opts.ended ? `datetime('now')` : 'NULL';
  getDb('readwrite')
    .prepare(
      `UPDATE pipelines
       SET status = ?,
           updated_at = datetime('now'),
           ended_at = ${endedAt},
           requested_abort_feature_id = CASE WHEN ? THEN NULL ELSE requested_abort_feature_id END
       WHERE id = ?`,
    )
    .run(status, opts.clearAbortRequest ? 1 : 0, pipelineId);
}

export function pausePipeline(pipelineId: number): void {
  setPipelineStatus(pipelineId, 'paused');
}

export function abortPipeline(pipelineId: number): void {
  setPipelineStatus(pipelineId, 'aborting');
}

export function requestFeatureAbort(pipelineId: number, featureId: string): void {
  getDb('readwrite')
    .prepare(
      `UPDATE pipelines
       SET status = 'paused',
           requested_abort_feature_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(featureId, pipelineId);
}

export function resumePipeline(pipelineId: number): void {
  const row = getPipeline(pipelineId);
  if (!row) return;
  const snapshot = getPipelineSnapshot(row);
  const rerunnable = uniquePreserveOrder([
    ...snapshot.pending,
    ...snapshot.active,
    ...snapshot.aborted,
  ], snapshot.plan);
  updatePipelineSnapshot(pipelineId, {
    pending: rerunnable,
    active: [],
    aborted: [],
  }, {
    status: 'running',
    ended: false,
    clearAbortRequest: true,
    resumeCount: row.resumeCount + 1,
  });
}

export function updatePipelineSnapshot(
  pipelineId: number,
  patch: Partial<PipelineSnapshot>,
  opts: {
    status?: PipelineStatus;
    ended?: boolean;
    clearAbortRequest?: boolean;
    requestedAbortFeatureId?: string | null;
    resumeCount?: number;
    resumeSummary?: string | null;
  } = {},
): void {
  const row = getPipeline(pipelineId);
  if (!row) return;
  const snapshot = {
    ...getPipelineSnapshot(row),
    ...patch,
  };
  const status = opts.status ?? row.status;
  const endedAt = opts.ended ? `datetime('now')` : 'NULL';
  getDb('readwrite')
    .prepare(
      `UPDATE pipelines
       SET status = ?,
           plan_json = ?,
           done_json = ?,
           pending_json = ?,
           active_json = ?,
           aborted_json = ?,
           workflow_snapshot_json = ?,
           resume_summary = ?,
           requested_abort_feature_id = ?,
           resume_count = ?,
           updated_at = datetime('now'),
           ended_at = ${endedAt}
       WHERE id = ?`,
    )
    .run(
      status,
      encodeJson(snapshot.plan),
      encodeJson(snapshot.done),
      encodeJson(snapshot.pending),
      encodeJson(snapshot.active),
      encodeJson(snapshot.aborted),
      JSON.stringify(snapshot.workflowRevisions ?? {}),
      opts.resumeSummary ?? summarizeSnapshot(snapshot),
      opts.clearAbortRequest ? null : (opts.requestedAbortFeatureId ?? row.requestedAbortFeatureId),
      opts.resumeCount ?? row.resumeCount,
      pipelineId,
    );
}

export function getPipeline(id: number): PipelineRow | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly')
    .prepare(
      `SELECT
         id,
         repo_id AS repoId,
         feature_id AS featureId,
         status,
         cwd,
         current_stage AS currentStage,
         auto_advance AS autoAdvance,
         plan_json AS planJson,
         done_json AS doneJson,
         pending_json AS pendingJson,
         active_json AS activeJson,
         aborted_json AS abortedJson,
         workflow_snapshot_json AS workflowSnapshotJson,
         requested_abort_feature_id AS requestedAbortFeatureId,
         resume_count AS resumeCount,
         resume_summary AS resumeSummary,
         created_at AS createdAt,
         updated_at AS updatedAt,
         ended_at AS endedAt
       FROM pipelines
       WHERE id = ?`,
    )
    .get(id) as PipelineRow | undefined) ?? null;
}

export function listResumablePipelines(): PipelineRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT
         id,
         repo_id AS repoId,
         feature_id AS featureId,
         status,
         cwd,
         current_stage AS currentStage,
         auto_advance AS autoAdvance,
         plan_json AS planJson,
         done_json AS doneJson,
         pending_json AS pendingJson,
         active_json AS activeJson,
         aborted_json AS abortedJson,
         workflow_snapshot_json AS workflowSnapshotJson,
         requested_abort_feature_id AS requestedAbortFeatureId,
         resume_count AS resumeCount,
         resume_summary AS resumeSummary,
         created_at AS createdAt,
         updated_at AS updatedAt,
         ended_at AS endedAt
       FROM pipelines
       WHERE status IN ('paused', 'aborted', 'failed', 'blocked')
          OR json_array_length(pending_json) > 0
          OR json_array_length(aborted_json) > 0
       ORDER BY id DESC`,
    )
    .all() as PipelineRow[];
}

export function findResumablePipeline(target: string): PipelineRow | null {
  const numeric = Number(target);
  const resumable = listResumablePipelines();
  if (Number.isInteger(numeric)) {
    const byPipeline = resumable.find((row) => row.id === numeric);
    if (byPipeline) return byPipeline;
    const run = listRuns(500).find((row) => row.id === numeric || row.feature_id === target || row.repo_id === target);
    if (run?.pipeline_id) {
      return resumable.find((row) => row.id === run.pipeline_id) ?? getPipeline(run.pipeline_id);
    }
  }
  return resumable.find((row) => row.featureId === target || row.repoId === target) ?? null;
}

export function getPipelineSnapshot(row: PipelineRow): PipelineSnapshot {
  return {
    plan: decodeJsonArray(row.planJson),
    done: decodeJsonArray(row.doneJson),
    pending: decodeJsonArray(row.pendingJson),
    active: decodeJsonArray(row.activeJson),
    aborted: decodeJsonArray(row.abortedJson),
    workflowRevisions: decodeWorkflowRevisions(row.workflowSnapshotJson),
  };
}

function decodeWorkflowRevisions(json: string | undefined): PipelineWorkflowRevisions {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, revision]) => (
        typeof revision === 'object'
        && revision !== null
        && !Array.isArray(revision)
        && Array.isArray(Reflect.get(revision, 'stages'))
      )),
    );
  } catch (error) {
    logCaughtError('db/repo.parseStageRevisions', error);
    return {};
  }
}

export function createStageRequest(
  pipelineId: number,
  featureId: string,
  stage: string,
  kind: StageRequestKind,
  prompt: string,
  opts: {
    runId?: number;
    response?: string;
    source?: 'manual' | 'auto';
    approvalChannel?: string;
    options?: string[];
  } = {},
): number {
  const status = opts.response ? 'resolved' : 'pending';
  const optionsJson = opts.options && opts.options.length > 0 ? JSON.stringify(opts.options) : null;
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO stage_requests
         (pipeline_id, run_id, feature_id, stage, kind, prompt, options, status, response, source, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      pipelineId,
      opts.runId ?? null,
      featureId,
      stage,
      kind,
      prompt,
      optionsJson,
      status,
      opts.response ?? null,
      opts.source ?? 'manual',
      opts.response ? new Date().toISOString() : null,
    );
  const requestId = Number(info.lastInsertRowid);
  msqEventBus.emit('stage:request-created', {
    requestId,
    pipelineId,
    featureId,
    stage,
    kind,
    prompt,
    source: opts.source ?? 'manual',
    approvalChannel: opts.approvalChannel,
    options: opts.options,
  });
  return requestId;
}

export function resolveStageRequest(id: number, response: string): void {
  const row = getStageRequest(id);
  getDb('readwrite')
    .prepare(
      `UPDATE stage_requests
       SET status = 'resolved',
           response = ?,
           resolved_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .run(response, id);
  if (row?.status === 'pending') {
    msqEventBus.emit('stage:request-resolved', {
      requestId: id,
      kind: row.kind,
      response,
    });
  }
}

function decodeStageRequestOptions(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const options = parsed.filter((entry): entry is string => typeof entry === 'string');
    return options.length > 0 ? options : undefined;
  } catch (error) {
    logCaughtError('db/repo.decodeStageRequestOptions', error);
    return undefined;
  }
}

export function getStageRequest(id: number): StageRequestRow | null {
  if (!hasDbFile()) return null;
  const row = (getDb('readonly')
    .prepare(
      `SELECT
         id,
         pipeline_id AS pipelineId,
         run_id AS runId,
         feature_id AS featureId,
         stage,
         kind,
         prompt,
         options,
         status,
         response,
         source,
         created_at AS createdAt,
         resolved_at AS resolvedAt
       FROM stage_requests
       WHERE id = ?`,
    )
    .get(id) as StageRequestRow | undefined) ?? null;
  if (row) row.options = decodeStageRequestOptions(row.options);
  return row;
}

export function listPendingStageRequests(scope: ProjectScope = {}): StageRequestRow[] {
  if (!hasDbFile()) return [];
  const rows = getDb('readonly')
    .prepare(
      `SELECT
         sr.id, sr.pipeline_id AS pipelineId, sr.run_id AS runId, sr.feature_id AS featureId,
         p.repo_id AS repoId, p.project_id AS projectId, sr.stage, sr.kind, sr.prompt, sr.options,
         sr.status, sr.response, sr.source, sr.created_at AS createdAt, sr.resolved_at AS resolvedAt
       FROM stage_requests sr
       LEFT JOIN pipelines p ON p.id = sr.pipeline_id
       WHERE sr.status = 'pending'${scope.projectId ? ' AND p.project_id = ?' : ''}
       ORDER BY sr.id ASC`,
    )
    .all(...(scope.projectId ? [scope.projectId] : [])) as StageRequestRow[];
  for (const row of rows) {
    row.options = decodeStageRequestOptions(row.options);
    if (!row.repoId || !row.projectId) row.integrityIssue = 'Stage request has no resolvable repository or Project snapshot.';
  }
  return rows;
}

export function listStageRequestsForFeature(
  pipelineId: number,
  featureId: string,
): StageRequestRow[] {
  if (!hasDbFile()) return [];
  const rows = getDb('readonly')
    .prepare(
      `SELECT
         id,
         pipeline_id AS pipelineId,
         run_id AS runId,
         feature_id AS featureId,
         stage,
         kind,
         prompt,
         options,
         status,
         response,
         source,
         created_at AS createdAt,
         resolved_at AS resolvedAt
       FROM stage_requests
       WHERE pipeline_id = ? AND feature_id = ?
       ORDER BY id ASC`,
    )
    .all(pipelineId, featureId) as StageRequestRow[];
  for (const row of rows) row.options = decodeStageRequestOptions(row.options);
  return rows;
}

export type TimeoutOccurrenceStatus = 'pending' | 'resolved' | 'cancelled' | 'superseded';
export type TimeoutApprovalStatus = 'pending' | 'approved' | 'blocked' | 'cancelled' | 'superseded';
export type TimeoutDecision = 'retry' | 'keep_blocked';
export type TimeoutDecisionSource = 'telegram' | 'system' | 'resume';

export interface TimeoutOccurrenceInput {
  runId: number;
  pipelineId?: number | null;
  featureId: string;
  stage?: string | null;
  timeoutMs: number;
  runtimeMs: number;
  lastProgress?: string | null;
}

export interface TimeoutOccurrenceRow extends TimeoutOccurrenceInput {
  id: number;
  status: TimeoutOccurrenceStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface TimeoutApprovalRequestRow {
  id: number;
  timeoutOccurrenceId: number;
  pipelineId: number | null;
  runId: number;
  featureId: string;
  stage: string | null;
  status: TimeoutApprovalStatus;
  decision: TimeoutDecision | null;
  decisionSource: TimeoutDecisionSource | null;
  notificationStatus: 'pending' | 'sent' | 'failed';
  notificationAttempts: number;
  lastNotificationError: string | null;
  notifiedAt: string | null;
  retryRunId: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

function mapTimeoutOccurrence(row: Record<string, unknown> | undefined): TimeoutOccurrenceRow | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    runId: Number(row.runId),
    pipelineId: row.pipelineId === null || row.pipelineId === undefined ? null : Number(row.pipelineId),
    featureId: String(row.featureId),
    stage: typeof row.stage === 'string' ? row.stage : null,
    timeoutMs: Number(row.timeoutMs),
    runtimeMs: Number(row.runtimeMs),
    lastProgress: typeof row.lastProgress === 'string' ? row.lastProgress : null,
    status: row.status as TimeoutOccurrenceStatus,
    createdAt: String(row.createdAt),
    resolvedAt: typeof row.resolvedAt === 'string' ? row.resolvedAt : null,
  };
}

function mapTimeoutApprovalRequest(row: Record<string, unknown> | undefined): TimeoutApprovalRequestRow | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    timeoutOccurrenceId: Number(row.timeoutOccurrenceId),
    pipelineId: row.pipelineId === null || row.pipelineId === undefined ? null : Number(row.pipelineId),
    runId: Number(row.runId),
    featureId: String(row.featureId),
    stage: typeof row.stage === 'string' ? row.stage : null,
    status: row.status as TimeoutApprovalStatus,
    decision: row.decision === 'retry' || row.decision === 'keep_blocked' ? row.decision : null,
    decisionSource: row.decisionSource === 'telegram' || row.decisionSource === 'system' || row.decisionSource === 'resume'
      ? row.decisionSource
      : null,
    notificationStatus: row.notificationStatus as 'pending' | 'sent' | 'failed',
    notificationAttempts: Number(row.notificationAttempts ?? 0),
    lastNotificationError: typeof row.lastNotificationError === 'string' ? row.lastNotificationError : null,
    notifiedAt: typeof row.notifiedAt === 'string' ? row.notifiedAt : null,
    retryRunId: row.retryRunId === null || row.retryRunId === undefined ? null : Number(row.retryRunId),
    createdAt: String(row.createdAt),
    resolvedAt: typeof row.resolvedAt === 'string' ? row.resolvedAt : null,
  };
}

const TIMEOUT_OCCURRENCE_SELECT = `
  SELECT id, run_id AS runId, pipeline_id AS pipelineId, feature_id AS featureId,
         stage, timeout_ms AS timeoutMs, runtime_ms AS runtimeMs,
         last_progress AS lastProgress, status, created_at AS createdAt,
         resolved_at AS resolvedAt
    FROM timeout_occurrences`;

const TIMEOUT_REQUEST_SELECT = `
  SELECT id, timeout_occurrence_id AS timeoutOccurrenceId,
         pipeline_id AS pipelineId, run_id AS runId, feature_id AS featureId,
         stage, status, decision, decision_source AS decisionSource,
         notification_status AS notificationStatus,
         notification_attempts AS notificationAttempts,
         last_notification_error AS lastNotificationError,
         notified_at AS notifiedAt, retry_run_id AS retryRunId,
         created_at AS createdAt, resolved_at AS resolvedAt
    FROM timeout_approval_requests`;

export function createTimeoutOccurrence(input: TimeoutOccurrenceInput): TimeoutOccurrenceRow | null {
  return withTransaction((database) => {
    const run = database.prepare(`SELECT status FROM runs WHERE id = ?`).get(input.runId) as { status?: string } | undefined;
    if (!run || ['done', 'failed', 'aborted'].includes(run.status ?? '')) return null;
    database.prepare(`
      INSERT OR IGNORE INTO timeout_occurrences
        (run_id, pipeline_id, feature_id, stage, timeout_ms, runtime_ms, last_progress)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.runId, input.pipelineId ?? null, input.featureId, input.stage ?? null,
      input.timeoutMs, input.runtimeMs, input.lastProgress ?? null,
    );
    return mapTimeoutOccurrence(database.prepare(`${TIMEOUT_OCCURRENCE_SELECT} WHERE run_id = ?`).get(input.runId) as Record<string, unknown> | undefined);
  });
}

export function getTimeoutOccurrence(id: number): TimeoutOccurrenceRow | null {
  if (!hasDbFile()) return null;
  return mapTimeoutOccurrence(getDb('readonly').prepare(`${TIMEOUT_OCCURRENCE_SELECT} WHERE id = ?`).get(id) as Record<string, unknown> | undefined);
}

export function createTimeoutApprovalRequest(occurrenceId: number): TimeoutApprovalRequestRow | null {
  return withTransaction((database) => {
    const occurrence = mapTimeoutOccurrence(database.prepare(`${TIMEOUT_OCCURRENCE_SELECT} WHERE id = ?`).get(occurrenceId) as Record<string, unknown> | undefined);
    if (!occurrence) return null;
    database.prepare(`
      INSERT OR IGNORE INTO timeout_approval_requests
        (timeout_occurrence_id, pipeline_id, run_id, feature_id, stage)
      VALUES (?, ?, ?, ?, ?)
    `).run(occurrence.id, occurrence.pipelineId, occurrence.runId, occurrence.featureId, occurrence.stage);
    return mapTimeoutApprovalRequest(database.prepare(`${TIMEOUT_REQUEST_SELECT} WHERE timeout_occurrence_id = ?`).get(occurrenceId) as Record<string, unknown> | undefined);
  });
}

export function getTimeoutApprovalRequest(id: number): TimeoutApprovalRequestRow | null {
  if (!hasDbFile()) return null;
  return mapTimeoutApprovalRequest(getDb('readonly').prepare(`${TIMEOUT_REQUEST_SELECT} WHERE id = ?`).get(id) as Record<string, unknown> | undefined);
}

export function listPendingTimeoutApprovalRequests(): TimeoutApprovalRequestRow[] {
  if (!hasDbFile()) return [];
  return (getDb('readonly').prepare(`${TIMEOUT_REQUEST_SELECT} WHERE status = 'pending' ORDER BY id ASC`).all() as Record<string, unknown>[])
    .map((row) => mapTimeoutApprovalRequest(row))
    .filter((row): row is TimeoutApprovalRequestRow => row !== null);
}

export function getApprovedTimeoutApproval(
  pipelineId: number,
  featureId: string,
  stage?: string,
): TimeoutApprovalRequestRow | null {
  if (!hasDbFile()) return null;
  return mapTimeoutApprovalRequest(getDb('readonly').prepare(
    `${TIMEOUT_REQUEST_SELECT} WHERE pipeline_id = ? AND feature_id = ? AND status = 'approved' AND stage IS ? ORDER BY id ASC LIMIT 1`,
  ).get(pipelineId, featureId, stage ?? null) as Record<string, unknown> | undefined);
}

export interface TimeoutApprovalContext {
  featureId: string;
  runId: number;
  stage?: string | null;
  chatId?: string;
  threadId?: number;
}

export function resolveTimeoutApproval(
  requestId: number,
  decision: TimeoutDecision,
  context: TimeoutApprovalContext,
): boolean {
  const resolved = withTransaction((database) => {
    const request = mapTimeoutApprovalRequest(database.prepare(`${TIMEOUT_REQUEST_SELECT} WHERE id = ?`).get(requestId) as Record<string, unknown> | undefined);
    if (!request) return false;
    if (request.status !== 'pending' || request.featureId !== context.featureId || request.runId !== context.runId) return false;
    if ((request.stage ?? null) !== (context.stage ?? null)) return false;
    if (context.chatId !== undefined && context.threadId !== undefined) {
      const association = database.prepare(`SELECT state, thread_id AS threadId FROM feature_topic_associations WHERE chat_id = ? AND feature_id = ?`).get(context.chatId, context.featureId) as { state?: string; threadId?: number } | undefined;
      if ((association?.state ?? null) !== 'active' || (association?.threadId ?? null) !== context.threadId) return false;
    }
    const result = database.prepare(`
      UPDATE timeout_approval_requests
         SET status = ?, decision = ?, decision_source = 'telegram', resolved_at = datetime('now')
       WHERE id = ? AND status = 'pending'
    `).run(decision === 'retry' ? 'approved' : 'blocked', decision, requestId);
    if (result.changes !== 1) return false;
    database.prepare(`
      INSERT INTO recovery_decisions
        (timeout_occurrence_id, approval_request_id, decision, source)
      VALUES (?, ?, ?, 'telegram')
    `).run(request.timeoutOccurrenceId, request.id, decision);
    database.prepare(`UPDATE timeout_occurrences SET status = 'resolved', resolved_at = datetime('now') WHERE id = ? AND status = 'pending'`).run(request.timeoutOccurrenceId);
    return true;
  });
  if (resolved) {
    const request = getTimeoutApprovalRequest(requestId);
    const occurrence = request ? getTimeoutOccurrence(request.timeoutOccurrenceId) : null;
    if (request && occurrence) {
      msqEventBus.emit('timeout:approval-resolved', {
        requestId,
        occurrenceId: occurrence.id,
        runId: request.runId,
        featureId: request.featureId,
        ...(request.stage ? { stage: request.stage } : {}),
        decision,
        source: 'telegram',
      });
    }
  }
  return resolved;
}

export function claimTimeoutRetry(requestId: number): boolean {
  return getDb('readwrite').prepare(`UPDATE timeout_approval_requests SET retry_claimed = 1 WHERE id = ? AND status = 'approved' AND retry_run_id IS NULL AND retry_claimed = 0`).run(requestId).changes === 1;
}

export function attachTimeoutRetryRun(requestId: number, retryRunId: number): void {
  withTransaction((database) => {
    database.prepare(`UPDATE timeout_approval_requests SET retry_run_id = ? WHERE id = ? AND status = 'approved' AND retry_claimed = 1 AND retry_run_id IS NULL`).run(retryRunId, requestId);
    database.prepare(`UPDATE recovery_decisions SET retry_run_id = ? WHERE approval_request_id = ? AND retry_run_id IS NULL`).run(retryRunId, requestId);
  });
}

export function recordTimeoutNotificationDelivery(
  requestId: number,
  result: { status: 'sent' | 'failed'; error?: string },
): void {
  getDb('readwrite').prepare(`
    UPDATE timeout_approval_requests
       SET notification_status = ?, notification_attempts = notification_attempts + 1,
           last_notification_error = ?, notified_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE notified_at END
     WHERE id = ?
  `).run(result.status, result.error ?? null, result.status, requestId);
}

function encodeJson(value: string[]): string {
  return JSON.stringify(value);
}

function decodeJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch (error) {
    logCaughtError('db/repo.decodeJsonArray', error);
    return [];
  }
}

function uniquePreserveOrder(values: string[], plan: string[]): string[] {
  const seen = new Set<string>();
  const ordered = values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  return plan.filter((featureId) => seen.has(featureId) && ordered.includes(featureId));
}

function summarizeSnapshot(snapshot: PipelineSnapshot): string {
  const total = snapshot.plan.length;
  const done = snapshot.done.length;
  const active = snapshot.active[0];
  const pending = snapshot.pending[0] ?? snapshot.aborted[0] ?? null;
  if (active) return `${String(done)}/${String(total)} done · active ${active}`;
  if (pending) return `${String(done)}/${String(total)} done · next ${pending}`;
  return `${String(done)}/${String(total)} done`;
}

export function loadBudgetState(key: string): number | null {
  if (!hasDbFile()) return null;
  const row = getDb('readonly')
    .prepare(`SELECT tokens FROM budget_state WHERE key = ?`)
    .get(key) as { tokens: number } | undefined;
  return row?.tokens ?? null;
}

export function saveBudgetState(key: string, tokens: number): void {
  getDb('readwrite')
    .prepare(`
      INSERT INTO budget_state (key, tokens) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET tokens = excluded.tokens, updated_at = datetime('now')
    `)
    .run(key, tokens);
}

export function getPausedPipelineIdForBudget(): number | null {
  if (!hasDbFile()) return null;
  const row = getDb('readonly')
    .prepare(`
      SELECT id FROM pipelines
      WHERE status = 'paused'
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}
