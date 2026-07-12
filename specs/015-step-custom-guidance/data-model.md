# Data Model: Step-Scoped Custom Guidance

## Overview

This feature extends the existing workflow-stage model so a single execution step can carry additive guidance without changing unrelated steps. In the current `msq` architecture, a "step" maps to a `workflow.stage`.

## Entities

### Workflow Step

Represents one executable stage within `feature.workflow.stages`.

**Fields**

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Stage identifier such as `specify`, `plan`, `tasks`, `implement`, or `validate` |
| `mappedSkills` | `string[]` | Effective stage skill names from `src/core/workflow/stageSkills.ts` plus repo/config overrides |
| `sessionPolicy` | derived | Existing session isolation policy remains unchanged |

**Rules**
- Must exist in `feature.workflow.stages`
- Continues to inherit current feature-level guidance unless explicitly removed by an existing supported mechanism

### Step Guidance

Represents step-scoped additive customization for one workflow step.

**Proposed shape**

```ts
type StepGuidance = {
  skills?: string[];
  prompt?: string;
};
```

**Rules**
- Attached under `feature.workflow.stepGuidance[stageId]`
- `skills` contains named references resolved through the existing skill registry
- `prompt` is additive text for the targeted step only
- Empty or whitespace-only `prompt` values are ignored
- If both `skills` and `prompt` are absent or inert, the entry has no runtime effect

### Guidance Reference

Represents one named pointer to a discovered skill.

**Fields**

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Skill name declared in backlog config |
| `source` | `repo \| global \| external \| builtin` | Determined by `src/core/skills/registry.ts` |
| `promptTemplate` | `string` | Resolved skill content rendered by the prompt builder |

**Rules**
- Must be validated before execution using the existing backlog skill validation path
- Must preserve standard precedence `repo > global > external > builtin`
- Duplicate names are deduplicated before prompt assembly

### Prompt Assembly Context

Represents the full set of inputs used to build the final prompt for one step execution.

**Fields**

| Field | Type | Notes |
|-------|------|-------|
| `feature` | `Feature` | Canonical validated feature payload |
| `activeStage` | `string \| null` | Current workflow stage for staged runs; `null` for non-staged paths |
| `baseSkills` | `Skill[]` | Resolved inherited skills already used by the feature/stage |
| `stepGuidanceSkills` | `Skill[]` | Resolved additive step-guidance skills for the active stage |
| `directPrompt` | `string \| null` | Trimmed step-specific prompt block |
| `runnerNotes` | derived | Existing runner-appended guidance such as stage/session restrictions |

**Rules**
- Stages without step guidance must produce the same prompt output as today
- Step-guidance additions apply only when `activeStage` matches the declared key
- Output ordering must be deterministic across retries and resumes

## Relationships

- One `Feature` has one `Workflow`
- One `Workflow` has many `Workflow Step` entries in `workflow.stages`
- One `Workflow` may have zero or more `Step Guidance` entries keyed by stage id
- One `Step Guidance` may reference zero or more `Guidance Reference` names
- One `Prompt Assembly Context` is built per step execution attempt

## Validation Rules

### Schema Validation

- `workflow.stepGuidance` defaults to absent or empty
- Every key in `workflow.stepGuidance` must match a member of `workflow.stages`
- `skills`, when present, must be an array of strings
- `prompt`, when present, must be a string

### Backlog Validation

- Named guidance references are added to the set collected by backlog skill validation
- Missing references fail fast before execution with the existing missing-skill error shape

### Prompt Validation

- `prompt.trim()` equal to empty string is treated as no direct prompt
- Duplicate step-guidance skill names are normalized away
- Step-guidance skills already present in the inherited/base skill set are not rendered twice

## Persistence Model

### YAML Source

The authoritative authoring format remains `backlog.yaml` version 2:

```yaml
workflow:
  mode: staged
  stages: [specify, plan, tasks, implement, validate]
  stepGuidance:
    implement:
      skills: [repo-implement-guardrails]
      prompt: |
        Focus only on implementation changes.
```

### Catalog Source

- `src/db/backlogCatalog.ts` persists the full `Feature` as JSON in `data_json`
- `src/core/backlog/load.ts` reconstructs features from catalog rows by reparsing that JSON through `FeatureSchema`
- Step guidance therefore survives backlog load, catalog import, retries, and resume flows as long as it remains part of the validated `Feature.workflow` payload

## State Transitions

### Prompt Construction

1. Load validated `Feature`
2. Determine current `activeStage`
3. Resolve inherited/base skills using existing stage mapping and feature/default skill inputs
4. Resolve optional `workflow.stepGuidance[activeStage].skills`
5. Trim optional `workflow.stepGuidance[activeStage].prompt`
6. Concatenate non-empty sections in deterministic order
7. Execute the step with the assembled prompt

### Retry/Resume

1. Reload canonical feature payload from the active backlog/catalog path
2. Recompute prompt for the same `activeStage`
3. Reapply the same step guidance and ordering rules
4. Continue execution without divergence from the original configuration
