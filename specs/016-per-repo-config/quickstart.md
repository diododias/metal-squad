# Quickstart: F22 - Per-Repo Config

## Prerequisites

- Run from `/Users/luizdiodo/new_repos/metal-squad`
- Install dependencies: `rtk npm install`
- Use a repo-local DB for isolated validation when exercising runtime flows:

```bash
export MSQ_DB_PATH="$(pwd)/.metal-squad/app.db"
```

## Scenario 1: Repo config overrides global runtime settings

1. Create `.msq/config.yaml` with a runtime override such as `runtime.concurrency: 5`.
2. Keep global config at a different value in `~/.config/metal-squad/config.json`.
3. Run:

```bash
rtk node dist/index.js config show --json
```

Expected result:
- Output shows the repo config path.
- Resolved runtime config reports `concurrency: 5`.
- Unspecified settings still match the global baseline.

## Scenario 2: Backlog defaults still override repo defaults

1. In `.msq/config.yaml`, set:

```yaml
defaults:
  tool: claude
  effort: low
```

2. In `backlog.yaml`, keep conflicting defaults such as `tool: codex` and `effort: medium`.
3. Run:

```bash
rtk node dist/index.js config show --json
```

Expected result:
- Repo defaults are visible as an input layer.
- Effective backlog-level defaults resolve to the backlog values.

## Scenario 3: Feature overrides still win last

1. Pick a feature with explicit `tool`, `model`, or `effort`.
2. Run:

```bash
rtk node dist/index.js config show --feature feat-22 --json
```

Expected result:
- The feature view shows feature-level values taking precedence over backlog, repo, and global layers.

## Scenario 4: Environment variable interpolation works

1. Set an environment variable:

```bash
export SLACK_WEBHOOK_URL="https://example.test/webhook"
```

2. Reference it from `.msq/config.yaml`.
3. Run:

```bash
rtk node dist/index.js config show --json
```

Expected result:
- Resolved output contains the runtime value, not the `${SLACK_WEBHOOK_URL}` literal.

## Scenario 5: Missing environment variable fails clearly

1. Reference an unset `${MISSING_SECRET}` in `.msq/config.yaml`.
2. Run:

```bash
rtk node dist/index.js config show
```

Expected result:
- Command exits with an error mentioning `.msq/config.yaml` and `MISSING_SECRET`.
- No partial or silent fallback is reported.

## Validation Commands

Run after implementation:

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

## Related Artifacts

- Spec: `specs/016-per-repo-config/spec.md`
- Plan: `specs/016-per-repo-config/plan.md`
- Data model: `specs/016-per-repo-config/data-model.md`
- Contract: `specs/016-per-repo-config/contracts/config-resolution-contract.md`
