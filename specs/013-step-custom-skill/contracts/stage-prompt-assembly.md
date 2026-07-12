# Contract: Stage Prompt Assembly

## Purpose

Define the deterministic runtime order for combining inherited guidance, stage-specific skill guidance, direct prompt text, and runner stage notes.

## Inputs

- `feature`: canonical feature payload
- `activeStage`: current stage name, or `null` for non-staged runs
- `baseSkills`: resolved inherited skills for this execution
- `stageGuidance`: optional guidance entry for `activeStage`
- `maxContextChars`: existing prompt truncation limit
- `adminInputs`: optional runner-collected inputs already attached to the stage

## Resolution Rules

### 1. Base prompt

- render the current prompt exactly as today from `baseSkills`
- if `baseSkills` is empty, keep the existing fallback behavior

### 2. Stage-guidance skill resolution

- if `activeStage` has `stageGuidance.skills`, resolve them through the shared `SkillRegistry`
- deduplicate by skill name against:
  - duplicates within `stageGuidance.skills`
  - any already-resolved `baseSkills`

### 3. Direct prompt block

- trim `stageGuidance.prompt`
- if the trimmed value is empty, treat it as absent

## Output Order

The final prompt must concatenate non-empty sections in this order:

1. rendered base prompt
2. rendered stage-guidance skill prompt(s)
3. direct stage-guidance prompt block
4. runner-appended stage notes and admin inputs

Sections remain separated by the existing prompt delimiter:

```text
\n\n---\n\n
```

## Behavioral Guarantees

- stages without `stageGuidance` produce byte-equivalent prompt output to current behavior
- stage-specific additions apply only when `activeStage` matches the declared key
- retries and resumes for the same stage rebuild the same prompt order from the same canonical feature payload
- named stage-guidance skills preserve registry precedence
- direct prompt blocks never replace inherited context; they are additive only

## Example

Given:

- base stage skills: `["speckit-implement", "dev-flow"]`
- stage guidance for `implement`:
  - `skills: ["repo-implement-guardrails", "dev-flow"]`
  - `prompt: "Touch only the files needed for this stage."`

The assembled order is:

1. prompt rendered from `speckit-implement`
2. prompt rendered from `dev-flow`
3. prompt rendered from `repo-implement-guardrails`
4. direct prompt block `"Touch only the files needed for this stage."`
5. runner stage notes

`dev-flow` is not rendered twice.
