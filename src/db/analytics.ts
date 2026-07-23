import { existsSync } from 'node:fs';
import { resolveDbPath } from '../config/index.js';
import { getDb } from './index.js';

export type AnalyticsMetricsConfidence = 'exact' | 'derived' | 'unknown';
export type AnalyticsBucket = 'hour' | 'day' | 'week' | 'month';
export type AnalyticsDataQualityFilter = AnalyticsMetricsConfidence | 'missing-snapshot' | 'missing-tokens';
export const ANALYTICS_UNSCOPED = 'unknown/unscoped';

/** Filters intentionally separate from StatsFilters: analytics has a broader,
 * stable contract and must not alter the legacy TUI/stats scope. */
export interface AnalyticsFilters {
  sinceDays?: number;
  from?: string;
  to?: string;
  projectId?: string;
  epicId?: string;
  repoId?: string;
  workItemId?: string;
  tool?: string;
  model?: string;
  status?: string;
  stage?: string;
  dataQuality?: AnalyticsDataQualityFilter;
}

export interface AnalyticsMetrics {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  runs: number;
  successRatePercent: number | null;
  wasteTokens: number;
  contextAvgPercent: number | null;
  contextMaxPercent: number | null;
  contextP95Percent: number | null;
  confidence: AnalyticsMetricsConfidence;
}

export type AnalyticsSummary = AnalyticsMetrics;

export interface AnalyticsWorkItemRow extends AnalyticsMetrics {
  workItemId: string;
  projectId: string;
  epicId: string;
  repoId: string;
  doneRuns: number;
  failedRuns: number;
  blockedRuns: number;
  abortedRuns: number;
  lastRunAt: string | null;
  derivedStatus: string;
  dominantTool: string;
  dominantModel: string;
}

/** A deliberately bounded raw-run projection used only by the Analytics
 * drilldown action. It never belongs in the regular WebSocket snapshot. */
export interface AnalyticsRunDrilldownRow {
  runId: number;
  pipelineId: number | null;
  workItemId: string;
  projectId: string | null;
  epicId: string | null;
  repoId: string;
  tool: string;
  model: string | null;
  status: string;
  stage: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  summary: string | null;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  usefulTokens: number;
  wasteTokens: number;
  hasTokenTelemetry: boolean;
  contextWindowPercent: number | null;
  confidence: AnalyticsMetricsConfidence;
  tasks: AnalyticsTaskDrilldownRow[];
  retries: AnalyticsRetryDrilldownRow[];
  events: AnalyticsRunEventDrilldownRow[];
}

export interface AnalyticsTaskDrilldownRow {
  taskId: string;
  title: string;
  status: string;
  stage: string | null;
  startedAt: string | null;
  endedAt: string | null;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  contextWindowPercent: number | null;
}

export interface AnalyticsRetryDrilldownRow {
  attempt: number;
  tool: string | null;
  model: string | null;
  error: string | null;
  retriedAt: string;
}

export interface AnalyticsRunEventDrilldownRow {
  event: string;
  createdAt: string;
}

export interface AnalyticsPagination { limit?: number; offset?: number; }
export type AnalyticsWorkItemSort = keyof Pick<AnalyticsWorkItemRow,
  'workItemId' | 'totalTokens' | 'inputTokens' | 'cachedInputTokens' | 'outputTokens' | 'runs' | 'wasteTokens' | 'successRatePercent' | 'lastRunAt' | 'contextMaxPercent'>;
export interface AnalyticsSort { by?: AnalyticsWorkItemSort; direction?: 'asc' | 'desc'; }

export interface TokenGroup extends AnalyticsMetrics {
  key: string;
}

export interface TokenTimeBucket extends AnalyticsMetrics {
  bucket: string;
}

export interface AnalyticsDataQuality {
  totalRuns: number;
  exactRuns: number;
  derivedRuns: number;
  unknownRuns: number;
  missingTokenRuns: number;
  missingProjectSnapshotRuns: number;
  missingEpicSnapshotRuns: number;
}

interface FilteredQuery {
  cte: string;
  params: (string | number)[];
}

