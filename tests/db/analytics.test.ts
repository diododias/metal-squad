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
    tool?: string; model?: string | null; stage?: string | null; status?: string; startedAt: string;
    input?: number | null; cached?: number | null; output?: number | null; total?: number | null; context?: number | null;
    confidence?: string;
  }) {
    db.prepare(`INSERT INTO runs (id, repo_id, project_id, epic_id, feature_id, tool, model, stage, status, started_at,
      input_tokens, cached_input_tokens, output_tokens, total_tokens, context_window_percent, metrics_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      values.id, values.repoId ?? 'r1', values.projectId === undefined ? 'p1' : values.projectId,
      values.epicId === undefined ? 'e1' : values.epicId, values.workItemId ?? 'w1', values.tool ?? 'codex', values.model ?? 'gpt-5',
      values.stage ?? 'implement', values.status ?? 'done', values.startedAt, values.input === undefined ? 100 : values.input, values.cached === undefined ? 20 : values.cached,
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

  it('paginates sortable work-item rankings and filters data quality', async () => {
    const { db, listAnalyticsWorkItems, countAnalyticsWorkItems, getAnalyticsDataQuality } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', workItemId: 'w1', total: 100 });
    insertRun(db, { id: 2, startedAt: '2026-07-02 10:00:00', workItemId: 'w2', total: 300, context: 90, confidence: 'derived' });
    insertRun(db, { id: 3, startedAt: '2026-07-03 10:00:00', workItemId: 'legacy', epicId: null, projectId: null, total: null, confidence: 'unknown' });

    expect(listAnalyticsWorkItems({}, { limit: 1, offset: 1 }, { by: 'totalTokens', direction: 'desc' })).toEqual([
      expect.objectContaining({ workItemId: 'w1', totalTokens: 100, epicId: 'e1', doneRuns: 1, failedRuns: 0, blockedRuns: 0, abortedRuns: 0, derivedStatus: 'done', dominantTool: 'codex', dominantModel: 'gpt-5' }),
    ]);
    expect(listAnalyticsWorkItems({ dataQuality: 'missing-snapshot' })).toEqual([
      expect.objectContaining({ workItemId: 'legacy', epicId: 'unknown/unscoped', projectId: 'unknown/unscoped' }),
    ]);
    expect(listAnalyticsWorkItems({}, { limit: 1 }, { by: 'contextMaxPercent', direction: 'desc' })).toEqual([
      expect.objectContaining({ workItemId: 'w2', contextMaxPercent: 90, lastRunAt: '2026-07-02 10:00:00' }),
    ]);
    expect(countAnalyticsWorkItems()).toBe(3);
    expect(getAnalyticsDataQuality()).toMatchObject({ totalRuns: 3, exactRuns: 1, derivedRuns: 1, unknownRuns: 1, missingTokenRuns: 1, missingProjectSnapshotRuns: 1, missingEpicSnapshotRuns: 1 });
  });

  it('returns a bounded, newest-first run drilldown only on demand', async () => {
    const { db, listAnalyticsRunDrilldown } = await setup();
    insertRun(db, { id: 1, startedAt: '2026-07-01 10:00:00', total: 100 });
    insertRun(db, { id: 2, startedAt: '2026-07-02 10:00:00', workItemId: 'w2', total: 300, confidence: 'derived' });

    expect(listAnalyticsRunDrilldown({ projectId: 'p1' }, { limit: 1, offset: 0 })).toEqual([
      expect.objectContaining({ runId: 2, workItemId: 'w2', totalTokens: 300, confidence: 'derived' }),
    ]);
  });

  it('uses the analytic indexes with a deterministic volume fixture', async () => {
    const { db, getAnalyticsSummary } = await setup();
    const insert = db.prepare(`INSERT INTO runs (repo_id, project_id, epic_id, feature_id, tool, model, stage, status, started_at, total_tokens, metrics_confidence)
      VALUES ('r1', 'p1', 'e1', 'w1', 'codex', 'gpt-5', 'implement', 'done', ?, 10, 'exact')`);
    const seed = db.transaction(() => {
      for (let index = 0; index < 3000; index += 1) insert.run(`2026-07-${String((index % 28) + 1).padStart(2, '0')} 10:00:00`);
    });
    seed();
    expect(getAnalyticsSummary({ projectId: 'p1', tool: 'codex', stage: 'implement' })).toMatchObject({ runs: 3000, totalTokens: 30000 });
    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM runs WHERE project_id = ? AND started_at >= ? ORDER BY started_at DESC`).all('p1', '2026-07-01') as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join('\n')).toMatch(/idx_runs_project_started_at|idx_runs_project_status/);
  });
});
