# Implementation Plan: Adaptive Session Reuse Between Steps

**Branch**: `011-adaptive-session-reuse` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-adaptive-session-reuse/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a per-feature session policy for staged workflows so `msq` can keep the F27 default of isolated stages by default, but optionally reuse the previous agent session when adaptive mode is enabled and F30 context telemetry shows enough headroom. The runner remains the policy owner, adapters gain an explicit resume/session-handle contract, and each stage transition is persisted with an auditable reason (`adaptive disabled`, `always isolated`, `low usage reuse`, `mid-band reuse`, `60 percent guardrail`, `high usage guardrail`, or `missing telemetry`).

## Technical Context

**Language/Version**: TypeScript 5.7.3, Node.js >=20.17.0

**Primary Dependencies**:
- commander 13.1.0 for CLI commands
- Ink 5.1.0 + React 18.3.1 for the TUI/config display
- better-sqlite3 11.8.1 for pipeline/run persistence
- zod 3.24.1 for backlog schema validation
- Local agent CLIs: `codex`, `claude`, `opencode`

**Storage**: SQLite (`runs`, `task_runs`, `stage_requests`, pipeline state) plus user-authored `backlog.yaml` imported into the backlog catalog

**Testing**: Vitest 3.0.2, focused runner/db/backlog/ui tests, plus `npm run build` and `npm run typecheck`

**Target Platform**: Local terminal-based workflow orchestration on macOS/Linux/Windows with supported agent CLIs installed

**Project Type**: Single TypeScript CLI/TUI application with SQLite-backed operational state

**Performance Goals**:
- Preserve current staged-runner behavior when adaptive mode is off
- Keep transition-policy evaluation O(1) per stage boundary
- Avoid extra agent round-trips beyond the next-stage spawn/resume decision

**Constraints**:
- F27 behavior must remain unchanged when adaptive reuse is disabled
- F30 telemetry (`runs.context_window_percent`) is the only authoritative source for threshold evaluation
- Adaptive thresholds are banded exactly as specified: `<=50%` reuse, `>50% && <60%` reuse, `>=60% && <70%` new session, `>=70%` new session
- Current `ToolAdapter` API is stateless, so session reuse must be introduced without breaking adapters that still need isolated fallbacks
- Ownership must remain split cleanly: backlog/config in `src/core/backlog`, policy logic in runner/workflow, persistence in `src/db`, display in `src/ui`

**Scale/Scope**:
- 1 new per-feature workflow policy surface
- 5 default stages (`specify`, `plan`, `tasks`, `implement`, `validate`)
- 3 adapters (`codex`, `claude`, `opencode`) with adapter-specific continuation flags
- Runner, backlog, DB, UI/catalog, and test coverage updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: PASS

The constitution file at `.specify/memory/constitution.md` is still an unpopulated template, so it does not define enforceable project-specific gates. The plan still follows the repo's explicit architecture rules from `.claude/rules/architecture.md`: session-policy evaluation stays out of CLI/UI layers, backlog contract changes are paired with schema/catalog updates, and audit persistence remains owned by `src/db`.

**Post-Design Re-check**: PASS. The Phase 1 design keeps the same boundaries: policy evaluation is factored into workflow/runner code, adapters encapsulate CLI-specific resume flags, and UI surfaces only render resolved policy/audit data.

## Project Structure

### Documentation (this feature)

```text
specs/011-adaptive-session-reuse/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── backlog-session-policy.md
│   └── stage-transition-decision.md
└── tasks.md              # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── backlog.ts                # catalog import command
│   └── run.ts                    # staged execution entrypoint
├── core/
│   ├── adapters/
│   │   ├── types.ts              # ToolAdapter / RunResult contract
│   │   ├── codex.ts
│   │   ├── claude.ts
│   │   └── opencode.ts
│   ├── backlog/
│   │   ├── load.ts               # backlog/catalog loading
│   │   └── schema.ts             # feature/workflow schema
│   ├── events/
│   │   └── types.ts              # operational event contracts
│   ├── runner/
│   │   └── execute.ts            # staged workflow execution loop
│   └── workflow/                 # home for extracted session-policy helper
├── db/
│   ├── index.ts
│   └── repo.ts                   # run usage + stage request persistence
└── ui/
    ├── catalog.ts                # resolved feature config for UI/web
    └── components/
        └── FeatureConfigSection.tsx

tests/
├── backlog/
├── db/
├── runner/
└── ui/
```

**Structure Decision**: Keep the repository as a single TypeScript CLI/TUI project. The new decision algorithm should live in `src/core/workflow/` (or a narrowly scoped helper imported by `src/core/runner/execute.ts`) so the runner stays the owner of stage transitions. Schema/catalog display changes stay in backlog/UI modules, and audit persistence is added in `src/db/repo.ts` rather than embedding ad-hoc state in the runner.

## Complexity Tracking

No constitution violations identified.

## Implementation Summary

### Phase 0: Research Complete

Resolved decisions:
- Per-feature policy should live under `feature.workflow.sessionPolicy`, not as a new top-level feature field
- Stage transition decisions should be evaluated centrally in the runner/workflow layer using persisted F30 telemetry
- The adaptive decision must preserve the explicit `60%` breakpoint so the `>50% && <60%` band remains reusable while `>=60% && <70%` becomes a fresh-session guardrail
- Adapters should expose a reusable session-handle contract instead of leaking CLI-specific resume commands into the runner
- Transition decisions need their own audit record instead of overloading `stage_requests`
- Existing runner/db/backlog/ui tests are the main validation surface for this feature

See [research.md](./research.md) for the detailed rationale.

### Phase 1: Design Complete

Generated design artifacts:
- [data-model.md](./data-model.md) defines the feature session policy, continuation handle, telemetry snapshot, and stage transition decision entities
- [contracts/backlog-session-policy.md](./contracts/backlog-session-policy.md) defines the user-facing backlog contract
- [contracts/stage-transition-decision.md](./contracts/stage-transition-decision.md) defines the internal runner/db audit contract
- [quickstart.md](./quickstart.md) documents validation scenarios and commands

**Agent Context Update**: No action required. This checkout does not contain the Spec Kit agent-context extension (`.specify/extensions/agent-context/...`) or a companion update script, so there is nothing to run for this phase.

### Phase 2: Tasks

Task generation is intentionally deferred to `/speckit-tasks`.

## Design Artifacts Generated

| Artifact | Path | Purpose |
|----------|------|---------|
| Plan | `specs/011-adaptive-session-reuse/plan.md` | Technical context, structure, research and design summary |
| Research | `specs/011-adaptive-session-reuse/research.md` | Design decisions for schema, runner, adapters, auditing, and tests |
| Data Model | `specs/011-adaptive-session-reuse/data-model.md` | Entities, relationships, validation rules, transition states |
| Contract | `specs/011-adaptive-session-reuse/contracts/backlog-session-policy.md` | Backlog/config contract for feature session policy |
| Contract | `specs/011-adaptive-session-reuse/contracts/stage-transition-decision.md` | Operational audit contract for stage transitions |
| Quickstart | `specs/011-adaptive-session-reuse/quickstart.md` | Validation flow and expected outcomes |
