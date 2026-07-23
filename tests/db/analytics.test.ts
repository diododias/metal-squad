import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('analytics aggregate queries (ANA-03)', () => {
  let directory = '';
  let previousDbPath: string | undefined;
  let resetDb: () => void = () => {};

  beforeEach(() => {
    previousDbPath = process.env.MSQ_DB_PATH;
    directory = mkdtempSync(join(tmpdir(), 'msq-analytics-'));
    process.env.MSQ_DB_PATH = join(directory, 'app.db');
  });

  afterEach(() => {
    resetDb();
    if (previousDbPath === undefined) delete process.env.MSQ_DB_PATH;
    else process.env.MSQ_DB_PATH = previousDbPath;
    rmSync(directory, { recursive: true, force: true });
  });

  async function setup() {
    const dbModule = await import('../../src/db/index.js');
    resetDb = dbModule.resetDb;
    const db = dbModule.getDb('readwrite');
    const analytics = await import('../../src/db/analytics.js');
    db.prepare(`INSERT INTO projects (project_id, name) VALUES ('p1', 'Project')`).run();
    db.prepare(`INSERT INTO repos (repo_id, path) VALUES ('r1', '/tmp/r1'), ('r2', '/tmp/r2')`).run();
    db.prepare(`INSERT INTO project_repos (repo_id, project_id) VALUES ('r1', 'p1')`).run();
    db.prepare(`INSERT INTO backlog_epics (epic_id, project_id, title, position, data_json) VALUES ('e1', 'p1', 'Epic', 0, '{}')`).run();
    db.prepare(`INSERT INTO backlog_features (feature_id, epic_id, repo_id, title, position, data_json) VALUES ('w1', 'e1', 'r1', 'One', 0, '{}'), ('w2', 'e1', 'r1', 'Two', 1, '{}')`).run();
    return { db, ...analytics };
  }

  function insertRun(db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, values: {
    id: number; repoId?: string; projectId?: string | null; epicId?: string | null; workItemId?: string;
    tool?: string; model?: string | null; stage?: string | null; effort?: string | null; thinking?: string | null; status?: string; startedAt: string;
    input?: number | null; cached?: number | null; output?: number | null; total?: number | null; context?: number | null;
    confidence?: string;
  }) {
    db.prepare(`INSERT INTO runs (id, repo_id, project_id, epic_id, feature_id, tool, model, stage, effort, thinking, status, started_at,
      input_tokens, cached_input_tokens, output_tokens, total_tokens, context_window_percent, metrics_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      values.id, values.repoId ?? 'r1', values.projectId === undefined ? 'p1' : values.projectId,
      values.epicId === undefined ? 'e1' : values.epicId, values.workItemId ?? 'w1', values.tool ?? 'codex', values.model === undefined ? 'gpt-5' : values.model,
      values.stage ?? 'implement', values.effort ?? null, values.thinking ?? null, values.status ?? 'done', values.startedAt, values.input === undefined ? 100 : values.input, values.cached === undefined ? 20 : values.cached,
      values.output === undefined ? 50 : values.output, values.total === undefined ? 150 : values.total, values.context === undefined ? 25 : values.context, values.confidence ?? 'exact',
    );
  }

  it('returns filtered metrics, time series and SQL-ranked token groups', async () => {
    const { db, getAnalyticsSummary, getTokenTimeSeries, getTokenBreakdowns } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', total: 100, input: 60, cached: 10, output: 30, context: 10 });
    insertRun(db, { id: 2, startedAt: '2026-07-01 12:00:00', workItemId: 'w2', tool: 'claude', model: 'opus', status: 'failed', total: 300, context: 90, confidence: 'derived' });
    insertRun(db, { id: 3, startedAt: '2026-07-02 10:00:00', repoId: 'r2', projectId: null, epicId: null, workItemId: 'legacy', total: 200, context: null, confidence: 'unknown' });

    expect(getAnalyticsSummary({ projectId: 'p1' })).toMatchObject({
      totalTokens: 400, inputTokens: 160, cachedInputTokens: 30, outputTokens: 80, runs: 2,
      successRatePercent: 50, wasteTokens: 300, contextAvgPercent: 50, contextMaxPercent: 90, contextP95Percent: 90, confidence: 'derived',
    });
    expect(getTokenTimeSeries({ projectId: 'p1' }, 'day')).toEqual([expect.objectContaining({ bucket: '2026-07-01', totalTokens: 400 })]);
    const breakdowns = getTokenBreakdowns({}, 2);
    expect(breakdowns.byEpic).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'e1', totalTokens: 400 })]));
    expect(breakdowns.byEpic).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'unknown/unscoped', totalTokens: 200 })]));
    expect(breakdowns.byTool).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'codex', totalTokens: 300 })]));
  });

  it('keeps every breakdown total consistent with the summary for the same filter', async () => {
    const { db, getAnalyticsSummary, getTokenBreakdowns } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', tool: 'codex', total: 100 });
    insertRun(db, { id: 2, startedAt: '2026-07-01 11:00:00', workItemId: 'w2', tool: 'claude', model: 'opus', total: 200 });
    insertRun(db, { id: 3, startedAt: '2026-07-02 10:00:00', repoId: 'r2', projectId: null, epicId: null, workItemId: 'legacy', model: null, total: 300, confidence: 'unknown' });

    const summary = getAnalyticsSummary();
    const groups = getTokenBreakdowns({}, 50);
    for (const values of Object.values(groups)) {
      expect(values.reduce((total, group) => total + group.totalTokens, 0)).toBe(summary.totalTokens);
      expect(values.reduce((runs, group) => runs + group.runs, 0)).toBe(summary.runs);
    }
  });

  it('paginates sortable work-item rankings and filters data quality', async () => {
    const { db, listAnalyticsWorkItems, getAnalyticsDataQuality } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', workItemId: 'w1', total: 100 });
    insertRun(db, { id: 2, startedAt: '2026-07-02 10:00:00', workItemId: 'w2', total: 300, confidence: 'derived' });
    insertRun(db, { id: 3, startedAt: '2026-07-03 10:00:00', workItemId: 'legacy', epicId: null, projectId: null, total: null, confidence: 'unknown' });

    expect(listAnalyticsWorkItems({}, { limit: 1, offset: 1 }, { by: 'totalTokens', direction: 'desc' })).toEqual([
      expect.objectContaining({ workItemId: 'w1', totalTokens: 100, epicId: 'e1' }),
    ]);
    expect(listAnalyticsWorkItems({ dataQuality: 'missing-snapshot' })).toEqual([
      expect.objectContaining({ workItemId: 'legacy', epicId: 'unknown/unscoped', projectId: 'unknown/unscoped' }),
    ]);
    expect(getAnalyticsDataQuality()).toMatchObject({ totalRuns: 3, exactRuns: 1, derivedRuns: 1, unknownRuns: 1, missingTokenRuns: 1, missingProjectSnapshotRuns: 1, missingEpicSnapshotRuns: 1 });
  });

  it('keeps unknown models separate, groups effort/thinking, and exposes tool fallbacks', async () => {
    const { db, getTokenBreakdowns } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', tool: 'codex', model: 'gpt-5', stage: 'implement', effort: 'high', thinking: 'extended', total: 100 });
    insertRun(db, { id: 2, startedAt: '2026-07-01 11:00:00', tool: 'claude', model: null, stage: 'custom-review', total: 50, confidence: 'unknown' });
    db.prepare(`INSERT INTO retry_history (run_id, attempt, tool, model) VALUES (1, 1, 'claude', 'opus')`).run();

    const breakdowns = getTokenBreakdowns();
    expect(breakdowns.byModel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'gpt-5', totalTokens: 100, confidence: 'exact' }),
      expect.objectContaining({ key: 'unknown model', totalTokens: 50, confidence: 'unknown' }),
    ]));
    expect(breakdowns.byStage).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'custom-review', totalTokens: 50 })]));
    expect(breakdowns.byEffort).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'high', totalTokens: 100 })]));
    expect(breakdowns.byThinking).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'extended', totalTokens: 100 })]));
    expect(breakdowns.byTool).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'codex', fallbackRuns: 1 })]));
    expect(getTokenBreakdowns({ model: 'unknown model' }).byModel).toEqual([expect.objectContaining({ key: 'unknown model', runs: 1 })]);
    expect(getTokenBreakdowns({ stage: 'custom-review' }).byStage).toEqual([expect.objectContaining({ key: 'custom-review', runs: 1 })]);
  });

  it('returns a bounded, newest-first run drilldown only on demand', async () => {
    const { db, listAnalyticsRunDrilldown } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', total: 100 });
    insertRun(db, { id: 2, startedAt: '2026-07-02 10:00:00', workItemId: 'w2', total: 300, confidence: 'derived' });

    expect(listAnalyticsRunDrilldown({ projectId: 'p1' }, { limit: 1, offset: 0 })).toEqual([
      expect.objectContaining({ runId: 2, workItemId: 'w2', totalTokens: 300, confidence: 'derived' }),
    ]);
  });

  it('ranks waste, outliers, retry loops and unknown telemetry without pipeline double counting', async () => {
    const { db, getAnalyticsInsights } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', total: 100, status: 'done' });
    insertRun(db, { id: 2, startedAt: '2026-07-02 10:00:00', total: 1000, status: 'failed' });
    insertRun(db, { id: 3, startedAt: '2026-07-03 10:00:00', total: 50, confidence: 'unknown' });
    db.prepare(`INSERT INTO retry_history (run_id, attempt) VALUES (2, 1), (2, 2)`).run();
    const insights = getAnalyticsInsights();
    expect(insights).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'waste-2', observedTokens: 1000 }),
      expect.objectContaining({ id: 'outlier-2', baselineTokens: 1000 }),
      expect.objectContaining({ id: 'loop-2', observedTokens: 1000 }),
      expect.objectContaining({ id: 'quality-3', kind: 'data_quality' }),
    ]));
    expect(insights.find((insight: { id: string }) => insight.id === 'waste-2')?.observedTokens).toBe(1000);
  });

  it('builds burn forecast, previous-period comparison, and a sanitized aggregate export', async () => {
    const { db, getAnalyticsForecast, getAnalyticsPeriodComparison, getAnalyticsExportDataset } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', total: 700, status: 'done' });
    insertRun(db, { id: 2, startedAt: '2026-06-24 10:00:00', total: 350, status: 'failed' });

    const filters = { from: '2026-07-01 00:00:00', to: '2026-07-08 00:00:00' };
    expect(getAnalyticsForecast(filters, 1_000)).toMatchObject({
      periodDays: 7, tokensPerDay: 100, tokensPerWeek: 700, tokensPerDoneWorkItem: 700,
      budgetLimitTokens: 1_000, remainingTokens: 300, estimatedDaysToLimit: 3, status: 'available',
      cost: { status: 'unavailable', amount: null, currency: null },
    });
    expect(getAnalyticsPeriodComparison(filters)).toMatchObject({ totalTokensDelta: 350, wasteTokensDelta: -350 });
    const exported = getAnalyticsExportDataset(filters, 1_000);
    expect(exported.summary.totalTokens).toBe(700);
    expect(exported.workItems).toEqual([expect.objectContaining({ workItemId: 'w1', totalTokens: 700 })]);
    expect(JSON.stringify(exported)).not.toMatch(/branch_name|commit_sha|pr_url|\/tmp\/r1/);
  });

  it('uses analytic indexes and finishes the documented volume baseline within 1.5 seconds', async () => {
    const { db, getAnalyticsSummary, getTokenBreakdowns, listAnalyticsWorkItems } = await setup();
    const { applyFixtureScenario } = await import('../../src/db/fixtures.js');
    applyFixtureScenario('analytics-volume');
    const filters = { projectId: 'fix-ana-project-1', tool: 'codex', stage: 'plan' };
    const startedAt = performance.now();
    expect(getAnalyticsSummary(filters).runs).toBeGreaterThan(0);
    expect(getTokenBreakdowns(filters, 20).byWorkItem.length).toBeGreaterThan(0);
    expect(listAnalyticsWorkItems(filters, { limit: 50 }).length).toBeGreaterThan(0);
    expect(performance.now() - startedAt).toBeLessThan(1500);
    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM runs WHERE project_id = ? AND started_at >= ? ORDER BY started_at DESC`).all('fix-ana-project-1', '2026-07-01') as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join('\n')).toMatch(/idx_runs_project_started_at|idx_runs_project_status/);
  });
});
