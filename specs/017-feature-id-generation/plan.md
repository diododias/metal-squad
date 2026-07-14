# Implementation Plan: F52 - Registro de Features com ID Gerado Automaticamente

**Branch**: `[017-feature-id-generation]` | **Date**: 2026-07-14 | **Spec**: [/Users/luizdiodo/new_repos/metal-squad/specs/017-feature-id-generation/spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-feature-id-generation/spec.md`

## Summary

Introduce a single Feature ID domain module that validates explicit IDs and
generates collision-resistant `F-<8>` IDs with the required Crockford-style
alphabet. The batch registration path will parse features with an optional ID,
resolve and persist missing IDs in `backlog.yaml`, then publish the normalized
backlog to the global SQLite catalog in one guarded transaction. Existing
legacy/manual IDs remain opaque and stable. The web board will render the
persisted catalog ID and retain the current client hash only for an unknown
legacy payload that has no persisted ID.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js >=20.17.0

**Primary Dependencies**: `zod` for schema validation, `yaml` for backlog parsing/materialization, `better-sqlite3` for transactional catalog persistence, Node `crypto` for unbiased random index selection, `commander` for `msq backlog load`, and React for the web board

**Storage**: Versioned `backlog.yaml` as the checked-in batch source plus the global SQLite catalog (`backlog_catalog_meta`, `backlog_epics`, `backlog_features`, and `backlog_tasks`) and existing run/gate/pipeline tables that already store opaque `feature_id` values

**Testing**: Vitest unit/integration suites, with `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint` as the implementation baseline; focused backlog/catalog/web suites for iteration

**Target Platform**: Local macOS/Linux CLI and local web dashboard running on the supported Node.js baseline

**Project Type**: CLI orchestrator with SQLite-backed catalog/runtime state and a React web dashboard

**Performance Goals**: Resolve a batch of at least 200 new features in one local load without network access, with bounded collision retries and one catalog publication transaction; repeated loads of an unchanged backlog must be a no-op for IDs

**Constraints**: IDs must be globally unique across registered catalogs, explicit legacy/manual IDs must be preserved, canonical `F-` IDs must use exactly eight uppercase characters from `23456789ABCDEFGHJKMNPQRSTVWXYZ`, YAML and catalog must not expose divergent IDs after a successful load, SQLite writes must remain atomic under concurrent loaders, `EpicSchema.id` is out of scope, and new UI work targets the web dashboard rather than the retired TUI

**Scale/Scope**: One repository backlog per command, with uniqueness checked against all non-archived and historical catalog feature IDs in the shared SQLite database; covers batch registration and the reusable registration contract for a future online channel, not the F57 online UI

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Source of truth**: PASS. The implementation is traced to `specs/017-feature-id-generation/spec.md`, `docs/features/F52-feature-id-generation.md`, `backlog.yaml`, and the existing catalog. A successful registration will keep the materialized YAML and SQLite catalog aligned before the feature is available to runtime consumers.
- **Layer ownership**: PASS. ID rules live in `src/core/backlog/`; commands orchestrate parsing and publication; `src/db/` owns uniqueness and transaction boundaries; the web board only selects the display value and does not generate authoritative IDs.
- **Validation**: PASS. The design includes schema, loader, catalog-concurrency, regression, and web tests plus the repository build/test/typecheck/lint gates. A focused 200-feature and two-load scenario covers the measurable outcomes.
- **Runtime evidence**: PASS with scoped applicability. The batch command will be validated with a persisted catalog row set, normalized `backlog.yaml`, and the reported catalog diff. No live executor run is needed because this feature changes registration identity, not adapter execution.
- **Harness safety**: PASS / not applicable. This plan does not validate the `msq` executor and does not introduce nested runners or worktrees. If implementation later adds executor validation, it must use `msq-develop` and rebuild first.
- **UI scope**: PASS. The only UI change is in the web board and its client tests; the retired Ink TUI is not extended.
- **Gate Status (pre-design)**: PASS

## Project Structure

### Documentation (this feature)

```text
specs/017-feature-id-generation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── feature-id-registration-contract.md
└── tasks.md                 # created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── backlog.ts                    # orchestrates parse, registration, diff output
├── core/
│   └── backlog/
│       ├── featureId.ts              # shared generation, validation, allocation
│       ├── load.ts                   # input parsing/defaults and normalized loading
│       └── schema.ts                 # optional input ID vs required normalized Feature
├── db/
│   ├── backlogCatalog.ts             # global ID checks and atomic catalog upsert
│   └── index.ts                      # SQLite migration/transaction primitives
└── web/
    └── client/
        ├── components/data/KanbanCard.tsx  # persisted-ID display with legacy fallback
        └── pages/BoardPage.tsx             # passes catalog identity to cards

tests/
├── backlog/
│   ├── schema.test.ts
│   ├── load-extended.test.ts
│   └── feature-id.test.ts
├── db/
│   └── backlogCatalog.test.ts
├── orchestrator/
│   └── graph.test.ts
└── web/
    ├── client.test.ts
    └── kanban-card.test.tsx
```

**Structure Decision**: Extend the existing single-project structure. Keep the
ID policy and pure allocation reusable in `src/core/backlog/featureId.ts`, keep
SQLite uniqueness and catalog writes in `src/db/backlogCatalog.ts`, and pass
only already-resolved identity into web components. The future online channel
will call the same core registration contract instead of recreating generation
logic in a command or UI module.

## Phase 0: Research Decisions

- Use `crypto.randomInt(0, alphabet.length)` for each generated character. It
  avoids modulo bias without adding a dependency and directly supports the
  fixed alphabet required by FR-001.
- Treat a canonical ID as `^F-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$`. Preserve
  all other non-empty manual IDs that contain no whitespace/control characters,
  except that any `F-` prefix outside the canonical form is rejected. This
  preserves `feat-N` and existing manual identifiers without destructive
  normalization.
- Keep a separate input schema/type where `Feature.id` is optional, then
  normalize to the existing required `Feature` shape before catalog/runtime
  publication. This prevents a missing ID from leaking into runs, dependency
  resolution, or UI state.
- Materialize newly allocated IDs into the same `backlog.yaml` before the
  catalog commit is considered successful. A DB-only allocation cannot remain
  stable if the next load reads a YAML feature with no ID; title, `specFile`,
  and position are explicitly allowed to change, so they cannot be reliable
  identity keys.
- Use the existing global `backlog_features.feature_id` primary key as the
  database uniqueness guard, but add an explicit preflight across all catalog
  rows and reject an incoming ID owned by another repo rather than allowing the
  current `ON CONFLICT` upsert to move that row between repositories.
- Make allocation and catalog publication one SQLite write transaction, with
  the YAML materialization staged through a temporary file and rollback/restore
  handling around the transaction boundary. The persisted YAML ID is the
  retry-safe artifact if a process stops before the catalog commit; a failed
  publication must not leave an alternate ID in the catalog.
- Keep IDs opaque in graph, run, gate, notification, and pipeline code. Those
  consumers already use string equality/map keys; no ordering or parsing rule
  should be introduced for `F-`, `feat-N`, or manual IDs.
- In the web board, display `FeatureCatalogEntry.id`/the run's persisted ID
  whenever the catalog entry exists. Keep `toShortFeatureId` only as a
  compatibility fallback for an old run with no matching persisted catalog
  entry; never write that fallback back to a feature or use it for lookup.

## Phase 1: Design Direction

### ID domain and input normalization

1. Add a shared `featureId.ts` module exporting the canonical alphabet,
   canonical regex/predicate, explicit-ID validation, random generation, and a
   pure allocator that accepts an occupied-ID set and an injectable random
   source for deterministic collision tests.
2. Add an input-facing feature/backlog schema (or equivalent preprocess step)
   that accepts an omitted feature ID. Keep the normalized `FeatureSchema` and
   `Feature` type requiring `id: string`, so all existing runtime consumers
   receive the same invariant after registration.
3. Validate duplicate explicit IDs within the incoming backlog before any
   generated ID is assigned. Validate explicit IDs against the global catalog
   before writing. Error messages must identify the feature/field and the
   reason (empty, whitespace/control character, reserved malformed `F-`, or
   duplicate owner).
4. Allocate missing IDs against both the global occupied set and IDs already
   allocated in the current batch. Retry a candidate collision; fail with an
   actionable exhaustion error rather than silently reusing an ID.

### Batch registration and persistence

1. Refactor the `backlog load` path into parse/default/validate, ID
   registration, YAML materialization, and catalog publication stages. Keep
   `--dry-run` read-only: it may show the prospective normalized IDs/diff but
   must not modify YAML or SQLite.
2. Preserve explicit IDs and existing IDs loaded from YAML exactly. Generated
   IDs are inserted into the original feature locations without reordering or
   changing unrelated YAML values.
3. Preflight all IDs and ownership while the catalog write transaction holds
   the SQLite write lock. The transaction must upsert metadata/epics/features/
   tasks, archive removed rows as today, and leave run/gate/pipeline history
   untouched. A conflict from another repo is an error, not an upsert move.
4. Ensure a second load reads the materialized IDs, reports them unchanged, and
   does not update feature timestamps. A title, `specFile`, or position change
   updates the feature row but preserves its ID.

### Shared future registration contract

Expose the core registration result as a reusable value containing the
normalized feature/backlog fragment, assigned ID (when newly generated), and
validation/ownership errors. The batch command adapts YAML to this contract;
the future online channel can provide a feature input and the same occupied-ID
registry without importing CLI or React code. Epic IDs remain handled by the
existing `EpicSchema` and are never passed through this contract.

### Consumers and board

- Leave `topoOrder`/`selectFeaturePlan`, run persistence, event payloads, and
  notification text using opaque string IDs; add regression cases with one
  canonical, one legacy, and one manual ID.
- Include the persisted ID in the existing catalog entry consumed by
  `src/web/state.ts` and `BoardPage`. Replace the always-hash display path with
  `persistedId ?? legacyFallback`, where the fallback is visibly a display-only
  compatibility value and not a key sent back to the server.
- Do not change the retired TUI or `EpicSchema.id`.

### Validation coverage

- Schema/ID domain: canonical alphabet and length, 200 distinct generated IDs,
  deterministic collision retry, manual/legacy preservation, malformed/reserved
  rejection, duplicate rejection, and Epic ID non-regression.
- Loader/CLI: omitted IDs become materialized, repeated loads are stable,
  dry-run is non-mutating, YAML write failure leaves catalog state unchanged,
  and explicit ID edits do not reassign another feature.
- Catalog: global cross-repo collision, atomic rollback, concurrent writers,
  archived/history behavior, and no writes to run/gate/pipeline tables.
- Consumers: graph dependencies, run history, notifications, and board display
  resolve the exact persisted ID for canonical and legacy values.

### Agent Context Update

The repository has no `.specify/extensions/agent-context/` configuration or
update script, and `CLAUDE.md` has no `<!-- SPECKIT START -->` /
`<!-- SPECKIT END -->` managed block. The required context-update step is
therefore a documented no-op; no unrelated agent instruction file will be
created or rewritten.

## Post-Design Constitution Check

- **Source of truth**: PASS. The plan explicitly keeps the versioned spec and
  feature doc authoritative while synchronizing materialized YAML and the
  SQLite runtime catalog.
- **Layer ownership**: PASS. Generation/validation, DB ownership, command
  orchestration, and web presentation remain separated.
- **Validation**: PASS. Automated tests cover the new behavior and the stated
  repository gates remain required for source changes.
- **Runtime evidence**: PASS. The quickstart requires catalog rows, YAML IDs,
  and CLI diff output; those are the relevant evidence signals for registration.
- **Harness safety**: PASS. No executor QA or nested run is part of this
  feature's design.
- **UI scope**: PASS. Only the official web dashboard is changed.
- **Gate Status (post-design)**: PASS

## Complexity Tracking

No constitution violations require justification.
