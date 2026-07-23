import { existsSync } from 'node:fs';
import { resolveDbPath } from '../config/index.js';
import { getDb } from './index.js';
import { computeTokenBaseline, isTokenOutlier } from '../core/stats.js';

export type AnalyticsMetricsConfidence = 'exact' | 'derived' | 'unknown';
export type AnalyticsBucket = 'hour' | 'day' | 'week' | 'month';
export type AnalyticsDataQualityFilter = AnalyticsMetricsConfidence | 'missing-snapshot' | 'missing-tokens';
export const ANALYTICS_UNSCOPED = 'unknown/unscoped';
export const ANALYTICS_UNKNOWN_MODEL = 'unknown model';
export const ANALYTICS_UNKNOWN_STAGE = 'unknown stage';

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
}

/** A deliberately bounded raw-run projection used only by the Analytics
 * drilldown action. It never belongs in the regular WebSocket snapshot. */
export interface AnalyticsRunDrilldownRow {
  runId: number;
  workItemId: string;
  projectId: string | null;
  epicId: string | null;
  repoId: string;
  tool: string;
  model: string | null;
  status: string;
  stage: string | null;
  startedAt: string;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  contextWindowPercent: number | null;
  confidence: AnalyticsMetricsConfidence;
}

export interface AnalyticsPagination { limit?: number; offset?: number; }
export type AnalyticsWorkItemSort = keyof Pick<AnalyticsWorkItemRow,
  'workItemId' | 'totalTokens' | 'inputTokens' | 'cachedInputTokens' | 'outputTokens' | 'runs' | 'wasteTokens' | 'successRatePercent'>;
export interface AnalyticsSort { by?: AnalyticsWorkItemSort; direction?: 'asc' | 'desc'; }

export interface AnalyticsTokenGroup extends AnalyticsMetrics {
  key: string;
  /** Runs whose retry history records a different tool from the final tool. */
  fallbackRuns: number;
}

/** @deprecated Use AnalyticsTokenGroup for new analytics contracts. */
export type TokenGroup = AnalyticsTokenGroup;

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

export interface AnalyticsPeriodComparison {
  current: AnalyticsSummary;
  previous: AnalyticsSummary;
  totalTokensDelta: number;
  averageTokensPerRunDelta: number | null;
  wasteTokensDelta: number;
  successRatePercentDelta: number | null;
}

export interface AnalyticsForecast {
  periodDays: number;
  tokensPerDay: number;
  tokensPerWeek: number;
  tokensPerDoneWorkItem: number | null;
  doneWorkItems: number;
  budgetLimitTokens: number | null;
  remainingTokens: number | null;
  estimatedDaysToLimit: number | null;
  estimatedLimitAt: string | null;
  status: 'available' | 'unavailable' | 'exceeded';
  cost: { status: 'unavailable'; amount: null; currency: null };
}

export interface AnalyticsExportDataset {
  schemaVersion: 1;
  generatedAt: string;
  filters: AnalyticsFilters;
  summary: AnalyticsSummary;
  dataQuality: AnalyticsDataQuality;
  forecast: AnalyticsForecast;
  comparison: AnalyticsPeriodComparison;
  workItems: AnalyticsWorkItemRow[];
}

