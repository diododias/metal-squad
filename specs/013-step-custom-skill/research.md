# Research: Custom Skill or Prompt Per Step

**Feature**: 013-step-custom-skill  
**Date**: 2026-07-12  
**Status**: Complete

## Overview

This document records the design decisions needed to add stage-scoped guidance without breaking the existing feature-level prompt and skill model introduced by F02 and F03.

## Research Task 1: What is the correct "step" abstraction in the current product?

**Question**: The spec says "step", but which runtime unit should own the customization in today's `msq` architecture?

### Decision: attach guidance to workflow stages under `feature.workflow`

Proposed shape:

```yaml
workflow:
  mode: staged
  stages: [specify, plan, tasks, implement, validate]
  stageGuidance:
    implement:
      skills:
        - repo-implement-guardrails
      prompt: |
        Focus only on the implementation stage.
        Do not continue to validation in this session.
```

**Rationale**:
- The live execution unit in staged mode is the workflow stage, resolved in `src/core/runner/execute.ts`
- `TaskSchema.skills` already covers task-level skill usage, so overloading tasks for this feature would mix two different concepts
- A stage-keyed map stays aligned with the current `workflow.stages` list and can be validated against it
- Using `workflow.stageGuidance` keeps the configuration next to existing stage behavior such as approvals and stage ordering

**Alternatives considered**:
- Add the fields to `TaskSchema`: rejected because tasks are optional backlog decomposition artifacts, while this feature targets the staged execution steps themselves
- Add a top-level `feature.stageGuidance`: rejected because it would split workflow behavior across separate branches
- Introduce a generic `steps[]` structure: rejected because it would duplicate the already-shipped workflow stage model

## Research Task 2: How should named guidance skills be resolved?

**Question**: Should stage-specific named guidance use its own lookup path?

### Decision: reuse the existing skill registry and backlog validation flow

**Rationale**:
- `.claude/rules/architecture.md` explicitly calls duplicated precedence logic an antipattern
- `src/core/skills/registry.ts` already encodes the canonical precedence `repo > global > external > builtin`
- `src/core/skills/backlog.ts` already gathers and validates all skill names referenced by a backlog
- Reusing `resolve()` and `validate()` preserves the F02 mental model and keeps missing-skill failures uniform

**Practical effect**:
- stage-guidance skill references are added to the set collected by `collectBacklogSkillNames()`
- the same `Missing skills referenced in backlog: ...` failure path remains authoritative
- prompt assembly receives resolved `Skill[]` objects, not raw stage-guidance names

**Alternatives considered**:
- A parallel `resolveStageGuidance()` implementation in backlog/prompt code: rejected because it would drift from the canonical registry
- Allow inline filesystem paths instead of skill names: rejected because the spec asks to reuse the registry when possible and avoid a second discovery model

## Research Task 3: Where should direct prompt text and resolved stage skills be merged?

**Question**: Which layer should combine inherited guidance, stage skill prompts, and direct stage prompt text?

### Decision: centralize composition in prompt-building code, with the runner only passing the active stage

**Rationale**:
- `src/core/backlog/prompt.ts` already owns rendering templates, spec/context/task injection, and prompt normalization
- `src/core/runner/execute.ts` already adds stage-specific notes such as "Run only this stage in this session"
- Keeping the merge in prompt-related code avoids spreading string-construction rules between runner and backlog loader

**Deterministic order**:
1. Resolved inherited/base skills for the feature or stage
2. Resolved stage-guidance skills for the active stage, deduplicated by skill name against inherited/base skills
3. Direct stage prompt block, if non-empty after trim
4. Runner-appended stage notes/admin inputs

**Alternatives considered**:
- Pre-merge stage skills into `feature.skills`: rejected because it would leak stage-specific behavior into unrelated stages
- Let the runner append raw skill files itself: rejected because the runner should not reimplement template rendering

## Research Task 4: How should the backlog and catalog preserve the new data?

**Question**: What must change so stage guidance behaves the same from `backlog.yaml` and from the catalog DB?

### Decision: make stage guidance part of the validated `Feature` payload serialized into the catalog

**Rationale**:
- `loadBacklog()` parses YAML into a validated `BacklogV2`
- `loadBacklogFromCatalog()` hydrates `Feature` objects from persisted `data_json`
- If `FeatureSchema` / `WorkflowSchema` carry `stageGuidance`, the catalog path inherits the behavior automatically without a second mapper
- This directly supports FR-009 and the retry/resume requirement because retries read the same canonical feature payload

**Alternatives considered**:
- Recompute stage guidance from `backlog.yaml` on every run: rejected because runtime now uses the catalog as source of truth after backlog import
- Store stage guidance in a separate DB table: rejected because the feature only needs static configuration preserved with the feature payload

## Research Task 5: What validation strategy best proves the behavior?

**Question**: Which automated and manual checks should cover this feature?

### Decision: extend backlog/prompt/skills/runner tests, keep live execution optional

**Rationale**:
- `tests/backlog/schema.test.ts` can prove contract parsing and invalid stage references
- `tests/core/skills-backlog.test.ts` can prove referenced stage-guidance skills are validated
- `tests/backlog/load-prompt.test.ts` and `tests/backlog/prompt-extended.test.ts` can prove exact prompt output and deterministic ordering
- `tests/runner/execute.test.ts` can prove staged runs pass the active stage and preserve retry/resume behavior

**Required automated coverage**:
- schema defaults for `workflow.stageGuidance`
- rejection when stage-guidance keys do not exist in `workflow.stages`
- rejection when a named stage-guidance skill is missing
- prompt output for:
  - no stage guidance
  - named stage-guidance skill only
  - direct prompt block only
  - both together
  - duplicate inherited + stage skill names
  - whitespace-only direct prompt
- parity between YAML-loaded and catalog-loaded features

**Manual smoke coverage**:
- `rtk npm run build`
- `rtk npm test`
- `rtk npm run typecheck`
- optional focused `msq` staged prompt smoke test once implementation lands
