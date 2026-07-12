# Contract: Backlog Step Guidance

## Purpose

Define how a feature declares step-scoped guidance in `backlog.yaml` and how that data survives validation and catalog import.

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
      - id: feat-46
        title: F46 - Prompt/Skill Customizado por Step
        tool: codex
        effort: medium
        workflow:
          mode: staged
          stages: [specify, plan, tasks, implement, validate]
          approvals:
            channel: telegram
            autoAdvance: false
          syncTasksToBacklog: true
          stepGuidance:
            implement:
              skills:
                - repo-implement-guardrails
              prompt: |
                Focus only on implementing the requested scope.
                Do not continue to validation in this session.
```

## Contract Rules

### 1. Location

- `stepGuidance` lives under `feature.workflow`
- keys are stage ids from `workflow.stages`

### 2. Entry Shape

Each `stepGuidance.<stage>` entry supports:

```ts
{
  skills?: string[];
  prompt?: string;
}
```

### 3. Validation

- unknown step keys are rejected
- `skills` values are validated through the existing skill registry path
- duplicate skill names are tolerated in config but normalized away before prompt assembly
- empty or whitespace-only `prompt` values are ignored
- if both `skills` and `prompt` are absent or inert, the entry is effectively inert and may be normalized away

### 4. Defaults

- omitting `stepGuidance` means no step-specific customization
- steps not listed in `stepGuidance` preserve current behavior
- existing `feature.skills`, task skills, and built-in stage skill mappings remain valid and unchanged

### 5. Catalog Persistence

- the validated `Feature.workflow.stepGuidance` payload is serialized with the rest of the feature in the backlog catalog
- `loadBacklogFromCatalog()` must hydrate the same structure that `loadBacklog()` returns from YAML

## Failure Contract

The backlog load/validation path must fail before execution when a referenced named step-guidance skill is missing.

Expected failure shape:

```text
Missing skills referenced in backlog: <skill-name>
```

## Non-Goals

- no new precedence tiers
- no direct filesystem path references for step guidance
- no separate DB table for static step-guidance config
