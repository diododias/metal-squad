/**
 * One-time backfill: for features whose data_json.spec is null but specFile is
 * set, read the file content and write it back into data_json.spec.
 *
 * Usage: node scripts/backfill-spec-from-specfile.mjs [--dry-run]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

const dbPath = process.env.MSQ_DB_PATH
  ?? `${process.env.HOME}/.local/share/metal-squad/app.db`;

if (!existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, dryRun ? { readonly: true } : undefined);

const rows = db.prepare(
  `SELECT feature_id, spec_file, data_json FROM backlog_features
   WHERE spec_file IS NOT NULL AND archived_at IS NULL AND deleted_at IS NULL`,
).all();

let updated = 0;
let skipped = 0;
let missing = 0;

for (const row of rows) {
  const data = JSON.parse(row.data_json);
  if (data.spec) { skipped++; continue; }

  const absPath = resolve(repoRoot, row.spec_file);
  if (!existsSync(absPath)) { missing++; console.warn(`specFile not found: ${row.spec_file}`); continue; }

  const spec = readFileSync(absPath, 'utf8');
  if (!dryRun) {
    db.prepare(
      `UPDATE backlog_features SET data_json = ?, updated_at = datetime('now') WHERE feature_id = ?`,
    ).run(JSON.stringify({ ...data, spec }), row.feature_id);
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}updated ${row.feature_id} (${row.spec_file.split('/').at(-1)})`);
  updated++;
}

console.log(`\nDone. updated=${updated} skipped(already had spec)=${skipped} missing=${missing}${dryRun ? ' [dry-run, no writes]' : ''}`);
