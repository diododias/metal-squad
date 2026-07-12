# Data Model: Custom Skill or Prompt Per Step

**Feature**: 013-step-custom-skill  
**Date**: 2026-07-12

## Overview

This feature introduces stage-keyed guidance metadata on a feature workflow and a deterministic prompt assembly path that merges inherited and stage-specific guidance only for the active stage.

## Entities

### 1. WorkflowStageGuidanceMap

Represents all stage-specific guidance declared for a feature.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `stageId` | `string` | Yes | Key from `workflow.stages` |
| `guidance` | `StageGuidance` | Yes | Guidance payload for that stage |

**Validation rules**:
- Every key in the map must exist in `workflow.stages`
- Omitted stages behave exactly as they do today
- Empty maps default to `{}` and do not change runtime behavior

### 2. StageGuidance

Represents the extra guidance attached to one workflow stage.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `skills` | `string[]` | No | Named references resolved via the existing skill registry |
| `prompt` | `string` | No | Direct additive prompt block for this stage |

**Validation rules**:
- At least one of `skills` or `prompt` must be meaningfully present for the entry to matter
- `skills` defaults to `[]`
- `prompt` is trimmed before use; empty or whitespace-only values are ignored
- Duplicate skill names inside the same stage guidance are deduplicated before resolution/assembly

### 3. ResolvedStageGuidance

Represents a validated, runtime-ready version of `StageGuidance`.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `stage` | `string` | Yes | Active workflow stage |
| `resolvedSkills` | `Skill[]` | Yes | Skills returned by `createSkillRegistry().resolve()` |
| `promptBlock` | `string \| null` | Yes | Trimmed direct prompt block or `null` |

**Validation rules**:
- `resolvedSkills` must preserve registry precedence and request order after name deduplication
- Missing named skills fail validation before execution
- `promptBlock = null` means "no direct prompt contribution"

### 4. PromptAssemblyContext

Represents all inputs used to build the final prompt for an execution.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `feature` | `Feature` | Yes | Canonical feature payload from YAML or catalog |
| `baseSkills` | `Skill[]` | Yes | Skills inherited from feature-level or stage-level defaults |
| `activeStage` | `string \| null` | No | Current stage for staged execution; `null` for non-staged runs |
| `stageGuidance` | `ResolvedStageGuidance \| null` | No | Applies only when `activeStage` has guidance |
| `maxContextChars` | `number` | Yes | Existing prompt truncation guardrail |
| `adminInputs` | `string[]` | No | Runner-only stage notes appended after prompt assembly |

### 5. FinalStagePrompt

Represents the fully assembled prompt sent to the adapter for one stage.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `basePrompt` | `string` | Yes | Output of inherited/base skill rendering |
| `stageSkillPrompt` | `string \| null` | Yes | Rendered output from stage-guidance skills |
| `directPromptBlock` | `string \| null` | Yes | Trimmed direct stage prompt text |
| `runnerStageNotes` | `string` | Yes | Existing stage-only instructions/admin inputs |
| `finalPrompt` | `string` | Yes | Deterministic concatenation of all non-empty sections |

## Relationships

- A `Feature.workflow` optionally owns one `WorkflowStageGuidanceMap`
- Each `WorkflowStageGuidanceMap` entry points to one `StageGuidance`
- A `StageGuidance.skills[]` entry references skills discoverable by the shared `SkillRegistry`
- A staged execution creates one `PromptAssemblyContext` per active stage
- Each `PromptAssemblyContext` yields one `FinalStagePrompt`

## State Transitions

### StageGuidance Resolution

```text
declared in backlog/catalog
  -> validated against workflow.stages
  -> named skills validated by registry
  -> prompt text trimmed
  -> resolved for active stage at prompt-build time
```

### Prompt Assembly

```text
base feature/stage skills rendered
  -> optional stage-guidance skills rendered
  -> optional direct stage prompt appended
  -> runner stage notes/admin inputs appended
  -> final prompt emitted to adapter
```

## Notes for Implementation

- The contract should live under `WorkflowSchema`, not `TaskSchema`, because current step execution is stage-based
- Catalog persistence should require no custom migration logic beyond serializing the updated `Feature` payload shape
- Prompt assembly should deduplicate named skills by skill name before rendering stage-specific additions, so inherited and stage-specific references do not render the same skill twice
