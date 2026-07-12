import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { getDb } from './index.js';
import { resolveDbPath } from '../config/index.js';
import {
  FeatureSchema,
  TaskSchema,
  type BacklogV2,
  type Epic,
  type Feature,
  type Retry,
  type Task,
  type Workflow,
} from '../core/backlog/schema.js';

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
       WHERE repo_id = ? AND archived_at IS NULL
       ORDER BY position ASC`,
    )
    .all(repoId) as CatalogEpicRow[];
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
 * config (e.g. `workflow.approvals.autoAdvance`) mid-run without the caller
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

/** Read-only comparison against the currently stored catalog for `repoId`; writes nothing. */
export function diffBacklogCatalog(backlog: BacklogV2, repoId: string): BacklogCatalogDiff {
  const existingFeatures = new Map(
    listCatalogFeatures(repoId).map((row) => [row.feature_id, row.data_json]),
  );
  const incoming = flattenFeatures(backlog);
  const incomingIds = new Set(incoming.map(({ feature }) => feature.id));

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

  for (const featureId of existingFeatures.keys()) {
    if (!incomingIds.has(featureId)) diff.archivedFeatures.push(featureId);
  }

  return diff;
}

/**
 * Upserts epics/features/tasks for `repoId` from `backlog`, in a single
 * transaction. Never DELETEs — anything no longer present in `backlog` is
 * archived (archived_at set), preserving FKs from historical runs/gates.
 */
export function upsertBacklogCatalog(backlog: BacklogV2, repoId: string): BacklogCatalogDiff {
  const db = getDb('readwrite');
  const diff = diffBacklogCatalog(backlog, repoId);

  const upsertMeta = db.prepare(
    `INSERT INTO backlog_catalog_meta (repo_id, repo, version, defaults_json, budget_json, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(repo_id) DO UPDATE SET
       repo = excluded.repo,
       version = excluded.version,
       defaults_json = excluded.defaults_json,
       budget_json = excluded.budget_json,
       updated_at = datetime('now')`,
  );

  const upsertEpic = db.prepare(
    `INSERT INTO backlog_epics (epic_id, repo_id, title, position, data_json, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, datetime('now'))
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

  const archiveEpic = db.prepare(
    `UPDATE backlog_epics SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE epic_id = ? AND archived_at IS NULL`,
  );
  const archiveFeature = db.prepare(
    `UPDATE backlog_features SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE feature_id = ? AND archived_at IS NULL`,
  );
  const archiveTasksForFeature = db.prepare(
    `UPDATE backlog_tasks SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE feature_id = ? AND archived_at IS NULL`,
  );
  const archiveTaskById = db.prepare(
    `UPDATE backlog_tasks SET archived_at = datetime('now'), updated_at = datetime('now')
     WHERE task_id = ? AND feature_id = ? AND archived_at IS NULL`,
  );

  const run = db.transaction(() => {
    upsertMeta.run(
      repoId,
      backlog.repo,
      backlog.version,
      JSON.stringify(backlog.defaults),
      backlog.budget ? JSON.stringify(backlog.budget) : null,
    );

    const incomingEpicIds = new Set<string>();
    const incomingFeatureIds = new Set<string>();

    backlog.epics.forEach((epic, epicIndex) => {
      incomingEpicIds.add(epic.id);
      upsertEpic.run(epic.id, repoId, epic.title, epicIndex, JSON.stringify(epic));

      epic.features.forEach((feature, featureIndex) => {
        incomingFeatureIds.add(feature.id);
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

    for (const row of listCatalogFeatures(repoId)) {
      if (!incomingFeatureIds.has(row.feature_id)) {
        archiveFeature.run(row.feature_id);
        archiveTasksForFeature.run(row.feature_id);
      }
    }
    for (const row of listCatalogEpics(repoId)) {
      if (!incomingEpicIds.has(row.epic_id)) archiveEpic.run(row.epic_id);
    }
  });

  run();
  return diff;
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
    const merged = FeatureSchema.parse(mergeFeaturePatch(current, patch));

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
