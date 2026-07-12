# Contract: F22 Config Resolution and Inspection

## Repo Config File

**Path**: `.msq/config.yaml`

**Format**:

```yaml
runtime:
  concurrency: 5
  notifications:
    channels:
      - type: slack
        webhookUrl: ${SLACK_WEBHOOK_URL}
defaults:
  tool: codex
  model: gpt-5.4
  effort: high
  skills:
    - speckit-implement
  stageSkills:
    plan:
      - speckit-plan
      - speckit-tasks
```

## Precedence Contract

The system resolves configuration in this order:

1. Global config: `~/.config/metal-squad/config.json`
2. Repo config: `.msq/config.yaml`
3. Backlog defaults: `backlog.yaml -> defaults`
4. Feature overrides: `backlog.yaml -> epics[].features[]`

Later layers override earlier layers only for explicitly provided fields.

## Environment Variable Contract

- Any string value in `.msq/config.yaml` may contain `${ENV_VAR}` placeholders.
- Placeholders are resolved before schema validation.
- Missing env vars produce a hard error naming:
  - the missing variable
  - the repo config path
  - the config field path when available

## CLI Inspection Contract

### Command

```bash
msq config show [--feature <feature-id>] [--json]
```

### Behavior

- Without `--feature`, returns runtime-effective config plus repo/backlog defaults context.
- With `--feature`, returns the fully resolved feature execution config.
- `--json` emits machine-readable JSON.
- Default output emits a readable summary including source paths and precedence notes.

### Error Cases

- Invalid YAML in `.msq/config.yaml`
- Repo config schema validation failure
- Missing referenced env var
- Unknown `--feature` id when feature-specific resolution is requested

## Shared Resolver Contract

All of the following consumers must use the same underlying resolution pipeline:
- CLI execution paths
- `msq config show`
- TUI config summary surface
- Web state/config detail surfaces

This avoids divergence between displayed config and actual runtime behavior.
