import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { getDb } from './index.js';
import { resolveDbPath, resolveRuntimeConfig } from '../config/index.js';
import {
  BudgetSchema,
  createRegisteredToolSchema,
  DefaultsSchema,
  FeatureSchema,
  TaskSchema,
  type BacklogV2,
  type Budget,
  type Defaults,
  type Epic,
  type Feature,
  type Retry,
  type Task,
  type Workflow,
} from '../core/backlog/schema.js';
import type { FeatureRegistrationResult } from '../core/backlog/featureId.js';
import { allocateFeatureId, isCanonicalFeatureId } from '../core/backlog/featureId.js';

export class BacklogCatalogNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BacklogCatalogNotFoundError';
  }
}

/** Same as `Partial<Feature>`, except `workflow`/`retry` accept a partial
 * shape too — callers should be able to patch just `workflow.stages`
 * without also supplying `mode`/`approvals`/`syncTasksToBacklog`. */
export type FeaturePatch = Omit<Partial<Feature>, 'workflow' | 'retry'> & {
  workflow?: Partial<Omit<Workflow, 'approvals' | 'sessionPolicy'>> & {
    approvals?: Partial<Workflow['approvals']>;
    sessionPolicy?: Partial<Workflow['sessionPolicy']>;
  };
  retry?: Partial<Retry>;
};

function validateRegisteredToolReference(tool: string, path: string): void {
  const schema = createRegisteredToolSchema(resolveRuntimeConfig().tools.map((entry) => entry.id));
  const result = schema.safeParse(tool);
  if (!result.success) {
    throw new Error(`Invalid ${path}: ${result.error.issues[0]?.message ?? 'unregistered tool.'}`);
  }
}

/**
 * Readonly access that tolerates a never-initialized DB (e.g. the very first
 * `msq backlog load --dry-run` before any writable command has run yet) by
 * returning null instead of throwing "unable to open database file".
 */
function getReadonlyDbOrNull(): Database.Database | null {
  if (!existsSync(resolveDbPath())) return null;
  return getDb('readonly');
}

export interface BacklogCatalogDiff {
  addedFeatures: string[];
  changedFeatures: string[];
  archivedFeatures: string[];
  unchangedFeatures: string[];
}

export type SeedItemKind = 'catalog' | 'epic' | 'feature' | 'task';
export type SeedItemStatus = 'created' | 'unchanged' | 'conflict' | 'invalid' | 'skipped';

export interface SeedConflictDetail {
  path: string;
  databaseValue: unknown;
  importedValue: unknown;
  suggestedAction: string;
}

export interface SeedPlanItem {
  kind: SeedItemKind;
  id: string;
  status: SeedItemStatus;
  conflict?: SeedConflictDetail;
  reason?: string;
}

export interface BacklogSeedPlan {
  mode: 'seed';
  repoId: string;
  items: SeedPlanItem[];
}

/** Returns every feature ID, including archived rows, because IDs are never reused. */
export function listOccupiedFeatureIds(): Set<string> {
  const db = getReadonlyDbOrNull();
  if (!db) return new Set();
  const rows = db.prepare(`SELECT feature_id FROM backlog_features`).all() as { feature_id: string }[];
  return new Set(rows.map((row) => row.feature_id));
}

/** Finds the repository that owns an ID, including archived historical rows. */
export function getFeatureIdOwner(featureId: string): string | undefined {
  const db = getReadonlyDbOrNull();
  if (!db) return undefined;
  const row = db
    .prepare(`SELECT repo_id FROM backlog_features WHERE feature_id = ? LIMIT 1`)
    .get(featureId) as { repo_id: string } | undefined;
  return row?.repo_id;
}

interface CatalogEpicRow {
  epic_id: string;
  title: string;
  position: number;
  data_json: string;
}

interface CatalogFeatureRow {
  feature_id: string;
  epic_id: string;
  title: string;
  position: number;
  data_json: string;
}

interface CatalogTaskRow {
  task_id: string;
  feature_id: string;
  title: string;
  position: number;
  data_json: string;
}

interface CatalogMetaRow {
  repo: string;
  version: number;
  defaults_json: string;
  budget_json: string | null;
}

export interface CatalogWorkItemRelation {
  featureId: string;
  projectId: string | null;
  repoId: string;
  repoLabel: string;
}

/** Relationship-only projection for catalog clients displaying the global
 * Project/Repository hierarchy. */
export function listCatalogWorkItemRelations(repoId: string): CatalogWorkItemRelation[] {
  const db = getReadonlyDbOrNull();
  if (!db) return [];
  return (db.prepare(`
    SELECT f.feature_id AS featureId, e.project_id AS projectId,
           f.repo_id AS repoId, r.path AS repoPath
      FROM backlog_features f
      JOIN backlog_epics e ON e.epic_id = f.epic_id
      JOIN repos r ON r.repo_id = f.repo_id
     WHERE f.repo_id = ? AND f.archived_at IS NULL AND f.deleted_at IS NULL
  `).all(repoId) as { featureId: string; projectId: string | null; repoId: string; repoPath: string }[])
    .map((row) => ({
      featureId: row.featureId,
      projectId: row.projectId,
      repoId: row.repoId,
      repoLabel: row.repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? row.repoId,
    }));
}

