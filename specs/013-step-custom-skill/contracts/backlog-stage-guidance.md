# Contract: Backlog Stage Guidance

## Purpose

Define how a feature declares stage-specific guidance in `backlog.yaml` and how that data survives validation and catalog import.

## Scope

- Applies to version 2 backlog features using `workflow.stages`
- Covers static configuration only
- Does not introduce new skill discovery sources or adapter APIs

## Proposed YAML Shape

```yaml
version: 2
repo: metal-squad
defaults:
  tool: codex
  effort: medium
  skills: []
epics:
  - id: e18-skills-customization
    title: E - Skills
    features:
      - id: feat-62
        title: F46 - Prompt/Skill Customizado por Step
        tool: codex
        effort: medium
        workflow:
          mode: staged
          stages: [specify, plan, tasks, implement, validate]
          approvals:
            channel: telegram
            autoAdvance: true
          syncTasksToBacklog: true
          stageGuidance:
            implement:
              skills:
                - repo-implement-guardrails
              prompt: |
                Focus only on implementing the requested scope.
                Do not continue to validate in this stage.
```

## Contract Rules

### 1. Location

- `stageGuidance` lives under `feature.workflow`
- keys are stage ids from `workflow.stages`

### 2. Entry Shape

Each `stageGuidance.<stage>` entry supports:

```ts
{
  skills?: string[];
  prompt?: string;
}
```

### 3. Validation

- unknown stage keys are rejected
- `skills` values are validated through the existing skill registry path
- duplicate skill names are tolerated but normalized away before prompt assembly
- empty or whitespace-only `prompt` values are ignored
- if both `skills` and `prompt` are absent or empty, the entry is effectively inert and may be normalized away

### 4. Defaults

- omitting `stageGuidance` means no stage-specific customization
- stages not listed in `stageGuidance` preserve current behavior
- existing `feature.skills`, task skills, and stage-skill defaults remain valid and unchanged

### 5. Catalog Persistence

- the validated `Feature.workflow.stageGuidance` payload is serialized with the rest of the feature in the backlog catalog
- `loadBacklogFromCatalog()` must hydrate the same structure that `loadBacklog()` returns from YAML

## Failure Contract

The backlog load/validation path must fail before execution when a referenced named stage-guidance skill is missing.

Expected failure class:

```text
Missing skills referenced in backlog: <skill-name>
```

## Non-Goals

- no new precedence tiers
- no filesystem path references for stage guidance
- no separate DB table for static stage-guidance config
