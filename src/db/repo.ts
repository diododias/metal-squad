import { existsSync } from 'node:fs';
import { getDb } from './index.js';
import type { TokenUsage } from '../core/adapters/types.js';
import { resolveDbPath } from '../config/index.js';
import { msqEventBus } from '../core/events/index.js';
import type { OutputSource, OutputStream, RunOutputEvent, TokensUpdateEvent } from '../core/events/types.js';

export function registerRepo(repoId: string, path: string): void {
  getDb('readwrite')
    .prepare(
      `INSERT INTO repos (repo_id, path) VALUES (?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET path = excluded.path`,
    )
    .run(repoId, path);
}

export interface CreateRunOptions {
  pipelineId?: number;
  stage?: string;
}

export function createRun(
  repoId: string,
  featureId: string,
  tool: string,
  opts: CreateRunOptions = {},
): number {
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO runs (repo_id, feature_id, tool, pipeline_id, stage)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(repoId, featureId, tool, opts.pipelineId ?? null, opts.stage ?? null);
  return Number(info.lastInsertRowid);
}

export function finishRun(
  runId: number,
  status: 'done' | 'failed' | 'blocked',
  summary?: string,
): void {
  getDb('readwrite')
    .prepare(`UPDATE runs SET status = ?, summary = ?, ended_at = datetime('now') WHERE id = ?`)
    .run(status, summary ?? null, runId);
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
  getDb('readwrite')
    .prepare(`INSERT INTO token_usage (run_id, input, output, total) VALUES (?, ?, ?, ?)`)
    .run(runId, usage.input, usage.output, usage.total);
}

export function updateRunUsage(runId: number, usage: TokenUsage | TokensUpdateEvent): void {
  getDb('readwrite')
    .prepare(
      `UPDATE runs
       SET input_tokens = ?, output_tokens = ?, total_tokens = ?
       WHERE id = ?`,
    )
    .run(usage.input, usage.output, usage.total, runId);
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
}

export function appendRunOutput(event: RunOutputEvent): void {
  getDb('readwrite')
    .prepare(
      `INSERT INTO run_output (run_id, feature_id, tool, stream, source, line)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.runId,
      event.featureId ?? '',
      event.tool ?? 'tool',
      event.stream,
      event.source ?? event.stream,
      event.line,
    );
}

export function listRunOutput(runId: number, limit = 120): RunOutputRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT id, run_id AS runId, feature_id AS featureId, tool, stream, source, line, created_at AS createdAt
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
      `SELECT r.*, u.total
         FROM runs r
         LEFT JOIN token_usage u ON u.run_id = r.id
        ORDER BY r.id DESC
        LIMIT ?`,
    )
    .all(limit) as RunRow[];
}

// T002: RunSummary interface
export interface RunSummary {
  runId: number;
  repoId: string;
  featureId: string;
  tool: 'claude' | 'codex' | 'opencode';
  pipelineId: number | null;
  stage: string | null;
  status: 'running' | 'done' | 'failed' | 'blocked';
  startedAt: string;
  endedAt: string | null;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  gateId: number | null;
  gateDecision: string | null;
}

// T003: listRunsForTui — most recent run per feature per repo (US2 deduplication via CTE)
export function listRunsForTui(limit = 50): RunSummary[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `WITH latest AS (
         SELECT MAX(id) AS id
         FROM runs
         GROUP BY repo_id, feature_id
       )
       SELECT
         r.id          AS runId,
         r.repo_id     AS repoId,
         r.feature_id  AS featureId,
         r.tool,
         r.pipeline_id AS pipelineId,
         r.stage       AS stage,
         r.status,
         r.started_at  AS startedAt,
         r.ended_at      AS endedAt,
         COALESCE(r.total_tokens, u.total) AS totalTokens,
         r.input_tokens  AS inputTokens,
         r.output_tokens AS outputTokens,
         g.id            AS gateId,
         g.decision    AS gateDecision
       FROM runs r
       JOIN latest ON latest.id = r.id
       LEFT JOIN token_usage u ON u.run_id = r.id
       LEFT JOIN gates g ON g.run_id = r.id AND g.resolved_at IS NULL
       ORDER BY r.id DESC
       LIMIT ?`,
    )
    .all(limit) as RunSummary[];
}

// T004: GateRow and GateDecision types
export type GateDecision = 'approved' | 'skipped' | 'retried';

export interface GateRow {
  id: number;
  runId: number;
  featureId: string;
  repoId: string;
  createdAt: string;
  resolvedAt: string | null;
  decision: GateDecision | null;
}

// T005: openGates — SELECT WHERE resolved_at IS NULL, ORDER BY created_at ASC
export function openGates(): GateRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT
         id,
         run_id    AS runId,
         feature_id AS featureId,
         repo_id   AS repoId,
         created_at AS createdAt,
         resolved_at AS resolvedAt,
         decision
       FROM gates
       WHERE resolved_at IS NULL
       ORDER BY created_at ASC`,
    )
    .all() as GateRow[];
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
    msqEventBus.emit('gate:resolved', { gateId: id, decision });
  }
}