export function getCatalogMeta(repoId: string): CatalogMetaRow | undefined {
  const db = getReadonlyDbOrNull();
  if (!db) return undefined;
  return db
    .prepare(`SELECT repo, version, defaults_json, budget_json FROM backlog_catalog_meta WHERE repo_id = ?`)
    .get(repoId) as CatalogMetaRow | undefined;
}

export function listCatalogEpics(repoId: string): CatalogEpicRow[] {
  const db = getReadonlyDbOrNull();
  if (!db) return [];
  return db
    .prepare(
      `SELECT epic_id, title, position, data_json FROM backlog_epics
       WHERE (repo_id = ? OR project_id = (SELECT project_id FROM project_repos WHERE repo_id = ?))
         AND archived_at IS NULL
       ORDER BY position ASC`,
    )
    .all(repoId, repoId) as CatalogEpicRow[];
}

export function listCatalogFeatures(repoId: string, epicId?: string): CatalogFeatureRow[] {
  const db = getReadonlyDbOrNull();
  if (!db) return [];
  if (epicId) {
    return db
      .prepare(
        `SELECT feature_id, epic_id, title, position, data_json FROM backlog_features
         WHERE repo_id = ? AND epic_id = ? AND archived_at IS NULL
         ORDER BY position ASC`,
      )
      .all(repoId, epicId) as CatalogFeatureRow[];
  }
  return db
    .prepare(
      `SELECT feature_id, epic_id, title, position, data_json FROM backlog_features
       WHERE repo_id = ? AND archived_at IS NULL
       ORDER BY position ASC`,
    )
    .all(repoId) as CatalogFeatureRow[];
}

/** Single-feature readonly lookup, parsed to `Feature`. Used to re-check
 * config (e.g. `workflow.autoAdvance`) mid-run without the caller
 * having to hold a stale copy of `data_json` from when the run started. */
export function getCatalogFeature(repoId: string, featureId: string): Feature | undefined {
  const db = getReadonlyDbOrNull();
  if (!db) return undefined;
  const row = db
    .prepare(
      `SELECT data_json FROM backlog_features WHERE feature_id = ? AND repo_id = ? AND archived_at IS NULL`,
    )
    .get(featureId, repoId) as { data_json: string } | undefined;
  if (!row) return undefined;
  return FeatureSchema.parse(JSON.parse(row.data_json));
}

export function listCatalogTasks(repoId: string, featureId?: string): CatalogTaskRow[] {
  const db = getReadonlyDbOrNull();
  if (!db) return [];
  if (featureId) {
    return db
      .prepare(
        `SELECT task_id, feature_id, title, position, data_json FROM backlog_tasks
         WHERE feature_id = ? AND archived_at IS NULL
         ORDER BY position ASC`,
      )
      .all(featureId) as CatalogTaskRow[];
  }
  return db
    .prepare(
      `SELECT t.task_id, t.feature_id, t.title, t.position, t.data_json FROM backlog_tasks t
       JOIN backlog_features f ON f.feature_id = t.feature_id
       WHERE f.repo_id = ? AND t.archived_at IS NULL
       ORDER BY t.position ASC`,
    )
    .all(repoId) as CatalogTaskRow[];
}

