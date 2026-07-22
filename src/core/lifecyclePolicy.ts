import type Database from 'better-sqlite3';
import type { LifecycleEntityKind } from '../db/errors.js';

/**
 * Single lifecycle policy engine (PRJ-17).
 *
 * One decision point, shared by CLI and WebSocket, for what may be archived,
 * logically deleted, or refused across Project / Epic / Work Item. The state
 * classification and the mutation run inside the *same* transaction (see the
 * repo-layer callers) so a concurrent Start cannot slip a run in between the
 * check and the write.
 *
 * State model:
 *  - `pristine`    — no run/pipeline/gate/topic reference and no dependent.
 *  - `running`     — an active run/pipeline or a pending stage request.
 *  - `historical`  — at least one terminal run/pipeline, none of them active.
 *
 * Archive is allowed for pristine and historical, refused while running.
 * Logical delete is allowed only for pristine (and, for Epic/Project, only
 * once every descendant is already tombstoned).
 */

export type LifecycleState = 'pristine' | 'running' | 'historical';

/** A Work Item is running while a pipeline that is not terminal exists, a run
 * is still `running`, or a stage request is pending. A pipeline in `blocked` /
 * `paused` is still live (it is awaiting a resume decision), so it counts as
 * running — never as history. */
function workItemHasActiveExecution(db: Database.Database, workItemId: string): boolean {
  const activePipeline = db.prepare(
    `SELECT 1 FROM pipelines
      WHERE feature_id = ? AND status NOT IN ('done', 'failed', 'aborted')
      LIMIT 1`,
  ).get(workItemId);
  if (activePipeline) return true;

  const runningRun = db.prepare(
    `SELECT 1 FROM runs WHERE feature_id = ? AND status = 'running' LIMIT 1`,
  ).get(workItemId);
  if (runningRun) return true;

  const pendingRequest = db.prepare(
    `SELECT 1 FROM stage_requests WHERE feature_id = ? AND status = 'pending' LIMIT 1`,
  ).get(workItemId);
  return Boolean(pendingRequest);
}

/** Any run row (terminal or not) means the item carries execution history. */
function workItemHasAnyRun(db: Database.Database, workItemId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM runs WHERE feature_id = ? LIMIT 1`,
  ).get(workItemId);
  return Boolean(row);
}

/** Unresolved gates are an active reference regardless of run status. */
function workItemHasActiveGate(db: Database.Database, workItemId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM gates WHERE feature_id = ? AND resolved_at IS NULL LIMIT 1`,
  ).get(workItemId);
  return Boolean(row);
}

/** A live Telegram topic association is a pristine-breaking reference. */
export function workItemHasTopicAssociation(db: Database.Database, workItemId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM feature_topic_associations WHERE feature_id = ? LIMIT 1`,
  ).get(workItemId);
  return Boolean(row);
}

/** Classifies a Work Item as pristine / running / historical. */
export function classifyWorkItemState(db: Database.Database, workItemId: string): LifecycleState {
  if (workItemHasActiveExecution(db, workItemId) || workItemHasActiveGate(db, workItemId)) {
    return 'running';
  }
  if (workItemHasAnyRun(db, workItemId)) return 'historical';
  return 'pristine';
}

/** A downstream `dependsOn` is any *live* (not archived/deleted) Work Item that
 * lists this one among its dependencies. Tombstoned/archived items no longer
 * count — a deleted item cannot be a live blocker. */
export function workItemDownstreamDependents(db: Database.Database, workItemId: string): string[] {
  const rows = db.prepare(
    `SELECT feature_id AS featureId, depends_on AS dependsOn
       FROM backlog_features
      WHERE archived_at IS NULL AND deleted_at IS NULL AND feature_id <> ?`,
  ).all(workItemId) as { featureId: string; dependsOn: string }[];
  const dependents: string[] = [];
  for (const row of rows) {
    let deps: unknown;
    try {
      deps = JSON.parse(row.dependsOn);
    } catch {
      deps = [];
    }
    if (Array.isArray(deps) && deps.includes(workItemId)) dependents.push(row.featureId);
  }
  return dependents;
}

/** Every reason a Work Item is not pristine, in priority order. `undefined`
 * means pristine. The `running`/`historical` classification is authoritative
 * for archive; the reference reasons additionally gate delete. */
export interface WorkItemBlockingReferences {
  state: LifecycleState;
  activeGate: boolean;
  topic: boolean;
  dependents: string[];
}

export function collectWorkItemReferences(db: Database.Database, workItemId: string): WorkItemBlockingReferences {
  return {
    state: classifyWorkItemState(db, workItemId),
    activeGate: workItemHasActiveGate(db, workItemId),
    topic: workItemHasTopicAssociation(db, workItemId),
    dependents: workItemDownstreamDependents(db, workItemId),
  };
}

/** Whether every Work Item under an Epic is already tombstoned (deleted). A
 * pristine Epic delete requires no surviving children. Archived-but-not-deleted
 * children still block the delete. */
export function epicHasUndeletedWorkItems(db: Database.Database, epicId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM backlog_features WHERE epic_id = ? AND deleted_at IS NULL LIMIT 1`,
  ).get(epicId);
  return Boolean(row);
}

