import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { BacklogV2Schema } from '../core/backlog/schema.js';
import { DEFAULT_DB_PATH, resolveDbPath } from '../config/index.js';
import { registerRepo } from './repo.js';
import { upsertBacklogCatalog, type BacklogCatalogDiff } from './backlogCatalog.js';

export const FIXTURE_SCENARIOS = ['settings', 'portability'] as const;
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

  return {
    scenario,
    repoId,
    dbPath,
    epics: backlog.epics.length,
    features: backlog.epics.flatMap((epic) => epic.features).length,
    diff,
  };
}