export type AnalyticsInsightKind = 'waste' | 'outlier' | 'growth' | 'efficiency' | 'context' | 'data_quality';
export interface AnalyticsInsight {
  id: string;
  kind: AnalyticsInsightKind;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  evidence: string;
  observedTokens: number;
  baselineTokens: number | null;
  filters: Pick<AnalyticsFilters, 'workItemId' | 'tool' | 'model' | 'status'>;
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
  if (filters.from) { clauses.push('r.started_at >= datetime(?)'); params.push(filters.from); }
  if (filters.to) { clauses.push('r.started_at <= datetime(?)'); params.push(filters.to); }
  add('r.project_id', filters.projectId);
  add('r.epic_id', filters.epicId);
  add('r.repo_id', filters.repoId);
  add('r.feature_id', filters.workItemId);
  add('r.tool', filters.tool);
  if (filters.model === ANALYTICS_UNKNOWN_MODEL) clauses.push(`(r.model IS NULL OR r.model = '')`);
  else add('r.model', filters.model);
  add('r.status', filters.status);
  if (filters.stage === ANALYTICS_UNKNOWN_STAGE) clauses.push(`(r.stage IS NULL OR r.stage = '')`);
  else add('r.stage', filters.stage);
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
      SELECT r.id, r.repo_id AS repoId, r.project_id AS projectId, r.epic_id AS epicId,
             r.feature_id AS workItemId, r.tool, r.model, r.effort, r.thinking, r.status, r.stage, r.started_at AS startedAt,
             COALESCE(r.input_tokens, lu.input, 0) AS inputTokens,
             COALESCE(r.cached_input_tokens, lu.cachedInput, 0) AS cachedInputTokens,
             COALESCE(r.output_tokens, lu.output, 0) AS outputTokens,
             COALESCE(r.total_tokens, lu.total, 0) AS totalTokens,
             CASE WHEN r.total_tokens IS NULL AND lu.total IS NULL THEN 1 ELSE 0 END AS missingTokens,
             r.context_window_percent AS contextWindowPercent,
             CASE WHEN EXISTS (
               SELECT 1 FROM retry_history rh
               WHERE rh.run_id = r.id AND rh.tool IS NOT NULL AND rh.tool != r.tool
             ) THEN 1 ELSE 0 END AS hasFallback,
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
             MIN(repoId) AS repoId, ${METRICS_COLUMNS}, SUM(hasFallback) AS fallbackRuns
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
    wasteTokens: 'wasteTokens', successRatePercent: 'successRatePercent',
  };
  const by = sortable[sort.by ?? 'totalTokens'];
  const direction = sort.direction === 'asc' ? 'ASC' : 'DESC';
  const query = aggregateQuery('workItemId', filters, `${by} ${direction}, groupKey ASC`);
  const sql = `${query.sql} LIMIT ? OFFSET ?`;
  const rows = getDb('readonly').prepare(sql).all(...query.params, limit, offset) as Record<string, unknown>[];
  return rows.map((row) => ({
    ...toMetrics(row), workItemId: stringValue(row.groupKey), projectId: stringValue(row.projectId),
    epicId: stringValue(row.epicId), repoId: stringValue(row.repoId),
  }));
}

