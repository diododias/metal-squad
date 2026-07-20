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
