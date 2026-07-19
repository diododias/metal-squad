import { getDb, resetDb } from '../dist/db/index.js';
import { resolveDbPath } from '../dist/config/index.js';
import { backfillProjects, rebuildBacklogFeaturesTypeCheck } from '../dist/db/backfill.js';

const dbPath = resolveDbPath();
const db = getDb('readwrite');

try {
  db.prepare('SELECT 1').get();
  console.log(`Schema migrated at ${dbPath}`);

  const result = backfillProjects(db);
  console.log(
    `Backfill: ${result.projectsCreated} project(s) created, `
    + `${result.epicsBackfilled} epic(s), ${result.runsBackfilled} run(s), `
    + `${result.pipelinesBackfilled} pipeline(s) backfilled.`,
  );

  const typeCheckResult = rebuildBacklogFeaturesTypeCheck(db);
  console.log(
    typeCheckResult.rebuilt
      ? 'backlog_features rebuilt with CHECK (type IN (\'feature\',\'bug\')).'
      : 'backlog_features type CHECK already present; skipped rebuild.',
  );
} finally {
  resetDb();
}
