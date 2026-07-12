# Implementation Plan: Custom Skill or Prompt Per Step

**Branch**: `013-step-custom-skill` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-step-custom-skill/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add stage-scoped guidance to staged features so a single workflow step can receive extra instructions without changing the rest of the feature prompt. The design keeps skill precedence centralized in `src/core/skills/registry.ts`, extends the backlog contract with stage-keyed guidance metadata, and updates prompt assembly in `src/core/backlog/prompt.ts` plus staged-runner prompt construction in `src/core/runner/execute.ts` so inherited skills, stage skill references, and direct prompt blocks are combined once in a deterministic order.

## Technical Context

**Language/Version**: TypeScript 5.7.3, Node.js >=20.17.0

**Primary Dependencies**:
- zod 3.24.1 for backlog schema validation
- yaml 2.7.0 for backlog parsing and skill metadata parsing
- better-sqlite3 11.8.1 for catalog/runtime persistence
- commander 13.1.0 for CLI entrypoints
- Ink 5.1.0 + React 18.3.1 for TUI/web config display

**Storage**: YAML backlog source plus SQLite-backed backlog catalog rows containing serialized feature payloads

**Testing**: Vitest 3.0.2, with focused backlog/prompt/skills/runner tests, plus `npm run build` and `npm run typecheck`

**Target Platform**: Local terminal-based workflow orchestration on macOS/Linux/Windows with installed agent CLIs

**Project Type**: Single TypeScript CLI/TUI application with SQLite operational state

**Performance Goals**:
- Preserve identical prompt output for features with no stage-specific guidance
- Keep stage-guidance resolution bounded to the current feature/stage and existing registry lookup
- Avoid extra filesystem discovery passes beyond the existing registry resolution path

**Constraints**:
- Do not duplicate skill precedence outside `src/core/skills/*`
- Backlog contract changes must update schema, loader, prompt builder, and tests together
- Stages remain the current step unit in staged execution (`specify`, `plan`, `tasks`, `implement`, `validate`, plus custom stage ids)
- Prompt assembly must remain deterministic across retries, resumes, and catalog-backed runs
- Empty direct prompt text must be ignored instead of creating blank prompt sections

**Scale/Scope**:
- 1 new feature-level workflow configuration surface for per-stage guidance
- 1 existing prompt builder path (`buildPrompt`) plus 1 staged wrapper (`buildStagePrompt`)
- 1 backlog/catalog serialization path
- Backlog, skills, runner, and test coverage updates; no adapter protocol changes expected

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: PASS

The constitution file at `.specify/memory/constitution.md` is still an unpopulated template, so it does not define enforceable project-specific gates. This plan therefore uses the repo's explicit rules as the operative guardrails:
- `.claude/rules/architecture.md`: keep precedence logic in `src/core/skills/`, backlog contract work in `src/core/backlog/`, and avoid parallel resolution paths
- `.claude/rules/testing.md`: cover backlog/prompt/skills changes with focused Vitest coverage and the standard build/typecheck gates

**Post-Design Re-check**: PASS. The design keeps stage-guidance schema and prompt concerns inside backlog modules, reuses the existing registry for named guidance, and limits runner changes to passing the active stage into prompt assembly rather than moving resolution policy into CLI/UI or adapters.

## Project Structure

### Documentation (this feature)

```text
specs/013-step-custom-skill/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── backlog-stage-guidance.md
│   └── stage-prompt-assembly.md
└── tasks.md              # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── backlog/
│   │   ├── schema.ts             # feature/workflow/stage guidance contract
│   │   ├── load.ts               # YAML + catalog hydration
│   │   └── prompt.ts             # base prompt assembly + stage guidance merge
│   ├── runner/
│   │   └── execute.ts            # staged prompt assembly and stage context
│   ├── skills/
│   │   ├── registry.ts           # canonical discovery/precedence/resolve
│   │   └── backlog.ts            # validation of referenced skills in backlog
│   └── workflow/
│       └── stageSkills.ts        # default stage -> skill mapping
├── db/
│   ├── backlogCatalog.ts         # catalog serialization/deserialization
│   └── repo.ts
└── ui/
    ├── catalog.ts
    └── components/

tests/
├── backlog/
│   ├── schema.test.ts
│   ├── load-prompt.test.ts
│   └── prompt-extended.test.ts
├── core/
│   └── skills-backlog.test.ts
└── runner/
    └── execute.test.ts
```

**Structure Decision**: Keep the repository as a single TypeScript CLI/TUI project. The contract for stage-specific guidance belongs under `feature.workflow` because the live step unit is the workflow stage, while skill lookup remains centralized in `src/core/skills/registry.ts`. Prompt composition logic should be shared in `src/core/backlog/prompt.ts`, with `src/core/runner/execute.ts` responsible only for passing stage/runtime context into that builder for staged runs.

## Complexity Tracking

No constitution violations identified.

## Implementation Summary

### Phase 0: Research Complete

Resolved decisions:
- Model "step-specific guidance" as stage-keyed guidance under `feature.workflow`, because current execution steps are stage ids, not task ids
- Reuse `createSkillRegistry().resolve()` and `validate()` for named stage guidance instead of creating a second precedence path
- Extend prompt assembly to accept an optional active-stage context so the same builder can preserve current feature-level behavior and add stage-only guidance when requested
- Persist stage guidance unchanged through both YAML loading and catalog-backed feature serialization
- Validate direct prompt blocks by trimming whitespace and ignoring empty values

See [research.md](./research.md) for the detailed rationale.

### Phase 1: Design Complete

Generated design artifacts:
- [data-model.md](./data-model.md) defines the stage guidance entities, validation rules, and prompt composition relationships
- [contracts/backlog-stage-guidance.md](./contracts/backlog-stage-guidance.md) defines the backlog/catalog contract for stage-keyed guidance
- [contracts/stage-prompt-assembly.md](./contracts/stage-prompt-assembly.md) defines the runtime prompt composition contract
- [quickstart.md](./quickstart.md) documents validation scenarios and commands

**Agent Context Update**: No action required. This checkout does not contain the Spec Kit agent-context extension (`.specify/extensions/agent-context/...`) or a companion update script, so there is nothing to run for this phase.

### Phase 2: Tasks

Task generation is intentionally deferred to `/speckit-tasks`.

## Design Artifacts Generated

| Artifact | Path | Purpose |
|----------|------|---------|
| Plan | `specs/013-step-custom-skill/plan.md` | Technical context, structure, and phase summary |
| Research | `specs/013-step-custom-skill/research.md` | Decisions for schema shape, prompt order, validation, and runtime persistence |
| Data Model | `specs/013-step-custom-skill/data-model.md` | Entities, relationships, validation rules, and prompt-state transitions |
| Contract | `specs/013-step-custom-skill/contracts/backlog-stage-guidance.md` | Backlog/config contract for stage-specific guidance |
| Contract | `specs/013-step-custom-skill/contracts/stage-prompt-assembly.md` | Runtime contract for deterministic prompt assembly |
| Quickstart | `specs/013-step-custom-skill/quickstart.md` | Validation flow and expected outcomes |
