# Quickstart: Validate Custom Skill or Prompt Per Step

## Goal

Prove that stage-specific guidance is parsed, validated, preserved through the catalog path, and injected only into the targeted stage prompt.

## Prerequisites

- Install dependencies: `rtk npm install`
- Use the repository root: `/Users/luizdiodo/new_repos/metal-squad`
- Keep a local DB when doing optional live smoke checks:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db"
```

## Core Validation Commands

Run the baseline quality gates:

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
```

If TypeScript in `src/` changed materially, also run:

```bash
rtk npm run lint
```

## Focused Automated Checks

Run the targeted suites for this feature:

```bash
rtk npx vitest run \
  tests/backlog/schema.test.ts \
  tests/backlog/load-prompt.test.ts \
  tests/backlog/prompt-extended.test.ts \
  tests/core/skills-backlog.test.ts \
  tests/runner/execute.test.ts
```

## Validation Scenarios

### Scenario 1: No stage guidance preserves existing behavior

1. Build a feature prompt for a staged feature with no `workflow.stageGuidance`
2. Build the same prompt after the feature is parsed through the updated schema

Expected outcome:
- prompt output is unchanged from pre-feature behavior

### Scenario 2: Named stage-guidance skill applies only to one stage

1. Configure `workflow.stageGuidance.implement.skills` with a known skill
2. Assemble the `implement` stage prompt
3. Assemble another stage prompt for the same feature, such as `validate`

Expected outcome:
- `implement` contains the extra skill content
- `validate` does not contain that content

### Scenario 3: Direct prompt block is additive and trimmed

1. Configure `workflow.stageGuidance.plan.prompt` with non-empty text
2. Assemble the `plan` stage prompt
3. Repeat with a whitespace-only prompt value

Expected outcome:
- non-empty text appears after inherited/stage skill prompts
- whitespace-only text is ignored

### Scenario 4: Missing stage-guidance skill fails before execution

1. Configure `workflow.stageGuidance.tasks.skills` with an unknown skill name
2. Validate/load the backlog

Expected outcome:
- backlog validation fails with `Missing skills referenced in backlog: ...`

### Scenario 5: Catalog-backed execution preserves stage guidance

1. Load a backlog containing `workflow.stageGuidance`
2. Import it into the catalog path
3. Hydrate the feature back from the catalog and rebuild the target stage prompt

Expected outcome:
- YAML-backed and catalog-backed prompt outputs match

## Optional Live Smoke Check

After implementation, an optional minimal smoke check can confirm the staged runner uses the target stage prompt:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js backlog load
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js run --feature feat-62
```

Expected outcome:
- the targeted stage receives the extra guidance
- unaffected stages keep their normal prompt shape
- no missing-skill or prompt-assembly regressions appear

## Related Design References

- [plan.md](./plan.md)
- [research.md](./research.md)
- [data-model.md](./data-model.md)
- [contracts/backlog-stage-guidance.md](./contracts/backlog-stage-guidance.md)
- [contracts/stage-prompt-assembly.md](./contracts/stage-prompt-assembly.md)
