# Research: Backlog Auto-Pilot

## Decision 1: Use `autoStart` as a root-level feature flag

- Decision: Add `autoStart: boolean` to the backlog `Feature` schema, defaulting to `false`.
- Rationale: The flag is a feature-level execution policy, not a stage-level transition rule. A root-level boolean keeps it distinct from `workflow.approvals.autoAdvance`, which already means "advance to the next stage inside the same feature run."
- Alternatives considered:
  - `workflow.autoStart`: rejected because it overloads the workflow block with cross-feature dispatch semantics.
  - Reusing `workflow.approvals.autoAdvance`: rejected because stage approval behavior and backlog auto-dispatch are different concerns.

## Decision 2: Keep auto-pilot inside the existing runner/orchestrator lifecycle

- Decision: Implement the auto-pilot selector in core orchestration code used by `executeBacklog`, rather than introducing a separate daemon-only dispatcher.
- Rationale: `src/core/orchestrator/scheduler.ts` already owns deterministic dependency order and ready-state dispatch. Extending that lifecycle is the smallest change that satisfies FR-003, FR-004, FR-008, and FR-010 without inventing a second scheduling system.
- Alternatives considered:
  - A global daemon or web-only dispatcher: rejected because the current web server starts detached `msq run --feature` child processes and does not share their in-process event bus.
  - Post-hoc DB polling after every run as the primary orchestration path: rejected because it would duplicate scheduler logic and weaken determinism.

## Decision 3: Make blocked outcomes explicit instead of inferring them from `run:failed`

- Decision: Introduce a dedicated `run:blocked` event and classify outcome reasons explicitly for auto-pilot decisions.
- Rationale: Today blocked runs caused by `needs_input` or `retry.onFail = gate` still emit `run:failed`, while budget stops emit `budget:alert` and a blocked run record. That ambiguity is too brittle for automatic dispatch. An explicit blocked event plus reason codes makes the control flow testable and debuggable.
- Alternatives considered:
  - Parse strings from `run:failed.error`: rejected because summaries are user-facing text and not a stable contract.
  - Inspect gates and pipeline status in SQLite after every failure event: rejected because it moves core control decisions into indirect state reconstruction.

## Decision 4: Treat budget and token protection as a hard stop for auto-pilot

- Decision: Budget or token protective stops halt further automatic dispatch until a human resolves the condition; human-waiting blocks and ordinary execution failures do not.
- Rationale: The existing F14 budget path already creates a gate and pauses the pipeline in `execute.ts`. Auto-pilot must honor that safety boundary rather than sidestepping it.
- Alternatives considered:
  - Continue after every blocked or failed outcome: rejected because it breaks FR-007 and undermines cost-control guarantees.
  - Stop after every failure, including ordinary execution issues: rejected because it fails FR-006 and removes the value of the feature.

## Decision 5: Preserve manual starts as-is and exclude manual-only features from automatic candidate selection

- Decision: `action:startFeature` and `msq run --feature <id>` remain valid for any feature, but only features with `autoStart: true` participate in automatic continuation.
- Rationale: The spec makes automatic execution opt-in. This keeps existing operator control intact and avoids regressing current manual workflows in the web and CLI surfaces.
- Alternatives considered:
  - Automatically treat every feature as eligible unless explicitly disabled: rejected because it violates FR-001 and FR-002.
  - Block manual starts for features with `autoStart: false`: rejected because it would remove an existing capability rather than adding automation.

## Decision 6: Re-read live feature config when auto-pilot chooses the next candidate

- Decision: Auto-pilot selection should fetch the latest catalog-backed feature config, including `autoStart`, when making each continuation decision.
- Rationale: The current staged workflow already re-reads `workflow.approvals.autoAdvance` from the catalog at transition time so web edits apply immediately. Reusing that pattern keeps feature config behavior consistent across stage-level and feature-level automation.
- Alternatives considered:
  - Snapshot `autoStart` once at pipeline start: rejected because it would make mid-run config edits feel inconsistent with existing live-edit behavior.
  - Query raw YAML every time: rejected because the active runtime source of truth is the loaded backlog catalog, not `backlog.yaml`.