/** Whether an Epic (via any of its Work Items) has an active execution. Reuses
 * the Work Item classifier so the running definition stays in one place. */
export function classifyEpicState(db: Database.Database, epicId: string): LifecycleState {
  const workItems = db.prepare(
    `SELECT feature_id AS featureId FROM backlog_features WHERE epic_id = ?`,
  ).all(epicId) as { featureId: string }[];
  let historical = false;
  for (const wi of workItems) {
    const state = classifyWorkItemState(db, wi.featureId);
    if (state === 'running') return 'running';
    if (state === 'historical') historical = true;
  }
  return historical ? 'historical' : 'pristine';
}

/** Whether a Project still has Epics that are not tombstoned. */
export function projectHasUndeletedEpics(db: Database.Database, projectId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM backlog_epics WHERE project_id = ? AND deleted_at IS NULL LIMIT 1`,
  ).get(projectId);
  return Boolean(row);
}

/** Whether a Project still has linked repositories. Project delete requires the
 * repos to be unlinked first. */
export function projectHasLinkedRepos(db: Database.Database, projectId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM project_repos WHERE project_id = ? LIMIT 1`,
  ).get(projectId);
  return Boolean(row);
}

/** Classifies a Project by aggregating the state of every Epic underneath. */
export function classifyProjectState(db: Database.Database, projectId: string): LifecycleState {
  const epics = db.prepare(
    `SELECT epic_id AS epicId FROM backlog_epics WHERE project_id = ?`,
  ).all(projectId) as { epicId: string }[];
  let historical = false;
  for (const epic of epics) {
    const state = classifyEpicState(db, epic.epicId);
    if (state === 'running') return 'running';
    if (state === 'historical') historical = true;
  }
  return historical ? 'historical' : 'pristine';
}

export function classifyState(db: Database.Database, kind: LifecycleEntityKind, id: string): LifecycleState {
  switch (kind) {
    case 'work_item': return classifyWorkItemState(db, id);
    case 'epic': return classifyEpicState(db, id);
    case 'project': return classifyProjectState(db, id);
  }
}

/**
 * Whether the given state permits archive. Archive is reversible and allowed
 * for pristine and historical entities; refused while running.
 */
export function canArchive(state: LifecycleState): boolean {
  return state !== 'running';
}


/**
 * The lifecycle actions the UI may offer for an entity, computed server-side so
 * the client never re-derives the policy (PRJ-18). Booleans mirror the exact
 * accept/reject checks in the repo-layer archive/delete/restore mutations; a
 * `false` here means the corresponding WS action would be refused right now.
 */
export interface AllowedLifecycle {
  /** Authoritative pristine/running/historical classification. */
  state: LifecycleState;
  /** Already archived (archived_at set, deleted_at null) — restore is offered. */
  archived: boolean;
  /** Logically deleted (tombstone) — no common-flow action is offered. */
  deleted: boolean;
  /** Archive (reversible) is permitted. */
  archive: boolean;
  /** Logical delete (tombstone, not restorable via the common flow) is permitted. */
  delete: boolean;
  /** Entity is running: the UI offers cancel first before any lifecycle action. */
  cancel: boolean;
  /** Restore of a previously archived entity is permitted (ancestor not archived). */
  restore: boolean;
  /** Human-readable reason lifecycle mutations are blocked, or null when the
   * entity is fully actionable. Surfaced next to a disabled destructive action. */
  blockedReason: string | null;
}

interface LifecycleColumns {
  archivedAt: string | null;
  deletedAt: string | null;
}