function flattenFeatures(backlog: BacklogV2): { epic: Epic; feature: Feature }[] {
  return backlog.epics.flatMap((epic) => epic.features.map((feature) => ({ epic, feature })));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function firstJsonDifference(databaseValue: unknown, importedValue: unknown, path = '$'): SeedConflictDetail | undefined {
  if (stableJson(databaseValue) === stableJson(importedValue)) return undefined;
  if (Array.isArray(databaseValue) && Array.isArray(importedValue)) {
    const length = Math.max(databaseValue.length, importedValue.length);
    for (let index = 0; index < length; index += 1) {
      const difference = firstJsonDifference(databaseValue[index], importedValue[index], `${path}[${String(index)}]`);
      if (difference) return difference;
    }
  }
  if (databaseValue && importedValue && typeof databaseValue === 'object' && typeof importedValue === 'object'
    && !Array.isArray(databaseValue) && !Array.isArray(importedValue)) {
    const keys = new Set([...Object.keys(databaseValue), ...Object.keys(importedValue)]);
    for (const key of [...keys].sort()) {
      const difference = firstJsonDifference(
        Reflect.get(databaseValue, key),
        Reflect.get(importedValue, key),
        `${path}.${key}`,
      );
      if (difference) return difference;
    }
  }
  return {
    path,
    databaseValue,
    importedValue,
    suggestedAction: 'Mantenha o valor gerenciado no DB ou crie um novo item com outro ID.',
  };
}

function epicComparable(epic: Epic): unknown {
  const { features: _features, ...metadata } = epic;
  return metadata;
}

/**
 * Produces the one authoritative non-destructive import plan used by both
 * `backlog load --dry-run` and its write path. Existing catalog rows are
 * never candidates for update or archival.
 */
export function planBacklogSeed(backlog: BacklogV2, repoId: string): BacklogSeedPlan {
  const db = getReadonlyDbOrNull();
  const items: SeedPlanItem[] = [];
  const existingEpics = new Map(listCatalogEpics(repoId).map((row) => [row.epic_id, JSON.parse(row.data_json) as Epic]));
  const existingFeatures = new Map(listCatalogFeatures(repoId).map((row) => [row.feature_id, FeatureSchema.parse(JSON.parse(row.data_json))]));
  const owners = new Map<string, string>();
  if (db) {
    for (const row of db.prepare(`SELECT feature_id, repo_id FROM backlog_features`).all() as { feature_id: string; repo_id: string }[]) {
      owners.set(row.feature_id, row.repo_id);
    }
  }

  items.push({
    kind: 'catalog',
    id: repoId,
    status: getCatalogMeta(repoId) ? 'skipped' : 'created',
    ...(getCatalogMeta(repoId) ? { reason: 'Project defaults are managed outside seed import.' } : {}),
  });

  for (const epic of backlog.epics) {
    const storedEpic = existingEpics.get(epic.id);
    const conflict = storedEpic && firstJsonDifference(epicComparable(storedEpic), epicComparable(epic));
    items.push({
      kind: 'epic', id: epic.id,
      status: !storedEpic ? 'created' : conflict ? 'conflict' : 'unchanged',
      ...(conflict ? { conflict } : {}),
    });

    for (const feature of epic.features) {
      const owner = owners.get(feature.id);
      const crossRepoDependency = feature.dependsOn.find((dependency) => {
        const dependencyOwner = owners.get(dependency);
        return dependencyOwner !== undefined && dependencyOwner !== repoId;
      });
      if ((owner && owner !== repoId) || crossRepoDependency) {
        items.push({
          kind: 'feature', id: feature.id, status: 'invalid',
          reason: owner && owner !== repoId
            ? `Feature ID belongs to repository "${owner}".`
            : `Dependency "${crossRepoDependency ?? 'unknown'}" belongs to another repository.`,
        });
        continue;
      }
      const storedFeature = existingFeatures.get(feature.id);
      const normalizedFeature = FeatureSchema.parse(feature);
      const featureConflict = storedFeature && firstJsonDifference(storedFeature, normalizedFeature);
      const status: SeedItemStatus = !storedFeature ? 'created' : featureConflict ? 'conflict' : 'unchanged';
      items.push({ kind: 'feature', id: feature.id, status, ...(featureConflict ? { conflict: featureConflict } : {}) });
      for (const task of feature.tasks) {
        items.push({
          kind: 'task', id: `${feature.id}/${task.id}`,
          status: status === 'created' ? 'created' : status === 'unchanged' ? 'unchanged' : 'skipped',
          ...(status === 'conflict' ? { reason: `Feature "${feature.id}" has a conflict and its tasks are not mutable by seed.` } : {}),
        });
      }
    }
  }
  return { mode: 'seed', repoId, items };
}

/** Applies only the `created` entries of a seed plan in one SQLite transaction. */
export function applyBacklogSeed(backlog: BacklogV2, plan: BacklogSeedPlan): void {
  const db = getDb('readwrite');
  const created = new Set(plan.items.filter((item) => item.status === 'created').map((item) => `${item.kind}:${item.id}`));
  const epicRepoIdNullable = isNullableColumn(db, 'backlog_epics', 'repo_id');
  db.transaction(() => {
    if (created.has(`catalog:${plan.repoId}`)) {
      db.prepare(
        `INSERT INTO backlog_catalog_meta (repo_id, repo, version, defaults_json, budget_json, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      ).run(plan.repoId, backlog.repo, backlog.version, JSON.stringify(backlog.defaults), backlog.budget ? JSON.stringify(backlog.budget) : null);
    }
    const insertEpic = db.prepare(
      `INSERT INTO backlog_epics (epic_id, project_id, repo_id, title, position, data_json, archived_at, updated_at)
       VALUES (?, (SELECT project_id FROM project_repos WHERE repo_id = ?), ${epicRepoIdNullable ? 'NULL' : '?'}, ?, ?, ?, NULL, datetime('now'))`,
    );
    const insertFeature = db.prepare(
      `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, depends_on, spec_file, position, data_json, archived_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))`,
    );
    const insertTask = db.prepare(
      `INSERT INTO backlog_tasks (task_id, feature_id, title, status, position, data_json, archived_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))`,
    );
    backlog.epics.forEach((epic, epicIndex) => {
      if (created.has(`epic:${epic.id}`)) {
        if (epicRepoIdNullable) insertEpic.run(epic.id, plan.repoId, epic.title, epicIndex, JSON.stringify(epic));
        else insertEpic.run(epic.id, plan.repoId, plan.repoId, epic.title, epicIndex, JSON.stringify(epic));
      }
      epic.features.forEach((feature, featureIndex) => {
        if (!created.has(`feature:${feature.id}`)) return;
        insertFeature.run(feature.id, epic.id, plan.repoId, feature.title, JSON.stringify(feature.dependsOn), feature.specFile ?? null, featureIndex, JSON.stringify(feature));
        feature.tasks.forEach((task, taskIndex) => {
          insertTask.run(task.id, feature.id, task.title, task.status, taskIndex, JSON.stringify(task));
        });
      });
    });
  })();
}

/** Read-only comparison against the currently stored catalog for `repoId`; writes nothing. */
export function diffBacklogCatalog(backlog: BacklogV2, repoId: string): BacklogCatalogDiff {
  const existingFeatures = new Map(
    listCatalogFeatures(repoId).map((row) => [row.feature_id, row.data_json]),
  );
  const incoming = flattenFeatures(backlog);

  const diff: BacklogCatalogDiff = {
    addedFeatures: [],
    changedFeatures: [],
    archivedFeatures: [],
    unchangedFeatures: [],
  };

  for (const { feature } of incoming) {
    const existingJson = existingFeatures.get(feature.id);
    const newJson = JSON.stringify(feature);
    if (existingJson === undefined) diff.addedFeatures.push(feature.id);
    else if (existingJson !== newJson) diff.changedFeatures.push(feature.id);
    else diff.unchangedFeatures.push(feature.id);
  }

  return diff;
}

interface StoredFeatureRow {
  feature_id: string;
  epic_id: string;
  repo_id: string;
  title: string;
  depends_on: string;
  spec_file: string | null;
  position: number;
  data_json: string;
  archived_at: string | null;
}

function replaceFeatureReferences(db: Database.Database, oldId: string, newId: string): void {
  for (const table of [
    'runs',
    'gates',
    'run_output',
    'context_queries',
    'pipelines',
    'stage_requests',
    'stage_transition_decisions',
    'backlog_tasks',
  ]) {
    db.prepare(`UPDATE ${table} SET feature_id = ? WHERE feature_id = ?`).run(newId, oldId);
  }
  db.prepare(
    `UPDATE pipelines SET requested_abort_feature_id = ? WHERE requested_abort_feature_id = ?`,
  ).run(newId, oldId);

  const pipelineRows = db.prepare(
    `SELECT id, plan_json, done_json, pending_json, active_json, aborted_json FROM pipelines
     WHERE plan_json LIKE ? OR done_json LIKE ? OR pending_json LIKE ? OR active_json LIKE ? OR aborted_json LIKE ?`,
  ).all(...Array.from({ length: 5 }, () => `%${oldId}%`)) as {
    id: number;
    plan_json: string;
    done_json: string;
    pending_json: string;
    active_json: string;
    aborted_json: string;
  }[];
  const updatePipeline = db.prepare(
    `UPDATE pipelines SET plan_json = ?, done_json = ?, pending_json = ?, active_json = ?, aborted_json = ?, updated_at = datetime('now') WHERE id = ?`,
  );
  const replaceArrayValue = (json: string): string => {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return JSON.stringify(value);
    const values = value as unknown[];
    return JSON.stringify(values.map((item: unknown) => item === oldId ? newId : item));
  };
  for (const row of pipelineRows) {
    updatePipeline.run(
      replaceArrayValue(row.plan_json),
      replaceArrayValue(row.done_json),
      replaceArrayValue(row.pending_json),
      replaceArrayValue(row.active_json),
      replaceArrayValue(row.aborted_json),
      row.id,
    );
  }
}

function replaceDependencyReferences(db: Database.Database, repoId: string, oldId: string, newId: string): void {
  const rows = db.prepare(
    `SELECT feature_id, data_json FROM backlog_features WHERE repo_id = ? AND archived_at IS NULL`,
  ).all(repoId) as { feature_id: string; data_json: string }[];
  const update = db.prepare(
    `UPDATE backlog_features SET depends_on = ?, data_json = ?, updated_at = datetime('now') WHERE feature_id = ?`,
  );
  for (const row of rows) {
    const feature = FeatureSchema.parse(JSON.parse(row.data_json));
    if (!feature.dependsOn.includes(oldId)) continue;
    const updated = FeatureSchema.parse({
      ...feature,
      dependsOn: feature.dependsOn.map((dependency) => dependency === oldId ? newId : dependency),
    });
    update.run(JSON.stringify(updated.dependsOn), JSON.stringify(updated), row.feature_id);
  }
}

function rekeyCatalogFeature(
  db: Database.Database,
  repoId: string,
  oldId: string,
  newId: string,
): boolean {
  if (oldId === newId) return false;
  const oldRow = db.prepare(
    `SELECT feature_id, epic_id, repo_id, title, depends_on, spec_file, position, data_json, archived_at
     FROM backlog_features WHERE feature_id = ? AND repo_id = ?`,
  ).get(oldId, repoId) as StoredFeatureRow | undefined;
  if (!oldRow) return false;
  const existingNew = db.prepare(`SELECT feature_id FROM backlog_features WHERE feature_id = ?`).get(newId) as { feature_id: string } | undefined;
  if (existingNew) {
    throw new Error(`Generated feature ID "${newId}" is already present in the catalog; publication was rolled back.`);
  }
  const oldFeature = FeatureSchema.parse(JSON.parse(oldRow.data_json));
  const rekeyedFeature = FeatureSchema.parse({ ...oldFeature, id: newId });

  db.prepare(
    `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, depends_on, spec_file, position, data_json, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    newId,
    oldRow.epic_id,
    oldRow.repo_id,
    oldRow.title,
    JSON.stringify(rekeyedFeature.dependsOn),
    oldRow.spec_file,
    oldRow.position,
    JSON.stringify(rekeyedFeature),
    oldRow.archived_at,
  );
  replaceFeatureReferences(db, oldId, newId);
  replaceDependencyReferences(db, repoId, oldId, newId);
  db.prepare(`DELETE FROM backlog_features WHERE feature_id = ?`).run(oldId);
  return true;
}

function rekeyCatalogFeatures(
  db: Database.Database,
  backlog: BacklogV2,
  repoId: string,
  registrations: readonly FeatureRegistrationResult[],
): void {
  const incoming = flattenFeatures(backlog);
  const usedOldIds = new Set<string>();
  const incomingIds = new Set(incoming.map(({ feature }) => feature.id));

  incoming.forEach(({ epic, feature }, index) => {
    const registration = registrations[index];
    let oldId = registration?.previousId;
    if (oldId && (usedOldIds.has(oldId) || incomingIds.has(oldId))) oldId = undefined;

    if (!oldId) {
      const candidates = db.prepare(
        `SELECT feature_id FROM backlog_features
         WHERE repo_id = ? AND epic_id = ? AND title = ? AND spec_file IS ? AND archived_at IS NULL
         AND feature_id NOT IN (${[...incomingIds].map(() => '?').join(',') || "''"})`,
      ).all(repoId, epic.id, feature.title, feature.specFile ?? null, ...incomingIds) as { feature_id: string }[];
      const candidate = candidates[0];
      if (candidates.length === 1 && candidate && !usedOldIds.has(candidate.feature_id)) oldId = candidate.feature_id;
    }

    if (oldId && rekeyCatalogFeature(db, repoId, oldId, feature.id)) usedOldIds.add(oldId);
  });
}

function migrateRemainingFeatureIds(db: Database.Database, repoId: string): void {
  const occupied = new Set(
    (db.prepare(`SELECT feature_id FROM backlog_features`).all() as { feature_id: string }[])
      .map((row) => row.feature_id),
  );
  const rows = db.prepare(
    `SELECT feature_id FROM backlog_features WHERE repo_id = ? ORDER BY feature_id`,
  ).all(repoId) as { feature_id: string }[];
  for (const row of rows) {
    if (isCanonicalFeatureId(row.feature_id)) continue;
    const generatedId = allocateFeatureId(occupied);
    occupied.add(generatedId);
    rekeyCatalogFeature(db, repoId, row.feature_id, generatedId);
  }
}

/**
 * Adds or updates epics/features/tasks for `repoId` from the backlog queue in
 * a single transaction. Features absent from the queue are retained because
 * successful loads remove them from YAML after publication.
 */
export function upsertBacklogCatalog(
  backlog: BacklogV2,
  repoId: string,
  registrations?: readonly FeatureRegistrationResult[],
): BacklogCatalogDiff {
  const db = getDb('readwrite');
  const enforceGeneratedIds = registrations !== undefined;
  let diff: BacklogCatalogDiff | undefined;
  const epicRepoIdNullable = isNullableColumn(db, 'backlog_epics', 'repo_id');

  const upsertMeta = db.prepare(
    `INSERT INTO backlog_catalog_meta (repo_id, repo, version, defaults_json, budget_json, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(repo_id) DO UPDATE SET
       repo = excluded.repo,
       version = excluded.version,
       updated_at = datetime('now')`,
  );

  const upsertEpic = db.prepare(
    `INSERT INTO backlog_epics (epic_id, project_id, repo_id, title, position, data_json, archived_at, updated_at)
     VALUES (?, (SELECT project_id FROM project_repos WHERE repo_id = ?), ${epicRepoIdNullable ? 'NULL' : '?'}, ?, ?, ?, NULL, datetime('now'))
     ON CONFLICT(epic_id) DO UPDATE SET
       title = excluded.title,
       position = excluded.position,
       data_json = excluded.data_json,
       archived_at = NULL,
       updated_at = datetime('now')
     WHERE backlog_epics.data_json IS NOT excluded.data_json
        OR backlog_epics.archived_at IS NOT NULL`,
  );

  const upsertFeature = db.prepare(
    `INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, depends_on, spec_file, position, data_json, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
     ON CONFLICT(feature_id) DO UPDATE SET
       epic_id = excluded.epic_id,
       repo_id = excluded.repo_id,
       title = excluded.title,
       depends_on = excluded.depends_on,
       spec_file = excluded.spec_file,
       position = excluded.position,
       data_json = excluded.data_json,
       archived_at = NULL,
       updated_at = datetime('now')
     WHERE backlog_features.data_json IS NOT excluded.data_json
        OR backlog_features.archived_at IS NOT NULL`,
  );

  const upsertTask = db.prepare(
    `INSERT INTO backlog_tasks (task_id, feature_id, title, status, position, data_json, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))
     ON CONFLICT(task_id, feature_id) DO UPDATE SET
       title = excluded.title,
       status = excluded.status,
       position = excluded.position,
       data_json = excluded.data_json,
       archived_at = NULL,
       updated_at = datetime('now')
     WHERE backlog_tasks.data_json IS NOT excluded.data_json
        OR backlog_tasks.archived_at IS NOT NULL`,
  );

  const archiveTaskById = db.prepare(
    `UPDATE backlog_tasks SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE task_id = ? AND feature_id = ? AND archived_at IS NULL`,
  );

  const run = db.transaction(() => {
    diff = diffBacklogCatalog(backlog, repoId);
    rekeyCatalogFeatures(db, backlog, repoId, registrations ?? []);
    const ownershipRows = db
      .prepare(`SELECT feature_id, repo_id FROM backlog_features WHERE feature_id IN (${flattenFeatures(backlog).map(() => '?').join(',') || "''"})`)
      .all(...flattenFeatures(backlog).map(({ feature }) => feature.id)) as { feature_id: string; repo_id: string }[];
    const owners = new Map(ownershipRows.map((row) => [row.feature_id, row.repo_id]));
    for (const { feature } of flattenFeatures(backlog)) {
      const owner = owners.get(feature.id);
      if (owner && owner !== repoId) {
        throw new Error(
          `Feature ID "${feature.id}" is already owned by repository "${owner}"; catalog update for "${repoId}" was rolled back.`,
        );
      }
    }

    upsertMeta.run(
      repoId,
      backlog.repo,
      backlog.version,
      JSON.stringify(backlog.defaults),
      backlog.budget ? JSON.stringify(backlog.budget) : null,
    );

    backlog.epics.forEach((epic, epicIndex) => {
      if (epicRepoIdNullable) {
        upsertEpic.run(epic.id, repoId, epic.title, epicIndex, JSON.stringify(epic));
      } else {
        upsertEpic.run(epic.id, repoId, repoId, epic.title, epicIndex, JSON.stringify(epic));
      }

      epic.features.forEach((feature, featureIndex) => {
        upsertFeature.run(
          feature.id,
          epic.id,
          repoId,
          feature.title,
          JSON.stringify(feature.dependsOn),
          feature.specFile ?? null,
          featureIndex,
          JSON.stringify(feature),
        );

        const incomingTaskIds = new Set<string>();
        feature.tasks.forEach((task: Task, taskIndex) => {
          incomingTaskIds.add(task.id);
          upsertTask.run(task.id, feature.id, task.title, task.status, taskIndex, JSON.stringify(task));
        });

        for (const row of listCatalogTasks(repoId, feature.id)) {
          if (!incomingTaskIds.has(row.task_id)) archiveTaskById.run(row.task_id, feature.id);
        }
      });
    });

    if (enforceGeneratedIds) migrateRemainingFeatureIds(db, repoId);

  });

  run();
  if (!diff) throw new Error('Catalog publication did not produce a diff.');
  return diff;
}

function isNullableColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[];
  return columns.some((candidate) => candidate.name === column && candidate.notnull === 0);
}

