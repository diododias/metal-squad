# Research: Step-Scoped Custom Guidance

**Feature**: 015-step-custom-guidance  
**Date**: 2026-07-12  
**Status**: Complete

## Overview

This document records the design decisions needed to add step-scoped guidance without breaking the current skill registry, backlog validation flow, or prompt builder behavior introduced by F02 and F03.

## Research Task 1: What is the correct "step" abstraction in the current product?

**Question**: The feature asks for per-step guidance, but which runtime unit should own that customization in today's `msq` architecture?

### Decision: attach guidance to workflow stages under `feature.workflow`

Proposed shape:

```yaml
workflow:
  mode: staged
  stages: [specify, plan, tasks, implement, validate]
  stepGuidance:
    implement:
      skills:
        - repo-implement-guardrails
      prompt: |
        Focus only on implementing the requested scope.
        Do not continue to validate in this session.
```

**Rationale**:
- The live execution unit in staged mode is the workflow stage, orchestrated from `src/core/runner/execute.ts`
- `src/core/workflow/stageSkills.ts` already maps stage ids like `plan` and `implement` to built-in skill sets
- `TaskSchema.skills` already serves a different concern: task-level backlog decomposition, not stage-time prompt customization
- Keeping the data under `workflow` preserves locality with existing stage configuration such as `stages`, `approvals`, and `sessionPolicy`

**Alternatives considered**:
- Add fields to `TaskSchema`: rejected because tasks are optional backlog artifacts and are not the runtime step unit used by staged execution
- Add a top-level `feature.stepGuidance`: rejected because it would split workflow behavior across separate branches of the feature model
- Introduce a new generic `steps[]` structure: rejected because it would duplicate the already-shipped workflow stage model

## Research Task 2: How should named step guidance be resolved?

**Question**: Should named step guidance have a custom lookup path?

### Decision: reuse the existing skill registry and backlog validation flow

**Rationale**:
- `.claude/rules/architecture.md` explicitly treats duplicated skill precedence as an antipattern
- `src/core/skills/registry.ts` already encodes the canonical precedence `repo > global > external > builtin`
- `src/core/skills/backlog.ts` already gathers and validates skill names referenced by the backlog
- Reusing `resolve()` and `validate()` preserves the F02 mental model and keeps missing-skill failures uniform

**Practical effect**:
- step-guidance skill references are added to the same collected skill-name set used during backlog validation
- the current failure shape remains authoritative:

```text
Missing skills referenced in backlog: <skill-name>
```

- prompt assembly should consume resolved `Skill[]` objects, not invent a step-only resolution routine

**Alternatives considered**:
- Create `resolveStepGuidance()` inside backlog or runner code: rejected because it would drift from the canonical registry over time
- Allow direct filesystem paths in step guidance: rejected because the requirement explicitly prefers reuse of the existing registry instead of a parallel discovery model

## Research Task 3: Where should direct prompt text and resolved step skills be merged?

**Question**: Which layer should combine inherited guidance, step guidance skills, and direct prompt text?

### Decision: centralize composition in prompt-building code, with the runner only passing the active stage

**Rationale**:
- `src/core/backlog/prompt.ts` already owns template rendering, prompt normalization, and injected sections
- `src/core/runner/execute.ts` already knows which stage is being executed, but should not reimplement string assembly policy
- Keeping composition in prompt code avoids scattering prompt-order rules across runner, backlog loader, and adapters

**Deterministic order**:
1. Resolved inherited/base skills for the feature and current stage mapping
2. Resolved step-guidance skills for the active stage, deduplicated by skill name against base skills
3. Direct step prompt block, if non-empty after trim
4. Runner-appended stage notes and admin inputs

**Alternatives considered**:
- Pre-merge step skills into `feature.skills`: rejected because it would leak step-scoped behavior into unrelated stages
- Let the runner append raw skill file contents itself: rejected because that would make the runner a second prompt builder

## Research Task 4: How should the backlog and catalog preserve the new data?

**Question**: What must change so step guidance behaves identically from `backlog.yaml` and from the SQLite catalog?

### Decision: make step guidance part of the validated `Feature.workflow` payload serialized into the catalog

**Rationale**:
- `src/core/backlog/load.ts` validates YAML into `BacklogV2`
- `src/db/backlogCatalog.ts` persists the full serialized `Feature` object in `data_json`
- `loadBacklogFromCatalog()` hydrates features by reparsing `data_json` through `FeatureSchema`
- If `WorkflowSchema` carries `stepGuidance`, the catalog path inherits the same behavior automatically with no second mapper

**Alternatives considered**:
- Re-read `backlog.yaml` for step guidance at runtime: rejected because catalog-backed execution is the runtime source of truth after backlog import
- Store step guidance in a separate DB table: rejected because this is static feature configuration that belongs with the feature payload

## Research Task 5: How should direct prompt text be normalized?

**Question**: What is the safest rule for empty or whitespace-only custom prompt blocks?

### Decision: trim and ignore empty direct prompt text

**Rationale**:
- The spec requires blank blocks to be ignored rather than rendered as empty guidance sections
- `src/core/backlog/prompt.ts` already normalizes whitespace and section separators, so this behavior belongs there
- Ignoring empty blocks avoids regressions in byte-sensitive prompt comparisons for steps that effectively have no direct custom text

**Alternatives considered**:
- Preserve raw whitespace-only prompt blocks: rejected because they create empty sections and violate FR-010
- Reject empty prompt blocks as invalid schema: rejected because silent ignore is simpler and friendlier for operators editing YAML

## Research Task 6: What validation strategy best proves the behavior?

**Question**: Which automated and manual checks should cover this feature?

### Decision: extend backlog, prompt, skills, and runner tests; keep live execution optional

**Rationale**:
- `tests/backlog/schema.test.ts` can prove contract parsing and invalid step references
- `tests/core/skills-backlog.test.ts` can prove referenced step-guidance skills are validated
- `tests/backlog/load-prompt.test.ts` and `tests/backlog/prompt-extended.test.ts` can prove exact prompt output and deterministic ordering
- `tests/runner/execute.test.ts` can prove staged runs pass the active stage and preserve retry/resume behavior

**Required automated coverage**:
- schema defaults for `workflow.stepGuidance`
- rejection when step-guidance keys do not exist in `workflow.stages`
- rejection when a named step-guidance skill is missing
- prompt output for:
  - no step guidance
  - named step-guidance skill only
  - direct prompt block only
  - both together
  - duplicate inherited plus step skill names
  - whitespace-only direct prompt
- parity between YAML-loaded and catalog-loaded features

**Manual smoke coverage**:
- `rtk npm run build`
- `rtk npm test`
- `rtk npm run typecheck`
- optional focused staged prompt smoke test after implementation lands