// T007: createGate — INSERT, returns new gate id
export function createGate(runId: number, featureId: string, repoId: string): number {
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO gates (run_id, feature_id, repo_id) VALUES (?, ?, ?)`,
    )
    .run(runId, featureId, repoId);
  const gateId = Number(info.lastInsertRowid);
  msqEventBus.emit('gate:created', { gateId, runId, featureId, repoId });
  return gateId;
}

export function createRetryRecord(runId: number, attempt: number, error?: string): void {
  getDb('readwrite')
    .prepare(
      `INSERT INTO retry_history (run_id, attempt, error)
       VALUES (?, ?, ?)`,
    )
    .run(runId, attempt, error ?? null);
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
              started_at AS startedAt, ended_at AS endedAt
       FROM task_runs
       WHERE run_id = ?
       ORDER BY id ASC`,
    )
    .all(runId) as TaskRun[];
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
  status: 'running' | 'done' | 'failed' | 'blocked';
  currentStage: string | null;
  autoAdvance: number;
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
  stage: string;
  kind: StageRequestKind;
  prompt: string;
  status: 'pending' | 'resolved';
  response: string | null;
  source: 'manual' | 'auto';
  createdAt: string;
  resolvedAt: string | null;
}

export function createPipeline(repoId: string, featureId: string, autoAdvance: boolean): number {
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO pipelines (repo_id, feature_id, auto_advance)
       VALUES (?, ?, ?)`,
    )
    .run(repoId, featureId, autoAdvance ? 1 : 0);
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
  status: PipelineRow['status'],
): void {
  getDb('readwrite')
    .prepare(
      `UPDATE pipelines
       SET status = ?, updated_at = datetime('now'), ended_at = datetime('now')
       WHERE id = ?`,
    )
    .run(status, pipelineId);
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
  } = {},
): number {
  const status = opts.response ? 'resolved' : 'pending';
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO stage_requests
         (pipeline_id, run_id, feature_id, stage, kind, prompt, status, response, source, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      pipelineId,
      opts.runId ?? null,
      featureId,
      stage,
      kind,
      prompt,
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
  if (row && row.status === 'pending') {
    msqEventBus.emit('stage:request-resolved', {
      requestId: id,
      kind: row.kind,
      response,
    });
  }
}

export function getStageRequest(id: number): StageRequestRow | null {
  if (!hasDbFile()) return null;
  return (getDb('readonly')
    .prepare(
      `SELECT
         id,
         pipeline_id AS pipelineId,
         run_id AS runId,
         feature_id AS featureId,
         stage,
         kind,
         prompt,
         status,
         response,
         source,
         created_at AS createdAt,
         resolved_at AS resolvedAt
       FROM stage_requests
       WHERE id = ?`,
    )
    .get(id) as StageRequestRow | undefined) ?? null;
}