function mergeFeaturePatch(current: Feature, patch: FeaturePatch): unknown {
  return {
    ...current,
    ...patch,
    workflow: patch.workflow
      ? {
          ...current.workflow,
          ...patch.workflow,
          approvals: patch.workflow.approvals
            ? { ...current.workflow.approvals, ...patch.workflow.approvals }
            : current.workflow.approvals,
          sessionPolicy: patch.workflow.sessionPolicy
            ? { ...current.workflow.sessionPolicy, ...patch.workflow.sessionPolicy }
            : current.workflow.sessionPolicy,
        }
      : current.workflow,
    retry: patch.retry ? { ...(current.retry ?? {}), ...patch.retry } : current.retry,
  };
}

function isPermutation(current: readonly string[], candidate: readonly string[]): boolean {
  return current.length === candidate.length
    && new Set(current).size === current.length
    && new Set(candidate).size === candidate.length
    && candidate.every((stage) => current.includes(stage));
}

/**
 * Patches a single feature's `data_json` in place, re-validating through
 * `FeatureSchema` so an invalid patch throws instead of writing a corrupt
 * row. `workflow`/`retry` are deep-merged so a partial patch (e.g. just
 * `workflow.stages`) doesn't wipe sibling fields like `workflow.approvals`.
 */
export function updateCatalogFeature(repoId: string, featureId: string, patch: FeaturePatch): Feature {
  const db = getDb('readwrite');

  const getRow = db.prepare(
    `SELECT data_json FROM backlog_features WHERE feature_id = ? AND repo_id = ? AND archived_at IS NULL`,
  );
  const updateRow = db.prepare(
    `UPDATE backlog_features SET data_json = ?, title = ?, depends_on = ?, spec_file = ?, updated_at = datetime('now')
     WHERE feature_id = ? AND repo_id = ?`,
  );

  const run = db.transaction((): Feature => {
    const row = getRow.get(featureId, repoId) as { data_json: string } | undefined;
    if (!row) {
      throw new BacklogCatalogNotFoundError(
        `Feature "${featureId}" not found (or archived) for repo "${repoId}".`,
      );
    }
    const current = FeatureSchema.parse(JSON.parse(row.data_json));
    const reorderedStages = patch.workflow?.stages;
    const isStagesOnlyPatch = reorderedStages !== undefined
      && patch.workflow?.stepGuidance === undefined
      && patch.workflow?.sessionPolicy === undefined;
    if (isStagesOnlyPatch && !isPermutation(current.workflow.stages, reorderedStages)) {
      throw new Error('A stages-only workflow patch must be a permutation of the saved stages.');
    }
    const merged = FeatureSchema.parse(mergeFeaturePatch(current, patch));
    validateRegisteredToolReference(merged.tool, `feature "${featureId}".tool`);

    updateRow.run(
      JSON.stringify(merged),
      merged.title,
      JSON.stringify(merged.dependsOn),
      merged.specFile ?? null,
      featureId,
      repoId,
    );

    return merged;
  });

  return run();
}

