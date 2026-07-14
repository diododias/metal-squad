# Quickstart: F52 - Registro de Features com ID Gerado Automaticamente

## Prerequisites

- Run from `/Users/luizdiodo/new_repos/metal-squad`.
- Install dependencies with `rtk npm install` if needed.
- Use an isolated writable database for validation:

```bash
export MSQ_DB_PATH="$(pwd)/.metal-squad/feature-id-validation.db"
```

- Build the CLI before live catalog checks:

```bash
rtk npm run build
```

## Scenario 1: New features receive stable IDs

1. Create a temporary backlog with at least two features that omit `id`.
2. Run:

```bash
rtk node dist/index.js backlog load --file /absolute/path/to/backlog.yaml
```

3. Confirm that the command succeeds and reports two `F-` IDs.
4. Inspect the YAML and catalog, then run the same command again:

```bash
rtk rg -n "id: F-" /absolute/path/to/backlog.yaml
rtk node dist/index.js backlog load --file /absolute/path/to/backlog.yaml
```

Expected result: every generated ID has exactly eight characters from the
canonical alphabet, the second diff reports no feature ID changes, and the
SQLite `backlog_features` rows match the materialized YAML.

## Scenario 2: Batch uniqueness and collision retry

1. Prepare a backlog with at least 200 ID-less features.
2. Run `backlog load` against the isolated DB.
3. Compare the 200 YAML IDs and catalog `feature_id` values.

Expected result: all IDs match, all are distinct, and a forced generator
collision in the focused unit test is retried without persisting the candidate.

## Scenario 3: Legacy/manual compatibility and validation

Prepare one backlog containing:

- a legacy ID such as `feat-52`;
- a valid manual ID such as `customer-checkout`; and
- one ID-less feature.

Run `backlog load` and then query the catalog through the existing runtime
loader. Expected result: the first two values are preserved exactly, the third
gets `F-<8>`, and dependencies/history resolve by exact string value.

Repeat with duplicate, whitespace-containing, and malformed reserved `F-`
values. Expected result: the command fails with an actionable field/value
error, and neither YAML nor catalog contains a partial reassignment.

## Scenario 4: Board uses persisted identity

1. Load a backlog containing a canonical generated ID and a legacy ID.
2. Start the web state or the focused board test with matching catalog entries.
3. Inspect the Board cards.

Expected result: the cards display the exact persisted IDs; the old short hash
is used only for a run payload whose catalog entry is unavailable and is never
used for lookup or persistence.

## Scenario 5: Concurrent publication

Run the focused catalog concurrency test with two writers targeting the same
isolated SQLite database. Expected result: each committed feature has a unique
ID, a losing/conflicting publication reports the owner and rolls back, and no
run/gate/pipeline history row is changed.

## Validation commands

```bash
rtk npx vitest run tests/backlog/schema.test.ts tests/backlog/load-extended.test.ts tests/backlog/feature-id.test.ts tests/db/backlogCatalog.test.ts tests/orchestrator/graph.test.ts tests/web/client.test.ts tests/web/kanban-card.test.tsx
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

## Related artifacts

- Spec: `specs/017-feature-id-generation/spec.md`
- Plan: `specs/017-feature-id-generation/plan.md`
- Data model: `specs/017-feature-id-generation/data-model.md`
- Contract: `specs/017-feature-id-generation/contracts/feature-id-registration-contract.md`
