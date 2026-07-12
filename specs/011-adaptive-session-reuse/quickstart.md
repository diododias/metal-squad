# Quickstart: Adaptive Session Reuse Between Steps

**Feature**: 011-adaptive-session-reuse  
**Goal**: Validate the backlog contract, transition decision logic, and audit persistence after implementation.

## Prerequisites

- Node.js >=20.17.0
- Repo dependencies installed
- A writable local DB path
- Available local agent CLIs if you run the optional smoke scenario

Suggested isolated DB for validation:

```bash
export MSQ_DB_PATH="$(pwd)/.metal-squad/app.db"
rm -f "$MSQ_DB_PATH" "$MSQ_DB_PATH-shm" "$MSQ_DB_PATH-wal"
```

## Setup

1. Build and typecheck:

```bash
rtk npm run build
rtk npm run typecheck
```

2. Publish the current backlog into the catalog:

```bash
rtk node dist/index.js backlog load
```

## Scenario 1: Backlog Policy Validation

**Goal**: Prove that the new workflow session policy parses and resolves correctly.

1. Add `workflow.sessionPolicy` to the target feature in `backlog.yaml`.
2. Reload the catalog:

```bash
rtk node dist/index.js backlog load
```

3. Run targeted schema/catalog tests:

```bash
rtk npx vitest run tests/backlog/schema.test.ts tests/db/backlogCatalog.test.ts
```

**Expected outcomes**:
- backlog load succeeds with no schema errors
- resolved feature data includes `sessionPolicy.mode`
- invalid stage names under `alwaysIsolatedStages` fail validation

## Scenario 2: Low-Usage Transition Reuses Session

**Goal**: Prove that `<=50%` context usage reuses the prior session when adaptive mode is enabled.

Run targeted runner/db tests:

```bash
rtk npx vitest run tests/runner/execute.test.ts tests/db/repo-extended.test.ts tests/adapters/codex-extended.test.ts tests/adapters/misc.test.ts tests/adapters/opencode.test.ts
```

**Expected outcomes**:
- a staged run finishing at or below `50%` emits/persists `low_usage_reuse`
- the next stage receives a resume/continue session handle instead of forcing isolation
- the persisted audit row records `decision = reuse`

## Scenario 3: Mid-Band Reuse Still Resumes the Prior Session

**Goal**: Prove that the extra `60%` breakpoint preserves reuse for usage strictly above `50%` and below `60%`.

Run targeted runner/db tests after adding the mid-band case:

```bash
rtk npx vitest run tests/runner/execute.test.ts tests/db/repo-extended.test.ts tests/adapters/codex-extended.test.ts
```

**Expected outcomes**:
- a staged run finishing above `50%` and below `60%` emits/persists `mid_usage_reuse`
- the next eligible stage still receives a resume/continue session handle
- the persisted audit row records `decision = reuse`

## Scenario 4: Conservative and Guardrail Paths Force New Sessions

**Goal**: Prove that stage exceptions and higher usage never reuse sessions.

Run the same targeted runner/db suite after adding cases for:
- `60 <= usage < 70`
- `usage >= 70`
- `nextStage` listed in `alwaysIsolatedStages`
- missing `contextWindowPercent`

```bash
rtk npx vitest run tests/runner/execute.test.ts tests/db/repo-extended.test.ts tests/db/index-migrate.test.ts
```

**Expected outcomes**:
- `sixty_percent_guardrail` results in `new_session`
- `high_usage_guardrail` results in `new_session`
- `always_isolated_stage` overrides low usage
- `missing_context_telemetry` falls back safely to `new_session`

## Scenario 5: Config Surfaces Show the Effective Policy

**Goal**: Prove that the catalog/UI render the resolved policy clearly.

Run UI-focused tests:

```bash
rtk npx vitest run tests/ui/hooks.test.ts tests/ui/components.test.tsx tests/ui/render.test.tsx tests/web/state.test.ts
```

**Expected outcomes**:
- feature config output shows the resolved session policy mode
- always-isolated stages render as part of feature config/read surfaces
- operational readers can inspect the stored transition reason

## Optional Smoke Scenario: Real Staged Run

**Goal**: Exercise the workflow on a real local run after automated tests pass.

```bash
rtk node dist/index.js backlog load
rtk node dist/index.js run --feature feat-39 --auto-advance-stages
```

After the run, inspect the audit trail:

```bash
rtk sqlite3 "$MSQ_DB_PATH" "
  SELECT from_stage, to_stage, decision, reason, context_window_percent,
         previous_session_id, next_session_id
  FROM stage_transition_decisions
  ORDER BY id ASC;
"
```

Confirm that:
- each transition has an audit reason
- adaptive transitions reuse only when policy and telemetry allow it
- disabled mode still behaves like F27

## Completion Checklist

- `rtk npm run build` passes
- `rtk npm run typecheck` passes
- targeted Vitest suites covering backlog, runner, DB, and UI pass
- optional smoke run confirms auditable behavior end-to-end
