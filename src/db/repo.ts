import { existsSync } from 'node:fs';
import { getDb } from './index.js';
import type { TokenUsage } from '../core/adapters/types.js';
import { resolveDbPath } from '../config/index.js';

export function registerRepo(repoId: string, path: string): void {
  getDb('readwrite')
    .prepare(
      `INSERT INTO repos (repo_id, path) VALUES (?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET path = excluded.path`,
    )
    .run(repoId, path);
}

export function createRun(repoId: string, featureId: string, tool: string): number {
  const info = getDb('readwrite')
    .prepare(`INSERT INTO runs (repo_id, feature_id, tool) VALUES (?, ?, ?)`)
    .run(repoId, featureId, tool);
  return Number(info.lastInsertRowid);
}

export function finishRun(runId: number, status: 'done' | 'failed', summary?: string): void {
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
  getDb('readwrite')
    .prepare(`INSERT INTO token_usage (run_id, input, output, total) VALUES (?, ?, ?, ?)`)
    .run(runId, usage.input, usage.output, usage.total);
}

export interface RunRow {
  id: number;
  repo_id: string;
  feature_id: string;
  tool: string;
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
  status: 'running' | 'done' | 'failed' | 'blocked';
  startedAt: string;
  endedAt: string | null;
  totalTokens: number | null;
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
         r.status,
         r.started_at  AS startedAt,
         r.ended_at    AS endedAt,
         u.total       AS totalTokens,
         g.id          AS gateId,
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
  getDb('readwrite')
    .prepare(
      `UPDATE gates
       SET resolved_at = datetime('now'), decision = ?
       WHERE id = ? AND resolved_at IS NULL`,
    )
    .run(decision, id);
}

// T007: createGate — INSERT, returns new gate id
export function createGate(runId: number, featureId: string, repoId: string): number {
  const info = getDb('readwrite')
    .prepare(
      `INSERT INTO gates (run_id, feature_id, repo_id) VALUES (?, ?, ?)`,
    )
    .run(runId, featureId, repoId);
  return Number(info.lastInsertRowid);
}

function hasDbFile(): boolean {
  return getResolvedDbPathExists();
}

function getResolvedDbPathExists(): boolean {
  const dbPath = resolveDbPath();
  return dbPath === ':memory:' || existsSync(dbPath);
}
