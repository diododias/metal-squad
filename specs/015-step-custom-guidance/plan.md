# Implementation Plan: Step-Scoped Custom Guidance

**Branch**: `015-step-custom-guidance` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-step-custom-guidance/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add step-scoped guidance so one workflow step can receive extra instructions without changing prompts for the rest of the feature. In the current `msq` runtime, the executable "step" is a `workflow.stage`, so the design keeps guidance attached to `feature.workflow`, reuses the canonical skill registry in `src/core/skills/registry.ts`, and extends prompt assembly in `src/core/backlog/prompt.ts` so inherited skills, step-specific skill references, and direct prompt blocks are merged once in a deterministic order.

## Technical Context

**Language/Version**: TypeScript 5.7.3, Node.js >=20.17.0

**Primary Dependencies**:
- zod 3.24.1 for backlog schema validation
- yaml 2.7.0 for backlog parsing and skill metadata parsing
- better-sqlite3 11.8.1 for backlog catalog persistence
- commander 13.1.0 for CLI entrypoints
- Ink 5.1.0 and React 18.3.1 for TUI/web surfaces that expose feature configuration

**Storage**: YAML backlog source plus SQLite backlog catalog rows that persist serialized `Feature` payloads in `data_json`

**Testing**: Vitest 3.0.2 with focused backlog/prompt/skills/runner coverage, plus `rtk npm run build` and `rtk npm run typecheck`

**Target Platform**: Local terminal-based orchestration on macOS/Linux/Windows with installed agent CLIs

**Project Type**: Single TypeScript CLI/TUI application with SQLite operational state

**Performance Goals**:
- Preserve byte-equivalent prompt output for features with no step-specific guidance
- Keep named guidance resolution on the existing discovery path with no extra precedence layer
- Limit prompt work to the current feature and active workflow stage

**Constraints**:
- Do not duplicate skill precedence outside `src/core/skills/*`
- Backlog contract changes must update schema, loader, prompt builder, and tests together
- The current runtime step unit is `workflow.stage`, including built-in stages such as `specify`, `plan`, `tasks`, `implement`, and `validate`
- Prompt assembly must remain deterministic across catalog-backed runs, retries, and resumes
- Empty direct prompt text must be ignored instead of producing blank prompt sections

**Scale/Scope**:
- 1 feature/workflow configuration surface for step guidance
- 1 prompt builder path (`buildPrompt`) plus its staged execution call sites
- 1 backlog/catalog serialization path shared by YAML load and DB load
- Backlog, skills, runner, and test coverage updates; no adapter protocol change expected

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: PASS

`.specify/memory/constitution.md` is still the default unpopulated template, so it does not define enforceable project-specific gates. The operative constraints for this plan therefore come from repo rules and the active code:
- `.claude/rules/architecture.md`: precedence remains owned by `src/core/skills/`; backlog contract changes must update schema, loader, prompt builder, and tests together
- `.claude/rules/testing.md`: cover backlog/prompt/skills changes with focused Vitest suites and the standard build/typecheck gates

**Post-Design Re-check**: PASS. The design keeps schema and prompt concerns in `src/core/backlog/`, preserves canonical resolution in `src/core/skills/`, and limits runner impact to passing active-stage context into prompt construction instead of moving precedence logic into commands, adapters, or UI.

## Project Structure

### Documentation (this feature)

```text
specs/015-step-custom-guidance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── backlog-step-guidance.md
│   └── step-prompt-assembly.md
└── tasks.md              # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── backlog/
│   │   ├── schema.ts             # feature/workflow contract
│   │   ├── load.ts               # YAML + catalog hydration
│   │   ├── prompt.ts             # prompt assembly and section rendering
│   │   └── sync.ts               # backlog task synchronization
│   ├── runner/
│   │   └── execute.ts            # staged execution and prompt invocation
│   ├── skills/
│   │   ├── backlog.ts            # backlog skill collection/validation
│   │   ├── registry.ts           # canonical discovery/precedence/resolve
│   │   └── types.ts
│   └── workflow/
│       └── stageSkills.ts        # built-in stage -> skill mapping
├── db/
│   ├── backlogCatalog.ts         # catalog serialization/deserialization
│   └── repo.ts
└── ui/
    ├── components/
    └── hooks/

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

**Structure Decision**: Keep the repository as a single TypeScript CLI/TUI project. Model the new customization under `feature.workflow` because staged execution already treats workflow stages as the runtime step unit, while all named guidance resolution remains centralized in `src/core/skills/registry.ts`. Prompt composition should stay in `src/core/backlog/prompt.ts`, with `src/core/runner/execute.ts` responsible only for passing the active stage and any runner-appended notes.

## Complexity Tracking

No constitution violations identified.

## Implementation Summary

### Phase 0: Research Complete

Resolved decisions:
- Model the requested "step" customization on `workflow.stage`, because that is the live execution step in today's product
- Reuse `createSkillRegistry().resolve()` and `validate()` for named step guidance instead of creating a second precedence path
- Extend prompt assembly to accept active-step context so current non-customized behavior stays intact while customized steps gain additive guidance
- Persist step guidance through both YAML loading and catalog-backed feature hydration by keeping it inside the validated `Feature` payload
- Trim and ignore empty direct prompt text so blank sections are never emitted

See [research.md](./research.md) for the detailed rationale.

### Phase 1: Design Complete

Generated design artifacts:
- [data-model.md](./data-model.md) defines the workflow step, step guidance, and prompt assembly entities
- [contracts/backlog-step-guidance.md](./contracts/backlog-step-guidance.md) defines the backlog/catalog contract for step-scoped guidance
- [contracts/step-prompt-assembly.md](./contracts/step-prompt-assembly.md) defines the runtime prompt composition contract
- [quickstart.md](./quickstart.md) documents end-to-end validation scenarios and commands

**Agent Context Update**: No action required. This checkout has no Spec Kit agent-context update script or extension hook under `.specify/`; the available scripts stop at `setup-plan.sh` and `setup-tasks.sh`, so there is nothing to execute for this phase.

### Phase 2: Tasks

Task generation is intentionally deferred to `/speckit-tasks`.

## Design Artifacts Generated

| Artifact | Path | Purpose |
|----------|------|---------|
| Plan | `specs/015-step-custom-guidance/plan.md` | Technical context, structure, and phase summary |
| Research | `specs/015-step-custom-guidance/research.md` | Decisions for schema shape, prompt order, validation, and persistence |
| Data Model | `specs/015-step-custom-guidance/data-model.md` | Entities, relationships, validation rules, and prompt-state transitions |
| Contract | `specs/015-step-custom-guidance/contracts/backlog-step-guidance.md` | Backlog/catalog contract for step-scoped guidance |
| Contract | `specs/015-step-custom-guidance/contracts/step-prompt-assembly.md` | Runtime contract for deterministic prompt assembly |
| Quickstart | `specs/015-step-custom-guidance/quickstart.md` | Validation flow and expected outcomes |
