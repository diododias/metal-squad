# Implementation Plan: Remover step com limpeza

**Branch**: `feat/set04-steps-adicionar-step` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-remover-step-limpeza/spec.md`

## Summary

Add a close control to every removable workflow step in the web dashboard. One composed, validated workflow patch will remove the selected stage, its `stepGuidance` entry, and its `sessionPolicy.alwaysIsolatedStages` entry while preserving every remaining setting. Persist a structural workflow snapshot for each pipeline so an in-progress pipeline—including a later resume—keeps the revision it started with; the catalog edit is used only by later pipelines.

## Technical Context

**Language/Version**: TypeScript on Node.js >=20.17

**Primary Dependencies**: React/JSX dashboard, WebSocket server, Zod, better-sqlite3, Vitest

**Storage**: SQLite catalog (`backlog_features.data_json`) and SQLite pipeline state (`pipelines`)

**Testing**: Vitest component, WebSocket/server, catalog/repository, and runner/resume coverage; `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`

**Target Platform**: `msq web` dashboard in modern browsers, with the Node.js CLI/runner

**Project Type**: CLI/service with a React web dashboard

**Performance Goals**: Editors complete a valid remove-and-save flow in under 30 seconds; the one-step UI action makes one config-save request.

**Constraints**: Web dashboard only (no TUI work); retain at least one stage; atomically avoid dangling guidance/isolation references; never rewrite an active pipeline's structural workflow; keep the existing live `approvals.autoAdvance` re-check behavior.

**Scale/Scope**: One feature-config component and its narrow WebSocket contract, catalog update path, plus durable per-pipeline workflow snapshots and focused regression coverage.

## Constitution Check

*Pre-design gate: PASS. Post-design gate: PASS.*

- **Source of truth**: This feature is specified in `specs/023-remover-step-limpeza/spec.md`; persisted catalog state remains the editable source and pipeline state records the execution revision.
- **Layer ownership**: The web component owns interaction/draft selection, `src/web/types.ts` owns the narrow client patch, `src/web/server.ts` delegates it, `src/db/backlogCatalog.ts` owns atomic catalog mutation, and `src/db/` plus the runner own execution snapshots.
- **Validation**: The implementation will add focused automated coverage and run build, test, typecheck, and lint.
- **Runtime evidence**: No live executor run is needed for this UI/catalog change; focused tests prove persisted catalog and persisted pipeline snapshot behavior. A manual dashboard verification may supply saved catalog state and the produced config-save response.
- **Harness safety**: This is product implementation, not an `msq` executor validation; it must not use a nested runner.
- **UI scope**: The work is limited to `src/web/`; the retired Ink TUI is not extended.

## Research Findings

### Decision: send one composed workflow patch for a removal

The close control will call `onSaveConfig` once with the filtered `stages`, a `stepGuidance` record without the removed key, and `sessionPolicy.alwaysIsolatedStages` without the removed stage. It will preserve `sessionPolicy.mode`, guidance for other stages, ordering, and all unrelated workflow fields through the existing deep merge.

**Rationale**: `WorkflowSchema` requires guidance and isolated-stage references to exist in `workflow.stages`. `updateCatalogFeature()` deep-merges and validates the whole feature in one SQLite transaction, so this prevents an invalid intermediate state and cannot partially persist.

**Alternatives considered**:

- Separate saves for stages, guidance, and isolation were rejected because the first save can violate the schema and expose the editor to a transient invalid-reference error.
- Schema relaxation was rejected because dangling references are invalid configuration, not valid temporary state.

### Decision: extend the narrow web patch with partial `sessionPolicy`

Add `workflow.sessionPolicy?: { alwaysIsolatedStages?: string[] }` to `FeatureConfigPatch`. The server may continue to convert the narrow patch to the already-supported internal `FeaturePatch`; no endpoint or catalog table is added.

**Rationale**: The current wire contract accepts `stages` and `stepGuidance` but cannot convey the required isolated-stage cleanup, while the catalog patch type already deep-merges partial `sessionPolicy`.

**Alternatives considered**:

- Sending an untyped `Partial<Feature>` was rejected because the narrow contract intentionally prevents client reshaping of identifiers and tasks.
- A dedicated remove-step action was rejected because it would duplicate validation and mutation ownership already provided by the feature configuration patch.

### Decision: snapshot structural workflows when a pipeline is created

Persist a JSON mapping of feature id to the workflow revision resolved at pipeline creation. When `msq resume` reloads the current catalog, rehydrate each resumed feature's structural workflow from that mapping before scheduling it. Preserve the current catalog's `approvals.autoAdvance` value as the intentional live transition override already used by the runner.

**Rationale**: A live `executeStagedFeature()` captures its stages at entry, but resume currently reloads the catalog. Without a durable snapshot, an edit can retroactively change a paused pipeline, violating FR-008.

**Alternatives considered**:

- Relying on the in-memory captured workflow was rejected because it is lost across pause/restart/resume.
- Snapshotting the entire backlog was rejected as unnecessary data duplication; workflow revisions are the only state this feature must freeze.

### Decision: make the one-stage state visibly non-removable

Render a close control for each stage, but disable it when only one stage remains and leave the local draft and server state unchanged. After a successful multi-stage removal, choose a deterministic remaining stage (the former neighbor, otherwise the first) so draft guidance never refers to a removed key.

**Rationale**: This satisfies the minimum-stage invariant and gives editors a clear distinction between a blocked action and a successful removal.

**Alternatives considered**:

- Hiding the control was rejected because the requirement calls for a close control and a visible blocked state is clearer.
- Leaving the removed stage selected was rejected because subsequent guidance edits would recreate an invalid key.

## Project Structure

### Documentation (this feature)

```text
specs/023-remover-step-limpeza/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── workflow-step-removal.md
```

### Source Code

```text
src/
├── web/
│   ├── types.ts                                # narrow WebSocket config patch
│   └── client/components/FeatureConfigDetail.tsx # stage controls and composed patch
├── db/
│   ├── index.ts                                # pipelines schema/migration
│   └── repo.ts                                 # workflow snapshot persistence/read
├── core/runner/execute.ts                      # capture and rehydrate structural revision
└── commands/resume.ts                          # uses rehydrated pipeline snapshot

