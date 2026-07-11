import { existsSync } from 'node:fs';
import { getDb } from './index.js';
import type { TokenUsage } from '../core/adapters/types.js';
import { resolveDbPath } from '../config/index.js';
import { msqEventBus } from '../core/events/index.js';
import type { OutputSource, OutputStream, RunOutputEvent, TokensUpdateEvent } from '../core/events/types.js';
import { resolveContextWindow } from '../core/tasks/blocks.js';
import type { Tool } from '../core/backlog/schema.js';

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

export type RunStatus = 'running' | 'done' | 'failed' | 'blocked' | 'aborted';
export type PipelineStatus = 'running' | 'paused' | 'aborting' | 'aborted' | 'done' | 'failed' | 'blocked';

export interface PipelineSnapshot {
  plan: string[];
  done: string[];
  pending: string[];
  active: string[];
  aborted: string[];
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

export function listRunOutputAfterId(runId: number, afterId: number, limit = 200): RunOutputRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
    .prepare(
      `SELECT id, run_id AS runId, feature_id AS featureId, tool, stream, source, line, created_at AS createdAt
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

// T002: RunSummary interface
export interface RunSummary {
  runId: number;
  repoId: string;
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
  pendingStageRequestCreatedAt: string | null;
}

// T003: listRunsForTui — most recent run per feature per repo (US2 deduplication via CTE)
export function listRunsForTui(limit = 50, repoId?: string): RunSummary[] {
  if (!hasDbFile()) return [];
  const repoFilter = repoId ? 'WHERE repo_id = ?' : '';
  const params = repoId ? [repoId, limit] : [limit];
  return getDb('readonly')
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
           SUM(COALESCE(r.input_tokens, lu.input, 0)) AS pipelineInputTokens,
           SUM(COALESCE(r.cached_input_tokens, lu.cachedInput, 0)) AS pipelineCachedInputTokens,
           SUM(COALESCE(r.output_tokens, lu.output, 0)) AS pipelineOutputTokens,
           SUM(COALESCE(r.total_tokens, lu.total, 0)) AS pipelineTotalTokens
         FROM runs r
         LEFT JOIN latest_usage lu ON lu.runId = r.id
         WHERE r.pipeline_id IS NOT NULL
         GROUP BY r.pipeline_id
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
         psr.created_at AS pendingStageRequestCreatedAt
       FROM runs r
       JOIN latest ON latest.id = r.id
       LEFT JOIN latest_usage lu ON lu.runId = r.id
       LEFT JOIN gates g ON g.run_id = r.id AND g.resolved_at IS NULL
       LEFT JOIN pipelines p ON p.id = r.pipeline_id
       LEFT JOIN pipeline_totals pt ON pt.pipelineId = r.pipeline_id
       LEFT JOIN pending_stage_requests psr
         ON psr.pipeline_id = r.pipeline_id
        AND psr.feature_id = r.feature_id
       ORDER BY r.id DESC
       LIMIT ?`,
    )
    .all(...params) as RunSummary[];
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
export function listCompletedFeatureIds(repoId: string): Set<string> {
  if (!hasDbFile()) return new Set();
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
       WHERE repo_id = ?`,
    )
    .all(repoId) as PipelineRow[];
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
  } catch {
    return null;
  }
}

export interface StatsRunRow {
  id: number;
  repoId: string;
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
  if (filters.tool) {
    clauses.push('r.tool = ?');
    params.push(filters.tool);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return getDb('readonly')
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
  stage: string;
  kind: StageRequestKind;
  prompt: string;
  status: 'pending' | 'resolved';
  response: string | null;
  source: 'manual' | 'auto';
  createdAt: string;
  resolvedAt: string | null;
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
         (repo_id, feature_id, auto_advance, cwd, plan_json, done_json, pending_json, active_json, aborted_json, resume_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      repoId,
      featureId,
      autoAdvance ? 1 : 0,
      opts.cwd ?? null,
      encodeJson(snapshot.plan),
      encodeJson(snapshot.done),
      encodeJson(snapshot.pending),
      encodeJson(snapshot.active),
      encodeJson(snapshot.aborted),
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
  };
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
  if (row?.status === 'pending') {
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

export function listPendingStageRequests(): StageRequestRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
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
       WHERE status = 'pending'
       ORDER BY id ASC`,
    )
    .all() as StageRequestRow[];
}

export function listStageRequestsForFeature(
  pipelineId: number,
  featureId: string,
): StageRequestRow[] {
  if (!hasDbFile()) return [];
  return getDb('readonly')
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
       WHERE pipeline_id = ? AND feature_id = ?
       ORDER BY id ASC`,
    )
    .all(pipelineId, featureId) as StageRequestRow[];
}

function encodeJson(value: string[]): string {
  return JSON.stringify(value);
}

function decodeJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
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
