# Research: F52 - Registro de Features com ID Gerado Automaticamente

## Decision: Centralize ID generation and validation in a pure backlog-domain module

**Rationale**:

- `src/core/backlog/schema.ts` currently accepts any string ID and is the shared
  contract for loader, graph, runner, catalog, and UI consumers.
- `node:crypto` is already available in the supported Node runtime; using
  `randomInt` per character gives unbiased selection from the required alphabet
  without a new dependency.
- A pure allocator can accept occupied IDs and a deterministic random source,
  which makes collision and 200-item coverage testable without controlling
  process-wide randomness.

**Alternatives considered**:

- Sequential `feat-N`: rejected because it preserves the manual-collision
  problem and violates the required random `F-<8>` format.
- Hashing title/specFile/position: rejected because those fields may change and
  a hash is not a persisted identity; the current board hash is specifically
  the behavior being replaced.
- UUIDs or an external ID package: rejected because the contract requires a
  short fixed alphabet and the repository has no need for a new dependency.

## Decision: Keep optional input IDs separate from normalized runtime Features

**Rationale**:

- New YAML features can omit `id`, but current `Feature` consumers assume a
  string for maps, dependency traversal, run IDs, and catalog primary keys.
- An input schema/type lets parsing accept omission while making registration
  the only boundary that creates the required normalized invariant.
- Explicit manual IDs can be validated before any write, and generated IDs can
  be assigned to the complete batch before consumers see it.

**Alternatives considered**:

- Make `Feature.id` optional throughout the application: rejected because it
  would spread nullable identity handling through the scheduler, DB, events,
  and web routes.
- Generate IDs only in the board: rejected because execution and history need
  the same persisted value and UI-generated hashes are not globally unique.

## Decision: Materialize generated IDs into `backlog.yaml` and publish the same normalized object to SQLite

**Rationale**:

- The current `msq backlog load` parses YAML and writes a DB catalog, but does
  not write assigned values back to YAML. A DB-only generated ID would be lost
  on the next load of a YAML feature that still has no `id`.
- Title, `specFile`, and position are explicitly mutable, so none can be used
  as a permanent fallback identity key.
- Writing a staged YAML file before the final catalog commit makes retries see
  the same explicit ID. The catalog transaction still validates global
  ownership and can roll back all DB changes on failure.

**Alternatives considered**:

- Match missing IDs to prior catalog rows by title/specFile/position: rejected
  because all three fields are allowed to change and can be duplicated.
- Add a separate identity table keyed by an unstable content fingerprint:
  rejected because it would still need a stable source key and would create a
  second identity model alongside the feature ID.
- Keep generated IDs only in SQLite: rejected because batch source and catalog
  would diverge after a reload.

## Decision: Use the existing global catalog key as the final uniqueness guard

**Rationale**:

- `backlog_features.feature_id` is currently a primary key without a repo
  prefix, so SQLite already models global uniqueness across registered repos.
- `upsertBacklogCatalog` currently treats a primary-key conflict as an update;
  the new preflight must detect an ID owned by another repo and fail instead of
  moving that row.
- A write transaction serializes concurrent catalog loaders under the existing
  `better-sqlite3`/WAL setup. Candidate generation remains an optimization;
  the transaction/constraint is the authority.

**Alternatives considered**:

- Uniqueness only inside the current YAML: rejected by the global uniqueness
  requirement.
- An in-memory process-wide registry: rejected because separate `msq` processes
  and machines share SQLite state, not process memory.
- A network service: rejected because the current product is local and the
  shared SQLite catalog is the existing cross-repo state boundary.

## Decision: Keep all downstream IDs opaque and make the web board prefer catalog identity

**Rationale**:

- `src/core/orchestrator/graph.ts`, `src/db/repo.ts`, event payloads, and web
  routes already compare IDs as strings and do not need format-specific logic.
- `src/ui/catalog.ts` already exposes the catalog feature ID, while
  `KanbanCard` currently derives a hash for every run. The smallest safe change
  is to use the persisted catalog ID when present and reserve hashing for an
  unmatched legacy payload.
- This preserves old run visibility during transition without presenting a
  client-derived value as the authoritative feature identity.

**Alternatives considered**:

- Rewrite all run/gate/notification tables: rejected because their existing
  `feature_id` fields already support opaque strings and historical IDs must be
  preserved.
- Remove the fallback immediately: rejected because old runtime rows may lack a
  matching catalog entry during migration.
- Keep the hash as the primary board label: rejected by FR-010 and the F52
  problem statement.

## Decision: Treat Epic IDs as a separate, unchanged contract

**Rationale**:

- `EpicSchema.id` is structurally separate from `FeatureSchema.id`; changing
  it would broaden the migration and violate FR-011.
- The allocator receives feature entries only and never interprets epic IDs.

**Alternatives considered**:

- Apply the same generated format to epics: rejected as explicitly out of scope.
