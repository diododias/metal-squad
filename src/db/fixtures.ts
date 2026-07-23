import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { BacklogV2Schema } from '../core/backlog/schema.js';
import { DEFAULT_DB_PATH, resolveDbPath } from '../config/index.js';
import { getDb } from './index.js';
import { registerRepo } from './repo.js';
import { upsertBacklogCatalog, type BacklogCatalogDiff } from './backlogCatalog.js';

export const FIXTURE_SCENARIOS = ['settings', 'portability', 'analytics-volume'] as const;
export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

export interface FixtureOptions {
  repoId?: string;
  repoPath?: string;
}

export interface FixtureResult {
  scenario: FixtureScenario;
  repoId: string;
  dbPath: string;
  epics: number;
  features: number;
  diff: BacklogCatalogDiff;
}

// Resolves to <repoRoot>/tests/fixtures/scenarios/ from both src/db and dist/db.
const SCENARIO_DIR = new URL('../../tests/fixtures/scenarios/', import.meta.url);

/**
 * Fixtures exist only for E2E/Web flows on disposable databases. They must
 * never touch the global catalog, so the default db path is rejected.
 */
export function assertSandboxDbPath(): string {
  const dbPath = resolveDbPath();
  if (dbPath === DEFAULT_DB_PATH) {
    throw new Error(
      'db:fixture only writes to sandbox databases. Set MSQ_DB_PATH to a disposable path '
        + '(e.g. via scripts/with-sandbox-db.mjs); the global catalog is never seeded with fixtures.',
    );
  }
  return dbPath;
}

/**
 * Seeds a deterministic scenario into the catalog. The YAML carries fully
 * explicit values per feature (the same shape a real `msq backlog load`
 * produces after defaults propagation) and is parsed with the public schema,
 * then upserted without registrations — the registration path always rekeys
 * features to random canonical ids, which would break fixture determinism.
 */
export function applyFixtureScenario(scenario: FixtureScenario, options: FixtureOptions = {}): FixtureResult {
  if (!FIXTURE_SCENARIOS.includes(scenario)) {
    throw new Error(`Unknown fixture scenario "${scenario as string}". Available: ${FIXTURE_SCENARIOS.join(', ')}.`);
  }

  const dbPath = assertSandboxDbPath();
  const scenarioPath = fileURLToPath(new URL(`${scenario}.backlog.yaml`, SCENARIO_DIR));
  const backlog = BacklogV2Schema.parse(parse(readFileSync(scenarioPath, 'utf8')));

  const repoId = options.repoId ?? `fixture/${scenario}`;
  registerRepo(repoId, options.repoPath ?? dirname(scenarioPath));
  const diff = upsertBacklogCatalog(backlog, repoId);
  if (scenario === 'analytics-volume') seedAnalyticsVolume();

  return {
    scenario,
    repoId,
    dbPath,
    epics: backlog.epics.length,
    features: backlog.epics.flatMap((epic) => epic.features).length,
    diff,
  };
}

/**
 * The analytics fixture intentionally materializes its telemetry rather than
 * deriving it from a live run. This keeps performance and WebSocket regression
 * tests deterministic, exercises snapshot gaps, and remains safe to reapply.
 */
function seedAnalyticsVolume(): void {
  const db = getDb('readwrite');
  const projects = ['fix-ana-project-1', 'fix-ana-project-2', 'fix-ana-project-3'];
  const tools = ['codex', 'claude', 'opencode'];
  const models = ['gpt-5.6-terra', 'claude-opus-4-8', 'qwen3-coder'];
  const statuses = ['done', 'failed', 'blocked'];
  const stages = ['plan', 'implement', 'validate'];
  const insertProject = db.prepare(`INSERT OR IGNORE INTO projects (project_id, name, position) VALUES (?, ?, ?)`);
  const insertRepo = db.prepare(`INSERT OR IGNORE INTO repos (repo_id, path) VALUES (?, ?)`);
  const linkRepo = db.prepare(`INSERT OR IGNORE INTO project_repos (repo_id, project_id, position) VALUES (?, ?, ?)`);
  const insertEpic = db.prepare(`INSERT OR IGNORE INTO backlog_epics (epic_id, project_id, repo_id, title, position, data_json) VALUES (?, ?, ?, ?, ?, '{}')`);
  const insertWorkItem = db.prepare(`INSERT OR IGNORE INTO backlog_features (feature_id, epic_id, repo_id, title, type, depends_on, position, data_json) VALUES (?, ?, ?, ?, 'feature', '[]', ?, '{}')`);
  const insertRun = db.prepare(`INSERT OR IGNORE INTO runs (id, repo_id, project_id, epic_id, feature_id, tool, model, stage, effort, thinking, status, started_at, input_tokens, cached_input_tokens, output_tokens, total_tokens, context_window_percent, metrics_confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const seed = db.transaction(() => {
    projects.forEach((projectId, projectIndex) => {
      insertProject.run(projectId, `Analytics Fixture Project ${String(projectIndex + 1)}`, projectIndex);
      for (let repoIndex = 0; repoIndex < 2; repoIndex += 1) {
        const repoId = `${projectId}-repo-${String(repoIndex + 1)}`;
        registerRepo(repoId, `/fixtures/analytics/${projectId}/repo-${String(repoIndex + 1)}`);
        insertRepo.run(repoId, `/fixtures/analytics/${projectId}/repo-${String(repoIndex + 1)}`);
        linkRepo.run(repoId, projectId, repoIndex);
        for (let epicIndex = 0; epicIndex < 2; epicIndex += 1) {
          const epicId = `${repoId}-epic-${String(epicIndex + 1)}`;
          insertEpic.run(epicId, projectId, repoId, `Analytics Fixture Epic ${String(epicIndex + 1)}`, epicIndex);
          for (let itemIndex = 0; itemIndex < 2; itemIndex += 1) {
            const workItemId = `${epicId}-work-${String(itemIndex + 1)}`;
            insertWorkItem.run(workItemId, epicId, repoId, `Analytics Fixture Work Item ${String(itemIndex + 1)}`, itemIndex);
          }
        }
      }
    });

    for (let index = 0; index < 3600; index += 1) {
      const projectIndex = index % projects.length;
      const repoIndex = Math.floor(index / projects.length) % 2;
      const epicIndex = Math.floor(index / (projects.length * 2)) % 2;
      const itemIndex = Math.floor(index / (projects.length * 4)) % 2;
      const projectId = projects[projectIndex] ?? 'fix-ana-project-1';
      const repoId = `${projectId}-repo-${String(repoIndex + 1)}`;
      const epicId = `${repoId}-epic-${String(epicIndex + 1)}`;
      const workItemId = `${epicId}-work-${String(itemIndex + 1)}`;
      const incomplete = index % 17 === 0;
      insertRun.run(
        900000 + index, repoId, incomplete ? null : projectId, incomplete ? null : epicId, workItemId,
        tools[index % tools.length], index % 13 === 0 ? null : models[index % models.length], stages[index % stages.length],
        index % 2 === 0 ? 'high' : 'medium', index % 5 === 0 ? null : 'off', statuses[index % statuses.length],
        `2026-07-${String((index % 28) + 1).padStart(2, '0')} ${String(index % 24).padStart(2, '0')}:00:00`,
        100 + (index % 50), index % 11 === 0 ? null : 20, 40 + (index % 20), incomplete ? null : 160 + (index % 70),
        index % 19 === 0 ? null : index % 100, incomplete ? 'unknown' : index % 7 === 0 ? 'derived' : 'exact',
      );
    }
  });
  seed();
}
