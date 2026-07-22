# Runbook: Backup, Restore, Migration, Rollback, and Repo Path Recovery

- **Scope**: the global SQLite catalog (`~/.local/share/metal-squad/app.db` by
  default), which is the authoritative source of Projects, Epics, Work Items,
  runs, and audit history (see [ADR-001](../adr/ADR-001-governanca-fonte-de-verdade-terminologia.md)).
- **Audience**: anyone operating `msq` outside a single throwaway sandbox —
  before a schema migration, before a risky bulk edit, or recovering from a
  Repository path that moved or disappeared.

## Backup

Prefer the CLI or npm script over copying `app.db` directly — a raw file copy
can capture a torn write while SQLite's WAL is checkpointing.

```bash
msq db backup --output ~/backups/app-$(date +%Y%m%d-%H%M%S).db
# or, using the pinned default location:
npm run db:backup
```

Both paths call `backupDb()` (`src/db/backup.ts`), which uses better-sqlite3's
online backup API and then runs `PRAGMA integrity_check` and
`PRAGMA foreign_key_check` on the resulting file. A backup that fails either
check throws `DbIntegrityError` instead of silently producing a corrupt copy.

`npm run db:backup` always writes to
`~/.config/metal-squad/backup/<ISO-timestamp>/app.db`. Use `msq db backup
--output <path>` when you need a specific destination (e.g. before a manual
migration, or to a location included in your own backup rotation).

## Restore

```bash
msq db restore --input ~/backups/app-20260701-120000.db
```

Restore verifies the incoming file's integrity first, then — before
overwriting anything — renames the current live DB to
`<dbPath>.pre-restore-<timestamp>.bak` and clears stale `-wal`/`-shm`
sidecars. Only after that safety copy exists does it copy the backup into
place and re-verify integrity. If the copy or verification fails, it restores
the pre-restore `.bak` automatically and re-throws — the live DB is never left
in a half-restored state.

Pass `--yes` to skip the interactive confirmation (useful in scripted
recovery, CI, or when automating disaster recovery — never as a way to avoid
reading the confirmation prompt during a live incident).

```bash
msq db restore --input ~/backups/app-20260701-120000.db --yes
```

After a restore, the `<dbPath>.pre-restore-*.bak` file remains on disk; delete
it manually once you've confirmed the restored DB is correct.

## Migration

```bash
npm run migrate:db
```

This is the only supported way to apply schema migrations and backfills
(`backfillProjects`, `rebuildBacklogFeaturesTypeCheck` in
`scripts/migrate-db.mjs`) against the real global DB. `npm run build` is pure
— it compiles and bundles only, it never touches the database.

Take a backup immediately before migrating a DB that holds real operational
history:

```bash
msq db backup --output ~/backups/pre-migrate-$(date +%Y%m%d-%H%M%S).db
npm run migrate:db
```

Migrations are designed to be additive and idempotent — running
`npm run migrate:db` twice against an already-migrated DB is safe and is part
of the M1 acceptance criteria for the Projects epic
([roadmap](<../epics/epico%20-%20projetos/ROADMAP.md>)).

## Rollback

If a migration or a bulk operation leaves the catalog in a bad state:

1. Stop any running `msq` daemon or process using the DB (`msq daemon stop`).
2. Restore the pre-migration backup:
   ```bash
   msq db restore --input ~/backups/pre-migrate-<timestamp>.db --yes
   ```
3. Confirm `msq status` and `msq projects list` look correct against the
   restored DB before resuming normal operation.

Rollback never reclassifies historical runs and never reuses a tombstoned
(archived/deleted) entity's ID, even if that ID no longer appears in the
restored DB — see [ADR-001 §Estratégia de compatibilidade e rollback](../adr/ADR-001-governanca-fonte-de-verdade-terminologia.md).

## Recovering a Repository whose path changed

A Work Item's execution always targets its linked Repository's registered
path — not the current terminal's working directory (see
[PRJ-15B](<../epics/epico%20-%20projetos/features/PRJ-15b-runtime-routing-multi-repo.md>)).
If that path was moved, renamed, or is temporarily unmounted, the web
dashboard shows repo `health: unavailable` and refuses to start a run against
a wrong or missing directory instead of failing silently.

To fix it, re-link the Repository to its current path:

```bash
msq projects repos link <projectId> --repo-id <repoId> --path /new/absolute/path
```

This updates the registered path without creating a new Repository id or
touching any Work Item, Epic, or run history attached to it. If the
Repository was moved to a different Project entirely (not just a different
path on disk), use `move` instead:

```bash
msq projects repos move <repoId> <toProjectId>
```

## Disaster recovery via export/import

For a portable, human-diffable snapshot of a whole Project (as opposed to a
raw SQLite file), use the v3 backlog asset instead of/in addition to a DB
backup:

```bash
msq backlog export --project <projectId> --file ./export.v3.yaml --include-archived
# ... on the recovery target, after linking repos to local paths ...
msq backlog load --file ./export.v3.yaml --repo-map repoA=/abs/path/to/repoA
```

`backlog load` is always a non-destructive seed: it never overwrites or
archives existing entities based on a YAML diff, and reports conflicts
explicitly instead of applying a conflicting write. It complements, and does
not replace, the SQLite `db backup`/`db restore` pair above — use the export
for cross-machine transport and long-term intent, and the DB backup for exact
operational-state recovery.