const METRICS_COLUMNS = `
  COALESCE(SUM(totalTokens), 0) AS totalTokens,
  COALESCE(SUM(inputTokens), 0) AS inputTokens,
  COALESCE(SUM(cachedInputTokens), 0) AS cachedInputTokens,
  COALESCE(SUM(outputTokens), 0) AS outputTokens,
  COUNT(*) AS runs,
  CASE WHEN SUM(CASE WHEN status IN ('done', 'failed', 'aborted') THEN 1 ELSE 0 END) = 0 THEN NULL
       ELSE ROUND(100.0 * SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
         / SUM(CASE WHEN status IN ('done', 'failed', 'aborted') THEN 1 ELSE 0 END), 2) END AS successRatePercent,
  COALESCE(SUM(CASE WHEN status IN ('failed', 'blocked', 'aborted') THEN totalTokens ELSE 0 END), 0) AS wasteTokens,
  AVG(contextWindowPercent) AS contextAvgPercent,
  MAX(contextWindowPercent) AS contextMaxPercent,
  SUM(CASE WHEN metricsConfidence = 'exact' THEN 1 ELSE 0 END) AS exactCount,
  SUM(CASE WHEN metricsConfidence = 'derived' THEN 1 ELSE 0 END) AS derivedCount,
  SUM(CASE WHEN metricsConfidence = 'unknown' THEN 1 ELSE 0 END) AS unknownCount`;

function databaseExists(): boolean {
  const path = resolveDbPath();
  return path === ':memory:' || existsSync(path);
}

