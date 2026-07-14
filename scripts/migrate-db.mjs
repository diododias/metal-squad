import { getDb, resetDb } from '../dist/db/index.js';
import { resolveDbPath } from '../dist/config/index.js';

const dbPath = resolveDbPath();
const db = getDb('readwrite');

try {
  db.prepare('SELECT 1').get();
  console.log(`Schema migrated at ${dbPath}`);
} finally {
  resetDb();
}