/**
 * Patches a single task's `data_json` in place, re-validating through
 * `TaskSchema`. Keeps the denormalized `title`/`status` columns in sync with
 * `data_json`, matching `upsertBacklogCatalog`'s write shape.
 */
export function updateCatalogTask(featureId: string, taskId: string, patch: Partial<Task>): Task {
  const db = getDb('readwrite');

  const getTaskRow = db.prepare(
    `SELECT data_json FROM backlog_tasks WHERE task_id = ? AND feature_id = ? AND archived_at IS NULL`,
  );
  const updateTaskRow = db.prepare(
    `UPDATE backlog_tasks SET data_json = ?, title = ?, status = ?, updated_at = datetime('now')
     WHERE task_id = ? AND feature_id = ?`,
  );
  // `loadBacklogFromCatalog` reads a feature's tasks from its own embedded
  // `data_json.tasks` snapshot, not from this table (see F35) — the
  // standalone backlog_tasks row must stay in lockstep with it, or task
  // edits here would be invisible at runtime.
  const getFeatureRow = db.prepare(
    `SELECT data_json FROM backlog_features WHERE feature_id = ? AND archived_at IS NULL`,
  );
  const updateFeatureRow = db.prepare(
    `UPDATE backlog_features SET data_json = ?, updated_at = datetime('now') WHERE feature_id = ?`,
  );

  const run = db.transaction((): Task => {
    const taskRow = getTaskRow.get(taskId, featureId) as { data_json: string } | undefined;
    if (!taskRow) {
      throw new BacklogCatalogNotFoundError(
        `Task "${taskId}" not found (or archived) for feature "${featureId}".`,
      );
    }
    const featureRow = getFeatureRow.get(featureId) as { data_json: string } | undefined;
    if (!featureRow) {
      throw new BacklogCatalogNotFoundError(
        `Feature "${featureId}" not found (or archived) for task "${taskId}".`,
      );
    }

    const current = TaskSchema.parse(JSON.parse(taskRow.data_json));
    const merged = TaskSchema.parse({ ...current, ...patch });

    const feature = FeatureSchema.parse(JSON.parse(featureRow.data_json));
    const taskIndex = feature.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) {
      throw new BacklogCatalogNotFoundError(
        `Task "${taskId}" not found in feature "${featureId}"'s task list.`,
      );
    }
    const updatedFeature = FeatureSchema.parse({
      ...feature,
      tasks: feature.tasks.map((task, index) => (index === taskIndex ? merged : task)),
    });

    updateTaskRow.run(JSON.stringify(merged), merged.title, merged.status, taskId, featureId);
    updateFeatureRow.run(JSON.stringify(updatedFeature), featureId);

    return merged;
  });

  return run();
}

