# Implementation Plan: Reorder Workflow Steps

**Branch**: `024-reorder-steps` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-reorder-steps/spec.md`

## Summary

Let an editor reorder workflow steps in the web dashboard with accessible move-up
and move-down controls. The component keeps a local ordered draft so the editor
can verify the complete sequence before saving, then sends one narrow
`workflow.stages` permutation through the existing WebSocket configuration path.
Step guidance and isolation settings remain keyed by stage name and are therefore
unchanged. The existing persisted pipeline workflow snapshot already ensures an
active or resumed run retains its original order while later pipelines use the
saved revision.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js >=20.17

**Primary Dependencies**: React 18, Zod 3, `ws`, `better-sqlite3`, Vitest 3, happy-dom

**Storage**: SQLite catalog (`backlog_features.data_json`) and pipeline workflow snapshot (`pipelines.workflow_snapshot_json`)

**Testing**: Vitest component, WebSocket/server, SQLite catalog, and runner/resume coverage; `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`

**Target Platform**: Modern browsers served by the `msq web` dashboard, with the Node.js CLI/runner

**Project Type**: Node.js CLI/service with a React web dashboard

**Performance Goals**: An editor previews and saves a valid reorder in under 30 seconds; each save sends one small configuration action.

**Constraints**: Web dashboard only; retain every stage exactly once; do not edit `stepGuidance` or `sessionPolicy` during reordering; failed saves preserve the last saved catalog order and show actionable feedback; active pipeline structure remains immutable.

**Scale/Scope**: One existing feature-configuration component, its existing narrow WebSocket/catalog path, and focused regression coverage. No new endpoint, table, or runner algorithm is needed.

## Constitution Check

### Pre-design gate

- **Source of truth — PASS**: [spec.md](./spec.md) defines the behavior; the catalog remains the editable persisted revision and existing pipeline snapshots remain the execution revision.
- **Layer ownership — PASS**: React owns draft order and controls; `src/web/types.ts` owns the existing narrow patch; `src/web/server.ts` delegates it; `src/db/backlogCatalog.ts` merges, validates, and commits it; runner/repository own frozen pipeline revisions.
- **Validation — PASS**: focused component, server, catalog, and runner tests cover the order, persistence, and active-run boundary; TypeScript baseline gates apply.
- **Runtime evidence — NOT REQUIRED**: this is product UI/catalog work, not `msq` executor validation. Focused persistence and runner tests plus optional dashboard verification supply evidence without a nested runner.
- **Harness safety — PASS**: no `msq-develop`, nested `msq run`, or TUI change is included.
- **UI scope — PASS**: work is limited to the web dashboard; `src/ui/` is not extended.

## Research Findings

Detailed decisions are recorded in [research.md](./research.md). The selected
interaction is accessible directional controls rather than drag-and-drop: it is
consistent with the current pill-based step editor, works without a pointer, and
gives an explicit preview before saving.

## Project Structure

### Documentation (this feature)

```text
specs/024-reorder-steps/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── workflow-step-reordering.md
```

### Source Code

```text
src/
├── web/
│   ├── types.ts                                  # existing narrow stages patch
│   ├── server.ts                                 # existing action delegation/acknowledgement
│   └── client/components/FeatureConfigDetail.tsx # local order draft, controls, save feedback
├── db/backlogCatalog.ts                          # existing atomic merge, validation, persistence
└── core/runner/execute.ts                        # existing pipeline workflow snapshot application

tests/
├── web/featureConfigDetail.test.tsx
├── web/server.test.ts
├── db/backlogCatalog.test.ts
└── runner/execute.test.ts
```

**Structure Decision**: extend the established feature-configuration path rather
than adding a reorder-specific endpoint or data model. The only persisted change
is the full `stages` array in the existing feature JSON; pipeline snapshots are
already sufficient to isolate runs in progress.

## Design

1. In `FeatureConfigDetail`, derive a `draftStages` array from the saved
   workflow. Render a move-up and move-down button for every stage with explicit
   accessible labels. Disable a control at its boundary and while the matching
   save is pending. Clicking swaps adjacent values in the local draft only, so
   the rendered pills immediately show the complete proposed sequence.
2. Show `save step order` only when the draft differs from the saved stages. On
   save, submit exactly `{ workflow: { stages: draftStages } }` through
   `onSaveConfig`. Reuse the current save-result/refresh protocol: clear the
   dirty draft only after refreshed state contains the accepted order; leave the
   local draft and display `workflowIssues` after a failed acknowledgement.
3. Do not include `stepGuidance` or `sessionPolicy` in the reorder patch. The
   catalog deep merge preserves both records, whose references are stage names
   rather than positions. `FeatureSchema` remains the authoritative guard for a
   valid, nonempty workflow.
4. Reuse `action:updateFeatureConfig`, server forwarding, and
   `updateCatalogFeature()` unchanged. The transaction validates the complete
   merged feature before it writes `backlog_features.data_json`, so a rejected
   patch cannot replace the saved sequence.
5. Reuse the current `captureWorkflowRevisions()` and
   `applyWorkflowRevisions()` behavior. A pipeline captures the original
   `stages` array on creation and resume reapplies it; only a pipeline created
   after the catalog save observes the reordered array.
6. Add focused tests for preview, boundary controls, one minimal action payload,
   save success/failure handling, catalog persistence with unchanged guidance
   and isolation, WebSocket forwarding, and the two-pipeline snapshot boundary.

## Post-design Constitution Check

- **Source of truth — PASS**: the spec, contract, and quickstart document the observable update and the catalog/pipeline records provide the relevant persisted evidence.
- **Layer ownership — PASS**: UI interaction is local to React; validation and persistence stay in the catalog layer; pipeline immutability stays in existing runner/repository ownership.
- **Validation — PASS**: coverage is mapped to every boundary and the full TypeScript validation baseline is listed in the quickstart.
- **Runtime evidence — PASS / not applicable**: no executor behavior is claimed. The manual check observes the saved catalog and refreshed UI, while runner tests prove future-versus-active sequence isolation.
- **Harness safety — PASS**: the design introduces no harness execution or nested runner.
- **UI scope — PASS**: only the web dashboard is affected.

## Complexity Tracking

No constitution violations require justification.