function readLifecycleColumns(db: Database.Database, kind: LifecycleEntityKind, id: string): LifecycleColumns | null {
  const table = kind === 'work_item' ? 'backlog_features' : kind === 'epic' ? 'backlog_epics' : 'projects';
  const idColumn = kind === 'work_item' ? 'feature_id' : kind === 'epic' ? 'epic_id' : 'project_id';
  const row = db.prepare(
    `SELECT archived_at AS archivedAt, deleted_at AS deletedAt FROM ${table} WHERE ${idColumn} = ?`,
  ).get(id) as LifecycleColumns | undefined;
  return row ?? null;
}

/** Whether the entity's parent is archived/deleted, which blocks restore. */
function hasArchivedAncestor(db: Database.Database, kind: LifecycleEntityKind, id: string): boolean {
  if (kind === 'work_item') {
    const row = db.prepare(
      `SELECT e.archived_at AS archivedAt, e.deleted_at AS deletedAt
         FROM backlog_features f JOIN backlog_epics e ON e.epic_id = f.epic_id
        WHERE f.feature_id = ?`,
    ).get(id) as LifecycleColumns | undefined;
    return Boolean(row && (row.archivedAt !== null || row.deletedAt !== null));
  }
  if (kind === 'epic') {
    const row = db.prepare(
      `SELECT p.archived_at AS archivedAt, p.deleted_at AS deletedAt
         FROM backlog_epics e JOIN projects p ON p.project_id = e.project_id
        WHERE e.epic_id = ?`,
    ).get(id) as LifecycleColumns | undefined;
    return Boolean(row && (row.archivedAt !== null || row.deletedAt !== null));
  }
  return false; // Project has no ancestor.
}

/** Computes the delete decision and, when refused, the reason. Mirrors the
 * repo-layer delete guards exactly so the button state never disagrees with the
 * eventual WS result. Assumes the entity is not archived/deleted. */
function deleteDecision(db: Database.Database, kind: LifecycleEntityKind, id: string, state: LifecycleState): { delete: boolean; reason: string | null } {
  if (state === 'running') return { delete: false, reason: 'It is running; cancel it first.' };
  if (state === 'historical') return { delete: false, reason: 'It has run history and can be archived but not deleted.' };
  switch (kind) {
    case 'work_item': {
      const refs = collectWorkItemReferences(db, id);
      if (refs.activeGate) return { delete: false, reason: 'It has an unresolved gate.' };
      if (refs.topic) return { delete: false, reason: 'It has a topic association.' };
      if (refs.dependents.length > 0) return { delete: false, reason: `It is a dependency of ${refs.dependents.join(', ')}.` };
      return { delete: true, reason: null };
    }
    case 'epic':
      if (epicHasUndeletedWorkItems(db, id)) return { delete: false, reason: 'It still has Work Items that are not deleted.' };
      return { delete: true, reason: null };
    case 'project':
      if (projectHasUndeletedEpics(db, id)) return { delete: false, reason: 'It still has Epics that are not deleted.' };
      if (projectHasLinkedRepos(db, id)) return { delete: false, reason: 'It still has linked repositories.' };
      return { delete: true, reason: null };
  }
}

/**
 * Projects the full set of lifecycle actions the UI may offer for one entity.
 * Single source of truth consumed by the web state builder (PRJ-18) so the
 * client only enables/disables buttons — it never recomputes the policy.
 */
export function projectLifecycle(db: Database.Database, kind: LifecycleEntityKind, id: string): AllowedLifecycle {
  const columns = readLifecycleColumns(db, kind, id);
  const archived = Boolean(columns && columns.archivedAt !== null && columns.deletedAt === null);
  const deleted = Boolean(columns && columns.deletedAt !== null);

  // A tombstoned entity offers nothing through the common flow.
  if (deleted) {
    return { state: 'historical', archived: false, deleted: true, archive: false, delete: false, cancel: false, restore: false, blockedReason: 'It is deleted.' };
  }

  const state = classifyState(db, kind, id);

  if (archived) {
    const restore = !hasArchivedAncestor(db, kind, id);
    return {
      state,
      archived: true,
      deleted: false,
      archive: false,
      delete: false,
      cancel: false,
      restore,
      blockedReason: restore ? null : 'An ancestor is archived; restore it first.',
    };
  }

  if (state === 'running') {
    return { state, archived: false, deleted: false, archive: false, delete: false, cancel: true, restore: false, blockedReason: 'It is running; cancel it first.' };
  }

  const archive = canArchive(state);
  const decision = deleteDecision(db, kind, id, state);
  return {
    state,
    archived: false,
    deleted: false,
    archive,
    delete: decision.delete,
    cancel: false,
    restore: false,
    blockedReason: decision.delete ? null : decision.reason,
  };
}