function filteredRuns(filters: AnalyticsFilters): FilteredQuery {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  const add = (column: string, value: string | undefined): void => {
    if (value) { clauses.push(`${column} = ?`); params.push(value); }
  };
  if (filters.sinceDays !== undefined) {
    clauses.push(`r.started_at >= datetime('now', '-' || ? || ' days')`);
    params.push(filters.sinceDays);
  }
  if (filters.from) { clauses.push('r.started_at >= ?'); params.push(filters.from); }
  if (filters.to) { clauses.push('r.started_at <= ?'); params.push(filters.to); }
  add('r.project_id', filters.projectId);
  add('r.epic_id', filters.epicId);
  add('r.repo_id', filters.repoId);
  add('r.feature_id', filters.workItemId);
  add('r.tool', filters.tool);
  add('r.model', filters.model);
  add('r.status', filters.status);
  add('r.stage', filters.stage);
  if (filters.dataQuality === 'missing-snapshot') clauses.push('(r.project_id IS NULL OR r.epic_id IS NULL)');
  else if (filters.dataQuality === 'missing-tokens') clauses.push('(r.total_tokens IS NULL AND lu.total IS NULL)');
  else if (filters.dataQuality) { clauses.push('r.metrics_confidence = ?'); params.push(filters.dataQuality); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return {
    params,
    cte: `WITH latest_usage AS (
      SELECT u.run_id AS runId, u.input, u.cached_input AS cachedInput, u.output, u.total
      FROM token_usage u
      JOIN (SELECT run_id, MAX(id) AS id FROM token_usage GROUP BY run_id) latest ON latest.id = u.id
    ), filtered AS (
      SELECT r.id, r.pipeline_id AS pipelineId, r.repo_id AS repoId, r.project_id AS projectId, r.epic_id AS epicId,
             r.feature_id AS workItemId, r.tool, r.model, r.status, r.stage, r.started_at AS startedAt,
             r.ended_at AS endedAt, r.summary, r.publish_error AS publishError,
             COALESCE(r.input_tokens, lu.input, 0) AS inputTokens,
             COALESCE(r.cached_input_tokens, lu.cachedInput, 0) AS cachedInputTokens,
             COALESCE(r.output_tokens, lu.output, 0) AS outputTokens,
             COALESCE(r.total_tokens, lu.total, 0) AS totalTokens,
             CASE WHEN r.total_tokens IS NULL AND lu.total IS NULL THEN 1 ELSE 0 END AS missingTokens,
             r.context_window_percent AS contextWindowPercent,
             COALESCE(r.metrics_confidence, 'unknown') AS metricsConfidence
      FROM runs r LEFT JOIN latest_usage lu ON lu.runId = r.id
      ${where}
    )`,
  };
}

function confidence(row: Record<string, unknown>): AnalyticsMetricsConfidence {
  if (Number(row.unknownCount ?? 0) > 0) return 'unknown';
  return Number(row.derivedCount ?? 0) > 0 ? 'derived' : 'exact';
}

function toMetrics(row: Record<string, unknown>): AnalyticsMetrics {
  return {
    totalTokens: Number(row.totalTokens ?? 0), inputTokens: Number(row.inputTokens ?? 0),
    cachedInputTokens: Number(row.cachedInputTokens ?? 0), outputTokens: Number(row.outputTokens ?? 0),
    runs: Number(row.runs ?? 0), successRatePercent: row.successRatePercent === null ? null : Number(row.successRatePercent),
    wasteTokens: Number(row.wasteTokens ?? 0),
    contextAvgPercent: row.contextAvgPercent === null ? null : Number(row.contextAvgPercent),
    contextMaxPercent: row.contextMaxPercent === null ? null : Number(row.contextMaxPercent),
    contextP95Percent: row.contextP95Percent === null ? null : Number(row.contextP95Percent), confidence: confidence(row),
  };
}

function aggregateQuery(groupExpression: string, filters: AnalyticsFilters, orderBy = 'totalTokens DESC', limit?: number): { sql: string; params: (string | number)[] } {
  const { cte, params } = filteredRuns(filters);
  const limitSql = limit === undefined ? '' : ' LIMIT ?';
  return {
    params: limit === undefined ? params : [...params, limit],
    sql: `${cte}, grouped AS (
      SELECT ${groupExpression} AS groupKey, MIN(projectId) AS projectId, MIN(epicId) AS epicId,
             MIN(repoId) AS repoId, ${METRICS_COLUMNS}
      FROM filtered GROUP BY ${groupExpression}
    ), contexts AS (
      SELECT ${groupExpression} AS groupKey, contextWindowPercent,
             ROW_NUMBER() OVER (PARTITION BY ${groupExpression} ORDER BY contextWindowPercent) AS rowNumber,
             COUNT(*) OVER (PARTITION BY ${groupExpression}) AS contextCount
      FROM filtered WHERE contextWindowPercent IS NOT NULL
    ), p95 AS (
      SELECT groupKey, MAX(CASE WHEN rowNumber = CAST((contextCount * 95 + 99) / 100 AS INTEGER)
        THEN contextWindowPercent END) AS contextP95Percent FROM contexts GROUP BY groupKey
    )
    SELECT grouped.*, p95.contextP95Percent FROM grouped LEFT JOIN p95 USING (groupKey)
    ORDER BY ${orderBy}${limitSql}`,
  };
}

export function getAnalyticsSummary(filters: AnalyticsFilters = {}): AnalyticsSummary {
  if (!databaseExists()) return emptyMetrics();
  const query = aggregateQuery(`'summary'`, filters);
  const row = getDb('readonly').prepare(query.sql).get(...query.params) as Record<string, unknown> | undefined;
  return row ? toMetrics(row) : emptyMetrics();
}

export function listAnalyticsWorkItems(filters: AnalyticsFilters = {}, pagination: AnalyticsPagination = {}, sort: AnalyticsSort = {}): AnalyticsWorkItemRow[] {
  if (!databaseExists()) return [];
  const limit = Math.max(1, Math.min(pagination.limit ?? 50, 200));
  const offset = Math.max(0, pagination.offset ?? 0);
  const sortable: Record<AnalyticsWorkItemSort, string> = {
    workItemId: 'groupKey', totalTokens: 'totalTokens', inputTokens: 'inputTokens',
    cachedInputTokens: 'cachedInputTokens', outputTokens: 'outputTokens', runs: 'runs',
    wasteTokens: 'wasteTokens', successRatePercent: 'successRatePercent', lastRunAt: 'lastRunAt', contextMaxPercent: 'contextMaxPercent',
  };
  const by = sortable[sort.by ?? 'totalTokens'];
  const direction = sort.direction === 'asc' ? 'ASC' : 'DESC';
  const { cte, params } = filteredRuns(filters);
  const rows = getDb('readonly').prepare(`${cte}, grouped AS (
    SELECT workItemId AS groupKey, MIN(projectId) AS projectId, MIN(epicId) AS epicId, MIN(repoId) AS repoId,
      ${METRICS_COLUMNS},
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS doneRuns,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedRuns,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blockedRuns,
      SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS abortedRuns
    FROM filtered GROUP BY workItemId
  ), contexts AS (
    SELECT workItemId AS groupKey, contextWindowPercent,
      ROW_NUMBER() OVER (PARTITION BY workItemId ORDER BY contextWindowPercent) AS rowNumber,
      COUNT(*) OVER (PARTITION BY workItemId) AS contextCount
    FROM filtered WHERE contextWindowPercent IS NOT NULL
  ), p95 AS (
    SELECT groupKey, MAX(CASE WHEN rowNumber = CAST((contextCount * 95 + 99) / 100 AS INTEGER)
      THEN contextWindowPercent END) AS contextP95Percent FROM contexts GROUP BY groupKey
  ), latest AS (
    SELECT workItemId AS groupKey, startedAt AS lastRunAt, status AS derivedStatus,
      ROW_NUMBER() OVER (PARTITION BY workItemId ORDER BY startedAt DESC, id DESC) AS rowNumber FROM filtered
  ), toolRank AS (
    SELECT workItemId AS groupKey, tool,
      ROW_NUMBER() OVER (PARTITION BY workItemId ORDER BY COUNT(*) DESC, tool ASC) AS rowNumber FROM filtered GROUP BY workItemId, tool
  ), modelRank AS (
    SELECT workItemId AS groupKey, COALESCE(model, '${ANALYTICS_UNSCOPED}') AS model,
      ROW_NUMBER() OVER (PARTITION BY workItemId ORDER BY COUNT(*) DESC, COALESCE(model, '${ANALYTICS_UNSCOPED}') ASC) AS rowNumber FROM filtered GROUP BY workItemId, COALESCE(model, '${ANALYTICS_UNSCOPED}')
  )
  SELECT grouped.*, p95.contextP95Percent, latest.lastRunAt, latest.derivedStatus,
    toolRank.tool AS dominantTool, modelRank.model AS dominantModel
  FROM grouped
  LEFT JOIN p95 ON p95.groupKey IS grouped.groupKey
  LEFT JOIN latest ON latest.groupKey IS grouped.groupKey AND latest.rowNumber = 1
  LEFT JOIN toolRank ON toolRank.groupKey IS grouped.groupKey AND toolRank.rowNumber = 1
  LEFT JOIN modelRank ON modelRank.groupKey IS grouped.groupKey AND modelRank.rowNumber = 1
  ORDER BY ${by} ${direction}, groupKey ASC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];
  return rows.map((row) => ({
    ...toMetrics(row), workItemId: stringValue(row.groupKey), projectId: stringValue(row.projectId),
    epicId: stringValue(row.epicId), repoId: stringValue(row.repoId),
    doneRuns: Number(row.doneRuns ?? 0), failedRuns: Number(row.failedRuns ?? 0), blockedRuns: Number(row.blockedRuns ?? 0), abortedRuns: Number(row.abortedRuns ?? 0),
    lastRunAt: nullableStringValue(row.lastRunAt), derivedStatus: stringValue(row.derivedStatus),
    dominantTool: stringValue(row.dominantTool), dominantModel: stringValue(row.dominantModel),
  }));
}

export function countAnalyticsWorkItems(filters: AnalyticsFilters = {}): number {
  if (!databaseExists()) return 0;
  const { cte, params } = filteredRuns(filters);
  const row = getDb('readonly').prepare(`${cte} SELECT COUNT(*) AS total FROM (SELECT workItemId FROM filtered GROUP BY workItemId)`).get(...params) as Record<string, unknown>;
  return Number(row.total ?? 0);
}

export function listAnalyticsRunDrilldown(filters: AnalyticsFilters = {}, pagination: AnalyticsPagination = {}): AnalyticsRunDrilldownRow[] {
  if (!databaseExists()) return [];
  const limit = Math.max(1, Math.min(pagination.limit ?? 50, 200));
  const offset = Math.max(0, pagination.offset ?? 0);
  const { cte, params } = filteredRuns(filters);
  const database = getDb('readonly');
  const rows = database.prepare(`${cte}
    SELECT id AS runId, pipelineId, workItemId, projectId, epicId, repoId, tool, model, status, stage, startedAt, endedAt, summary, publishError,
      totalTokens, inputTokens, cachedInputTokens, outputTokens, missingTokens, contextWindowPercent, metricsConfidence,
      CASE WHEN endedAt IS NULL THEN NULL ELSE CAST((julianday(endedAt) - julianday(startedAt)) * 86400000 AS INTEGER) END AS durationMs
    FROM filtered ORDER BY startedAt DESC, runId DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const runIds = rows.map((row) => Number(row.runId));
  const placeholders = runIds.map(() => '?').join(', ');
  const taskRows = database.prepare(`SELECT run_id AS runId, task_id AS taskId, title, status, stage, started_at AS startedAt, ended_at AS endedAt,
    input_tokens AS inputTokens, cached_input_tokens AS cachedInputTokens, output_tokens AS outputTokens, total_tokens AS totalTokens,
    context_window_percent AS contextWindowPercent
    FROM task_runs
    WHERE run_id IN (${placeholders}) AND (input_tokens > 0 OR cached_input_tokens > 0 OR output_tokens > 0 OR total_tokens > 0)
    ORDER BY run_id DESC, id ASC`).all(...runIds) as Record<string, unknown>[];
  const retryRows = database.prepare(`SELECT run_id AS runId, attempt, tool, model, error, retried_at AS retriedAt
    FROM retry_history WHERE run_id IN (${placeholders}) ORDER BY run_id DESC, attempt ASC`).all(...runIds) as Record<string, unknown>[];
  const eventRows = database.prepare(`SELECT run_id AS runId, event, created_at AS createdAt
    FROM run_events WHERE run_id IN (${placeholders})
      AND event IN ('retry', 'blocked_resumed', 'resume_override', 'gate_wait', 'timeout:approval-created', 'timeout:approval-resolved', 'blocked', 'failed')
    ORDER BY run_id DESC, id ASC`).all(...runIds) as Record<string, unknown>[];
  const tasksByRun = new Map<number, AnalyticsTaskDrilldownRow[]>();
  for (const task of taskRows) {
    const runId = Number(task.runId);
    const values = tasksByRun.get(runId) ?? [];
    values.push({ taskId: stringValue(task.taskId), title: stringValue(task.title), status: stringValue(task.status), stage: nullableStringValue(task.stage),
      startedAt: nullableStringValue(task.startedAt), endedAt: nullableStringValue(task.endedAt), totalTokens: Number(task.totalTokens ?? 0),
      inputTokens: Number(task.inputTokens ?? 0), cachedInputTokens: Number(task.cachedInputTokens ?? 0), outputTokens: Number(task.outputTokens ?? 0),
      contextWindowPercent: task.contextWindowPercent === null ? null : Number(task.contextWindowPercent ?? 0) });
    tasksByRun.set(runId, values);
  }
  const retriesByRun = new Map<number, AnalyticsRetryDrilldownRow[]>();
  for (const retry of retryRows) {
    const runId = Number(retry.runId);
    const values = retriesByRun.get(runId) ?? [];
    values.push({ attempt: Number(retry.attempt), tool: nullableStringValue(retry.tool), model: nullableStringValue(retry.model), error: nullableStringValue(retry.error), retriedAt: stringValue(retry.retriedAt) });
    retriesByRun.set(runId, values);
  }
  const eventsByRun = new Map<number, AnalyticsRunEventDrilldownRow[]>();
  for (const event of eventRows) {
    const runId = Number(event.runId);
    const values = eventsByRun.get(runId) ?? [];
    values.push({ event: stringValue(event.event), createdAt: stringValue(event.createdAt) });
    eventsByRun.set(runId, values);
  }
  return rows.map((row) => {
    const runId = Number(row.runId);
    const totalTokens = Number(row.totalTokens ?? 0);
    const isWaste = ['failed', 'blocked', 'aborted'].includes(stringValue(row.status));
    const events = eventsByRun.get(runId) ?? [];
    if (nullableStringValue(row.publishError)) events.push({ event: 'publish_failure', createdAt: nullableStringValue(row.endedAt) ?? stringValue(row.startedAt) });
    return {
    runId, pipelineId: row.pipelineId === null ? null : Number(row.pipelineId), workItemId: stringValue(row.workItemId),
    projectId: nullableStringValue(row.projectId), epicId: nullableStringValue(row.epicId), repoId: stringValue(row.repoId),
    tool: stringValue(row.tool), model: nullableStringValue(row.model), status: stringValue(row.status), stage: nullableStringValue(row.stage),
    startedAt: stringValue(row.startedAt), endedAt: nullableStringValue(row.endedAt), durationMs: row.durationMs === null ? null : Number(row.durationMs), summary: nullableStringValue(row.summary), totalTokens, inputTokens: Number(row.inputTokens ?? 0),
    cachedInputTokens: Number(row.cachedInputTokens ?? 0), outputTokens: Number(row.outputTokens ?? 0),
    usefulTokens: isWaste ? 0 : totalTokens, wasteTokens: isWaste ? totalTokens : 0, hasTokenTelemetry: Number(row.missingTokens ?? 0) === 0,
    contextWindowPercent: row.contextWindowPercent === null ? null : Number(row.contextWindowPercent ?? 0),
    confidence: row.metricsConfidence === 'derived' || row.metricsConfidence === 'unknown' ? row.metricsConfidence : 'exact',
    tasks: tasksByRun.get(runId) ?? [], retries: retriesByRun.get(runId) ?? [], events,
  };
  });
}

export function getTokenTimeSeries(filters: AnalyticsFilters = {}, bucket: AnalyticsBucket = 'day'): TokenTimeBucket[] {
  if (!databaseExists()) return [];
  const format: Record<AnalyticsBucket, string> = { hour: '%Y-%m-%d %H:00:00', day: '%Y-%m-%d', week: '%Y-W%W', month: '%Y-%m' };
  const query = aggregateQuery(`strftime('${format[bucket]}', startedAt)`, filters, 'groupKey ASC');
  const rows = getDb('readonly').prepare(query.sql).all(...query.params) as Record<string, unknown>[];
  return rows.map((row) => ({ ...toMetrics(row), bucket: stringValue(row.groupKey) }));
}

export function getTokenBreakdowns(filters: AnalyticsFilters = {}, rankingLimit = 100): {
  byProject: TokenGroup[]; byEpic: TokenGroup[]; byRepository: TokenGroup[]; byWorkItem: TokenGroup[];
  byTool: TokenGroup[]; byModel: TokenGroup[]; byStage: TokenGroup[]; byStatus: TokenGroup[];
} {
  const limit = Math.max(1, Math.min(rankingLimit, 500));
  const groups: Record<string, string> = {
    byProject: `COALESCE(projectId, '${ANALYTICS_UNSCOPED}')`, byEpic: `COALESCE(epicId, '${ANALYTICS_UNSCOPED}')`,
    byRepository: 'repoId', byWorkItem: 'workItemId', byTool: 'tool',
    byModel: `COALESCE(model, '${ANALYTICS_UNSCOPED}')`, byStage: `COALESCE(stage, '${ANALYTICS_UNSCOPED}')`, byStatus: 'status',
  };
  const result: Record<string, TokenGroup[]> = {};
  if (!databaseExists()) return {
    byProject: [], byEpic: [], byRepository: [], byWorkItem: [], byTool: [], byModel: [], byStage: [], byStatus: [],
  };
  for (const [name, expression] of Object.entries(groups)) {
    const query = aggregateQuery(expression, filters, 'totalTokens DESC, groupKey ASC', limit);
    const rows = getDb('readonly').prepare(query.sql).all(...query.params) as Record<string, unknown>[];
    result[name] = rows.map((row) => ({ ...toMetrics(row), key: stringValue(row.groupKey) }));
  }
  return result as ReturnType<typeof getTokenBreakdowns>;
}

export function getAnalyticsDataQuality(filters: AnalyticsFilters = {}): AnalyticsDataQuality {
  if (!databaseExists()) return { totalRuns: 0, exactRuns: 0, derivedRuns: 0, unknownRuns: 0, missingTokenRuns: 0, missingProjectSnapshotRuns: 0, missingEpicSnapshotRuns: 0 };
  const { cte, params } = filteredRuns(filters);
  const row = getDb('readonly').prepare(`${cte}
    SELECT COUNT(*) AS totalRuns,
      SUM(CASE WHEN metricsConfidence = 'exact' THEN 1 ELSE 0 END) AS exactRuns,
      SUM(CASE WHEN metricsConfidence = 'derived' THEN 1 ELSE 0 END) AS derivedRuns,
      SUM(CASE WHEN metricsConfidence = 'unknown' THEN 1 ELSE 0 END) AS unknownRuns,
      SUM(missingTokens) AS missingTokenRuns,
      SUM(CASE WHEN projectId IS NULL THEN 1 ELSE 0 END) AS missingProjectSnapshotRuns,
      SUM(CASE WHEN epicId IS NULL THEN 1 ELSE 0 END) AS missingEpicSnapshotRuns
    FROM filtered`).get(...params) as Record<string, unknown>;
  return {
    totalRuns: Number(row.totalRuns ?? 0), exactRuns: Number(row.exactRuns ?? 0), derivedRuns: Number(row.derivedRuns ?? 0), unknownRuns: Number(row.unknownRuns ?? 0),
    missingTokenRuns: Number(row.missingTokenRuns ?? 0), missingProjectSnapshotRuns: Number(row.missingProjectSnapshotRuns ?? 0), missingEpicSnapshotRuns: Number(row.missingEpicSnapshotRuns ?? 0),
  };
}

function emptyMetrics(): AnalyticsMetrics {
  return { totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, runs: 0, successRatePercent: null, wasteTokens: 0, contextAvgPercent: null, contextMaxPercent: null, contextP95Percent: null, confidence: 'exact' };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ANALYTICS_UNSCOPED;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