export function listAnalyticsRunDrilldown(filters: AnalyticsFilters = {}, pagination: AnalyticsPagination = {}): AnalyticsRunDrilldownRow[] {
  if (!databaseExists()) return [];
  const limit = Math.max(1, Math.min(pagination.limit ?? 50, 200));
  const offset = Math.max(0, pagination.offset ?? 0);
  const { cte, params } = filteredRuns(filters);
  const rows = getDb('readonly').prepare(`${cte}
    SELECT id AS runId, workItemId, projectId, epicId, repoId, tool, model, status, stage, startedAt,
      totalTokens, inputTokens, cachedInputTokens, outputTokens, contextWindowPercent, metricsConfidence
    FROM filtered ORDER BY startedAt DESC, runId DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];
  return rows.map((row) => ({
    runId: Number(row.runId), workItemId: stringValue(row.workItemId),
    projectId: nullableStringValue(row.projectId), epicId: nullableStringValue(row.epicId), repoId: stringValue(row.repoId),
    tool: stringValue(row.tool), model: nullableStringValue(row.model), status: stringValue(row.status), stage: nullableStringValue(row.stage),
    startedAt: stringValue(row.startedAt), totalTokens: Number(row.totalTokens ?? 0), inputTokens: Number(row.inputTokens ?? 0),
    cachedInputTokens: Number(row.cachedInputTokens ?? 0), outputTokens: Number(row.outputTokens ?? 0),
    contextWindowPercent: row.contextWindowPercent === null ? null : Number(row.contextWindowPercent ?? 0),
    confidence: row.metricsConfidence === 'derived' || row.metricsConfidence === 'unknown' ? row.metricsConfidence : 'exact',
  }));
}

export function getTokenTimeSeries(filters: AnalyticsFilters = {}, bucket: AnalyticsBucket = 'day'): TokenTimeBucket[] {
  if (!databaseExists()) return [];
  const format: Record<AnalyticsBucket, string> = { hour: '%Y-%m-%d %H:00:00', day: '%Y-%m-%d', week: '%Y-W%W', month: '%Y-%m' };
  const query = aggregateQuery(`strftime('${format[bucket]}', startedAt)`, filters, 'groupKey ASC');
  const rows = getDb('readonly').prepare(query.sql).all(...query.params) as Record<string, unknown>[];
  return rows.map((row) => ({ ...toMetrics(row), bucket: stringValue(row.groupKey) }));
}

export function getTokenBreakdowns(filters: AnalyticsFilters = {}, rankingLimit = 100): {
  byProject: AnalyticsTokenGroup[]; byEpic: AnalyticsTokenGroup[]; byRepository: AnalyticsTokenGroup[]; byWorkItem: AnalyticsTokenGroup[];
  byTool: AnalyticsTokenGroup[]; byModel: AnalyticsTokenGroup[]; byStage: AnalyticsTokenGroup[]; byEffort: AnalyticsTokenGroup[]; byThinking: AnalyticsTokenGroup[]; byStatus: AnalyticsTokenGroup[];
} {
  const limit = Math.max(1, Math.min(rankingLimit, 500));
  const groups: Record<string, string> = {
    byProject: `COALESCE(projectId, '${ANALYTICS_UNSCOPED}')`, byEpic: `COALESCE(epicId, '${ANALYTICS_UNSCOPED}')`,
    byRepository: 'repoId', byWorkItem: 'workItemId', byTool: 'tool',
    byModel: `COALESCE(NULLIF(model, ''), '${ANALYTICS_UNKNOWN_MODEL}')`, byStage: `COALESCE(NULLIF(stage, ''), '${ANALYTICS_UNKNOWN_STAGE}')`,
    byEffort: `COALESCE(NULLIF(effort, ''), 'unknown effort')`, byThinking: `COALESCE(NULLIF(thinking, ''), 'unknown thinking')`, byStatus: 'status',
  };
  const result: Record<string, AnalyticsTokenGroup[]> = {};
  if (!databaseExists()) return {
    byProject: [], byEpic: [], byRepository: [], byWorkItem: [], byTool: [], byModel: [], byStage: [], byEffort: [], byThinking: [], byStatus: [],
  };
  for (const [name, expression] of Object.entries(groups)) {
    const query = aggregateQuery(expression, filters, 'totalTokens DESC, groupKey ASC', limit);
    const rows = getDb('readonly').prepare(query.sql).all(...query.params) as Record<string, unknown>[];
    result[name] = rows.map((row) => ({ ...toMetrics(row), key: stringValue(row.groupKey), fallbackRuns: Number(row.fallbackRuns ?? 0) }));
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

function periodDays(filters: AnalyticsFilters): number {
  if (filters.sinceDays !== undefined) return Math.max(1, filters.sinceDays);
  if (filters.from && filters.to) {
    const from = Date.parse(filters.from);
    const to = Date.parse(filters.to);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) return Math.max(1, Math.ceil((to - from) / 86_400_000));
  }
  return 1;
}

function previousPeriodFilters(filters: AnalyticsFilters): AnalyticsFilters {
  const days = periodDays(filters);
  if (filters.sinceDays !== undefined) {
    const end = new Date(Date.now() - days * 86_400_000).toISOString();
    const start = new Date(Date.now() - days * 2 * 86_400_000).toISOString();
    const { sinceDays: _sinceDays, ...rest } = filters;
    return { ...rest, from: start, to: end };
  }
  if (filters.from && filters.to) {
    const from = Date.parse(filters.from);
    const to = Date.parse(filters.to);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      const duration = to - from;
      const { from: _from, to: _to, ...rest } = filters;
      return { ...rest, from: new Date(from - duration).toISOString(), to: new Date(from).toISOString() };
    }
  }
  return { ...filters, from: new Date(Date.now() - 2 * 86_400_000).toISOString(), to: new Date(Date.now() - 86_400_000).toISOString() };
}

export function getAnalyticsForecast(filters: AnalyticsFilters = {}, budgetLimitTokens?: number): AnalyticsForecast {
  const summary = getAnalyticsSummary(filters);
  const days = periodDays(filters);
  const perDay = summary.totalTokens / days;
  let doneWorkItems = 0;
  if (databaseExists()) {
    const { cte, params } = filteredRuns(filters);
    const row = getDb('readonly').prepare(`${cte}
      SELECT COUNT(DISTINCT workItemId) AS doneWorkItems FROM filtered
      WHERE status = 'done' AND workItemId IS NOT NULL`).get(...params) as Record<string, unknown>;
    doneWorkItems = Number(row.doneWorkItems ?? 0);
  }
  const limit = budgetLimitTokens ?? null;
  const remaining = limit === null ? null : Math.max(0, limit - summary.totalTokens);
  const exceeded = limit !== null && summary.totalTokens >= limit;
  const estimatedDays = limit === null || perDay <= 0 || exceeded ? null : Math.ceil((remaining ?? 0) / perDay);
  return {
    periodDays: days, tokensPerDay: perDay, tokensPerWeek: perDay * 7,
    tokensPerDoneWorkItem: doneWorkItems ? summary.totalTokens / doneWorkItems : null,
    doneWorkItems, budgetLimitTokens: limit, remainingTokens: remaining,
    estimatedDaysToLimit: estimatedDays,
    estimatedLimitAt: estimatedDays === null ? null : new Date(Date.now() + estimatedDays * 86_400_000).toISOString(),
    status: exceeded ? 'exceeded' : limit === null ? 'unavailable' : 'available',
    // Pricing profiles are intentionally not inferred: ANA-02 must provide a versioned table.
    cost: { status: 'unavailable', amount: null, currency: null },
  };
}

export function getAnalyticsPeriodComparison(filters: AnalyticsFilters = {}): AnalyticsPeriodComparison {
  const current = getAnalyticsSummary(filters);
  const previous = getAnalyticsSummary(previousPeriodFilters(filters));
  const currentAverage = current.runs ? current.totalTokens / current.runs : null;
  const previousAverage = previous.runs ? previous.totalTokens / previous.runs : null;
  return {
    current, previous,
    totalTokensDelta: current.totalTokens - previous.totalTokens,
    averageTokensPerRunDelta: currentAverage === null || previousAverage === null ? null : currentAverage - previousAverage,
    wasteTokensDelta: current.wasteTokens - previous.wasteTokens,
    successRatePercentDelta: current.successRatePercent === null || previous.successRatePercent === null ? null : current.successRatePercent - previous.successRatePercent,
  };
}

/** Export intentionally projects analytics aggregates only. Physical run fields
 * (branch, commit, PR URL and local paths) never enter this dataset. */
export function getAnalyticsExportDataset(filters: AnalyticsFilters = {}, budgetLimitTokens?: number): AnalyticsExportDataset {
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), filters,
    summary: getAnalyticsSummary(filters), dataQuality: getAnalyticsDataQuality(filters),
    forecast: getAnalyticsForecast(filters, budgetLimitTokens), comparison: getAnalyticsPeriodComparison(filters),
    workItems: listAnalyticsWorkItems(filters, { limit: 200 }, { by: 'totalTokens', direction: 'desc' }),
  };
}

/** Insight ranking intentionally operates on physical runs. A pipeline total is
 * never joined or added here, so retries/resumes cannot be counted twice. */
export function getAnalyticsInsights(filters: AnalyticsFilters = {}, limit = 12): AnalyticsInsight[] {
  if (!databaseExists()) return [];
  const { cte, params } = filteredRuns(filters);
  const rows = getDb('readonly').prepare(`${cte}
    SELECT filtered.*, r.pipeline_id AS pipelineId,
      (SELECT COUNT(*) FROM retry_history rh WHERE rh.run_id = filtered.id) AS retryCount,
      (SELECT COUNT(*) FROM run_events re WHERE re.run_id = filtered.id AND re.event IN ('gate_wait', 'retry')) AS loopCount
    FROM filtered JOIN runs r ON r.id = filtered.id
    ORDER BY totalTokens DESC, id DESC`).all(...params) as Record<string, unknown>[];
  const known = rows.filter((row) => row.metricsConfidence !== 'unknown').map((row) => Number(row.totalTokens ?? 0));
  const baseline = computeTokenBaseline(known);
  const insights: AnalyticsInsight[] = [];
  for (const row of rows) {
    const tokens = Number(row.totalTokens ?? 0);
    const runId = Number(row.id);
    const workItemId = stringValue(row.workItemId);
    const tool = stringValue(row.tool);
    const model = nullableStringValue(row.model) ?? ANALYTICS_UNKNOWN_MODEL;
    const status = stringValue(row.status);
    if (['failed', 'blocked', 'aborted'].includes(status) && tokens > 0) {
      insights.push({ id: `waste-${String(runId)}`, kind: 'waste', severity: tokens >= (baseline.p95 ?? Infinity) ? 'critical' : 'warning', title: `${status} run consumed ${String(tokens)} tokens`, evidence: `Run ${String(runId)}; status ${status}; counted once as a physical attempt.`, observedTokens: tokens, baselineTokens: baseline.average, filters: { workItemId, tool, model, status } });
    }
    if (row.metricsConfidence !== 'unknown' && isTokenOutlier(tokens, baseline)) {
      insights.push({ id: `outlier-${String(runId)}`, kind: 'outlier', severity: tokens >= (baseline.p99 ?? Infinity) ? 'critical' : 'warning', title: `Run ${String(runId)} is above the P95 token baseline`, evidence: `Observed ${String(tokens)}; period P95 ${String(baseline.p95)}; average ${String(Math.round(baseline.average ?? 0))}.`, observedTokens: tokens, baselineTokens: baseline.p95, filters: { workItemId, tool, model } });
    }
    if (Number(row.contextWindowPercent ?? 0) >= 80) {
      insights.push({ id: `context-${String(runId)}`, kind: 'context', severity: Number(row.contextWindowPercent) >= 95 ? 'critical' : 'warning', title: `Context window reached ${String(Number(row.contextWindowPercent))}%`, evidence: `Run ${String(runId)}; threshold 80%; observed ${String(Number(row.contextWindowPercent))}%.`, observedTokens: tokens, baselineTokens: 80, filters: { workItemId, tool, model } });
    }
    if (Number(row.retryCount ?? 0) > 0 || Number(row.loopCount ?? 0) >= 3) {
      insights.push({ id: `loop-${String(runId)}`, kind: 'waste', severity: Number(row.retryCount ?? 0) >= 2 ? 'critical' : 'warning', title: `Repeated retry/gate activity on run ${String(runId)}`, evidence: `${String(Number(row.retryCount ?? 0))} retries and ${String(Number(row.loopCount ?? 0))} retry/gate events; tokens remain counted only on this run.`, observedTokens: tokens, baselineTokens: baseline.average, filters: { workItemId, tool, model, status } });
    }
    if (row.metricsConfidence === 'unknown') {
      insights.push({ id: `quality-${String(runId)}`, kind: 'data_quality', severity: 'warning', title: `Unknown telemetry on run ${String(runId)}`, evidence: 'Excluded from percentile and average comparisons; the run remains visible for investigation.', observedTokens: tokens, baselineTokens: null, filters: { workItemId, tool, model, status } });
    }
  }
  const comparable = rows.filter((row) => row.metricsConfidence !== 'unknown' && Number(row.totalTokens ?? 0) >= 0);
  const byToolModel = new Map<string, number[]>();
  for (const row of comparable) {
    const key = `${stringValue(row.tool)}\u0000${nullableStringValue(row.model) ?? ANALYTICS_UNKNOWN_MODEL}`;
    const values = byToolModel.get(key) ?? [];
    values.push(Number(row.totalTokens ?? 0)); byToolModel.set(key, values);
  }
  for (const [key, values] of byToolModel) {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (values.length >= 2 && baseline.average !== null && average >= baseline.average * 1.5) {
      const [tool = '', model = ANALYTICS_UNKNOWN_MODEL] = key.split('\u0000');
      insights.push({ id: `efficiency-${key}`, kind: 'efficiency', severity: average >= baseline.average * 2 ? 'critical' : 'warning', title: `${tool}/${model} has elevated average tokens per run`, evidence: `${String(values.length)} comparable runs; average ${String(Math.round(average))} versus period average ${String(Math.round(baseline.average))}.`, observedTokens: Math.round(average), baselineTokens: baseline.average, filters: { tool, model } });
    }
  }
  const timestamps = comparable.map((row) => Date.parse(stringValue(row.startedAt))).filter(Number.isFinite);
  if (timestamps.length >= 4) {
    const midpoint = (Math.min(...timestamps) + Math.max(...timestamps)) / 2;
    const byWorkItem = new Map<string, { before: number[]; after: number[] }>();
    for (const row of comparable) {
      const entry = byWorkItem.get(stringValue(row.workItemId)) ?? { before: [], after: [] };
      (Date.parse(stringValue(row.startedAt)) >= midpoint ? entry.after : entry.before).push(Number(row.totalTokens ?? 0));
      byWorkItem.set(stringValue(row.workItemId), entry);
    }
    for (const [workItemId, samples] of byWorkItem) {
      if (!samples.before.length || !samples.after.length) continue;
      const before = samples.before.reduce((sum, value) => sum + value, 0) / samples.before.length;
      const after = samples.after.reduce((sum, value) => sum + value, 0) / samples.after.length;
      if (after >= before * 1.5 && after > 0) insights.push({ id: `growth-${workItemId}`, kind: 'growth', severity: after >= before * 2 ? 'critical' : 'warning', title: `${workItemId} token use grew sharply`, evidence: `Recent-half average ${String(Math.round(after))} versus prior-half average ${String(Math.round(before))}.`, observedTokens: Math.round(after), baselineTokens: Math.round(before), filters: { workItemId } });
    }
  }
  return insights.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.observedTokens - a.observedTokens).slice(0, Math.max(1, limit));
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

function severityRank(value: AnalyticsInsight['severity']): number { return value === 'critical' ? 2 : value === 'warning' ? 1 : 0; }
