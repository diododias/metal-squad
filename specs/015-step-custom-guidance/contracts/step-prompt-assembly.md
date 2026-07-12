# Contract: Step Prompt Assembly

## Purpose

Define the deterministic runtime order for combining inherited guidance, step-specific skill guidance, direct prompt text, and runner-appended stage notes.

## Inputs

- `feature`: canonical feature payload
- `activeStage`: current stage name, or `null` for non-staged runs
- `baseSkills`: resolved inherited skills for this execution
- `stepGuidance`: optional guidance entry for `activeStage`
- `maxContextChars`: existing prompt truncation limit
- `runnerNotes`: optional runner-collected stage restrictions or admin inputs

## Resolution Rules

### 1. Base prompt

- render the current prompt exactly as today from `baseSkills`
- if `baseSkills` is empty, keep the existing fallback behavior

### 2. Step-guidance skill resolution

- if `activeStage` has `stepGuidance.skills`, resolve them through the shared `SkillRegistry`
- deduplicate by skill name against:
  - duplicates within `stepGuidance.skills`
  - any already-resolved `baseSkills`

### 3. Direct prompt block

- trim `stepGuidance.prompt`
- if the trimmed value is empty, treat it as absent

## Output Order

The final prompt must concatenate non-empty sections in this order:

1. rendered base prompt
2. rendered step-guidance skill prompt(s)
3. direct step-guidance prompt block
4. runner-appended stage notes and admin inputs

Sections remain separated by the existing prompt delimiter:

```text
\n\n---\n\n
```

## Behavioral Guarantees

- steps without `stepGuidance` produce byte-equivalent prompt output to current behavior
- step-specific additions apply only when `activeStage` matches the declared key
- retries and resumes for the same step rebuild the same prompt order from the same canonical feature payload
- named step-guidance skills preserve registry precedence
- direct prompt blocks never replace inherited context; they are additive only

## Example

Given:

- base stage skills: `["speckit-implement", "dev-flow"]`
- step guidance for `implement`:
  - `skills: ["repo-implement-guardrails", "dev-flow"]`
  - `prompt: "Touch only the files needed for this step."`

The assembled order is:

1. prompt rendered from `speckit-implement`
2. prompt rendered from `dev-flow`
3. prompt rendered from `repo-implement-guardrails`
4. direct prompt block `"Touch only the files needed for this step."`
5. runner stage notes

`dev-flow` is not rendered twice.