export type CatalogDefaultsPatch = Omit<Partial<Defaults>, 'workflow'> & {
  workflow?: Partial<Omit<Workflow, 'approvals' | 'sessionPolicy'>> & {
    approvals?: Partial<Workflow['approvals']>;
    sessionPolicy?: Partial<Workflow['sessionPolicy']>;
  };
  budget?: Partial<Budget>;
};

export interface CatalogDefaults {
  defaults: Defaults;
  budget?: Budget;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inheritWorkflowDefaults(current: Workflow, previous: Workflow, next: Workflow): Workflow {
  const inherited = { ...current };
  if (sameJsonValue(current.mode, previous.mode)) inherited.mode = next.mode;
  if (sameJsonValue(current.stages, previous.stages)) inherited.stages = [...next.stages];
  if (sameJsonValue(current.autoAdvance, previous.autoAdvance)) inherited.autoAdvance = next.autoAdvance;
  if (sameJsonValue(current.syncTasksToBacklog, previous.syncTasksToBacklog)) inherited.syncTasksToBacklog = next.syncTasksToBacklog;
  if (sameJsonValue(current.approvals, previous.approvals)) inherited.approvals = next.approvals;
  else {
    inherited.approvals = { ...current.approvals };
    if (sameJsonValue(current.approvals.channel, previous.approvals.channel)) inherited.approvals.channel = next.approvals.channel;
  }
  return inherited;
}

/**
 * Patches a project's `defaults_json`/`budget_json` in place, mirroring
 * `updateCatalogFeature`'s merge-then-validate contract at the project level.
 * `getDb('readwrite')` asserts the DB path is writable before any query runs.
 */
export function updateCatalogDefaults(repoId: string, patch: CatalogDefaultsPatch): CatalogDefaults {
  const db = getDb('readwrite');

  const getRow = db.prepare(
    `SELECT defaults_json, budget_json FROM backlog_catalog_meta WHERE repo_id = ?`,
  );
  const updateRow = db.prepare(
    `UPDATE backlog_catalog_meta SET defaults_json = ?, budget_json = ?, updated_at = datetime('now') WHERE repo_id = ?`,
  );
  const featureRows = db.prepare(
    `SELECT feature_id, data_json FROM backlog_features WHERE repo_id = ? AND archived_at IS NULL`,
  );
  const updateFeatureRow = db.prepare(
    `UPDATE backlog_features SET data_json = ?, updated_at = datetime('now') WHERE feature_id = ? AND repo_id = ?`,
  );

  const run = db.transaction((): CatalogDefaults => {
    const row = getRow.get(repoId) as { defaults_json: string; budget_json: string | null } | undefined;
    if (!row) {
      throw new BacklogCatalogNotFoundError(`Catalog defaults not found for repo "${repoId}".`);
    }

    const currentDefaults = DefaultsSchema.parse(JSON.parse(row.defaults_json));
    const currentBudget = row.budget_json ? BudgetSchema.parse(JSON.parse(row.budget_json)) : undefined;

    const { budget: budgetPatch, workflow: workflowPatch, ...defaultsPatch } = patch;
    const mergedDefaults = DefaultsSchema.parse({
      ...currentDefaults,
      ...defaultsPatch,
      ...(workflowPatch
        ? {
            workflow: {
              ...currentDefaults.workflow,
              ...workflowPatch,
              approvals: workflowPatch.approvals
                ? { ...currentDefaults.workflow.approvals, ...workflowPatch.approvals }
                : currentDefaults.workflow.approvals,
              sessionPolicy: workflowPatch.sessionPolicy
                ? { ...currentDefaults.workflow.sessionPolicy, ...workflowPatch.sessionPolicy }
                : currentDefaults.workflow.sessionPolicy,
            },
          }
        : {}),
    });
    validateRegisteredToolReference(mergedDefaults.tool, 'defaults.tool');
    const mergedBudget = budgetPatch
      ? BudgetSchema.parse({ ...currentBudget, ...budgetPatch })
      : currentBudget;

    for (const row of featureRows.all(repoId) as { feature_id: string; data_json: string }[]) {
      const currentFeature = FeatureSchema.parse(JSON.parse(row.data_json));
      const inheritedFeature = {
        ...currentFeature,
        ...(sameJsonValue(currentFeature.tool, currentDefaults.tool) ? { tool: mergedDefaults.tool } : {}),
        ...(sameJsonValue(currentFeature.model, currentDefaults.model) ? { model: mergedDefaults.model } : {}),
        ...(sameJsonValue(currentFeature.effort, currentDefaults.effort) ? { effort: mergedDefaults.effort } : {}),
        ...(sameJsonValue(currentFeature.thinking, currentDefaults.thinking) ? { thinking: mergedDefaults.thinking } : {}),
        ...(sameJsonValue(currentFeature.skills ?? [], currentDefaults.skills) ? { skills: mergedDefaults.skills } : {}),
        ...(sameJsonValue(currentFeature.maxTokens, currentDefaults.maxTokens) ? { maxTokens: mergedDefaults.maxTokens } : {}),
        workflow: inheritWorkflowDefaults(currentFeature.workflow, currentDefaults.workflow, mergedDefaults.workflow),
      };
      const validatedFeature = FeatureSchema.parse(inheritedFeature);
      validateRegisteredToolReference(validatedFeature.tool, `feature "${row.feature_id}".tool`);
      if (!sameJsonValue(validatedFeature, currentFeature)) {
        updateFeatureRow.run(JSON.stringify(validatedFeature), row.feature_id, repoId);
      }
    }

    updateRow.run(
      JSON.stringify(mergedDefaults),
      mergedBudget ? JSON.stringify(mergedBudget) : null,
      repoId,
    );

    return { defaults: mergedDefaults, budget: mergedBudget };
  });

  return run();
}