tests/
├── web/featureConfigDetail.test.tsx
├── web/server.test.ts
├── db/backlogCatalog.test.ts
├── db/repo-extended.test.ts
└── runner/execute.test.ts
```

**Structure Decision**: Use the existing web-to-catalog patch flow for the edit and the existing pipeline persistence/runner flow for execution immutability. No new UI surface, command, endpoint, or table is introduced; the existing `pipelines` table gains one revision-snapshot column through its established idempotent migration pattern.

## Implementation Approach

1. Extend the narrow client/server `FeatureConfigPatch` type to include the partial isolation list, and keep server conversion delegated to `updateCatalogFeature()`.
2. In `FeatureConfigDetail`, add an accessible close button per rendered stage. For a removable stage, construct the three filtered workflow values in memory, submit them in one `onSaveConfig` patch, update selection/drafts only after the refreshed catalog state confirms the save, and retain all values for remaining stages. For one remaining stage, disable the control and show an explanatory message without dispatching a patch.
3. Add `workflow_snapshot_json` (or equivalent) to the pipeline schema and migration checks. Encode/decode a feature-id-to-structural-workflow map in repository helpers and include it in the pipeline row/snapshot APIs.
4. At new-pipeline creation, derive the structural workflow snapshot from the resolved execution plan. At resume, apply the stored workflow revision before staged execution; retain the current catalog `approvals.autoAdvance` as the existing live override. New pipelines continue to use the newly saved catalog revision.
5. Add focused tests for composed web patches, WebSocket forwarding, transactional catalog persistence/rollback, database snapshot round-trips, and resume behavior that proves an active pipeline ignores a later stage removal while a new pipeline sees it.

## Complexity Tracking

No constitution violations require justification.
