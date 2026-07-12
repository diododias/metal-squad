# Quickstart: Step-Scoped Custom Guidance

## Goal

Validate that one workflow step can receive additive custom guidance without breaking steps that rely on the current default prompt behavior.

## Prerequisites

- Node.js `>=20.17.0`
- Dependencies installed with `npm install`
- Run from repo root: `/Users/luizdiodo/new_repos/metal-squad`

## Validation Scenario 1: No regression for features without step guidance

1. Prepare a feature fixture with normal `workflow.stages` and no `workflow.stepGuidance`.
2. Assemble prompts for at least two stages, including one built-in stage such as `implement`.
3. Compare the output against current baseline behavior.

Expected outcome:
- prompt output is unchanged for every stage
- no blank guidance sections are introduced

## Validation Scenario 2: Named guidance skill for one step only

1. Add `workflow.stepGuidance.implement.skills` pointing to a known skill name.
2. Ensure the same skill name exists in more than one discovery source when testing precedence.
3. Validate the backlog and assemble prompts for `implement` and one untouched stage.

Expected outcome:
- `implement` includes the resolved guidance from the same winning source chosen by the standard skill registry
- the untouched stage does not include the extra guidance

## Validation Scenario 3: Direct prompt text for one step only

1. Add `workflow.stepGuidance.plan.prompt` with a non-empty prompt block.
2. Assemble prompts for `plan` and another stage with no customization.

Expected outcome:
- only the `plan` prompt contains the direct custom text
- other stages remain unchanged

## Validation Scenario 4: Named skill plus direct prompt together

1. Add both `skills` and `prompt` under the same `workflow.stepGuidance.<stage>` entry.
2. Include one duplicate skill that is already inherited through base stage skill mapping.
3. Assemble the prompt for that stage.

Expected outcome:
- inherited/base guidance appears first
- step-guidance skill prompts appear next, without duplicate rendering
- direct prompt text appears after resolved skill prompts

See [contracts/step-prompt-assembly.md](./contracts/step-prompt-assembly.md) for the required output order.

## Validation Scenario 5: Missing named guidance fails before execution

1. Add `workflow.stepGuidance.implement.skills` with an unknown skill name.
2. Run backlog validation.

Expected outcome:
- validation fails before execution starts
- the error identifies the missing reference using the existing missing-skill contract

## Validation Scenario 6: Catalog-backed parity

1. Load the backlog into the catalog.
2. Reconstruct the backlog through the catalog-backed path.
3. Assemble the same customized stage prompt from both sources.

Expected outcome:
- prompts are identical across YAML-backed and catalog-backed paths
- retries and resumes rebuild the same customized prompt order

## Suggested Automated Commands

```bash
rtk npx vitest run tests/backlog/schema.test.ts tests/backlog/load-prompt.test.ts tests/backlog/prompt-extended.test.ts tests/core/skills-backlog.test.ts tests/runner/execute.test.ts
rtk npm run build
rtk npm test
rtk npm run typecheck
```

Run `rtk npm run lint` as well if the implementation touches relevant TypeScript in `src/`.

## References

- [spec.md](./spec.md)
- [plan.md](./plan.md)
- [research.md](./research.md)
- [data-model.md](./data-model.md)
- [contracts/backlog-step-guidance.md](./contracts/backlog-step-guidance.md)
- [contracts/step-prompt-assembly.md](./contracts/step-prompt-assembly.md)
