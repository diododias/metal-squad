# Research: F22 - Per-Repo Config

## Decision: Use `.msq/config.yaml` as the repo-local configuration file

**Rationale**:
- The existing feature doc `docs/features/F22-per-repo-config.md` already names `.msq/config.yaml`.
- YAML matches the current backlog authoring style and is better suited than JSON for checked-in repo config with comments and nested settings.
- Keeping repo config under `.msq/` avoids collision with user-global `~/.config/metal-squad/config.json`.

**Alternatives considered**:
- `.msq/config.json`: consistent with global config, but less ergonomic for repo-managed authoring.
- `backlog.yaml` only: rejected because F22 explicitly needs repo-scoped behavior outside backlog-only settings.

## Decision: Resolve config through one shared pipeline

**Rationale**:
- Current runtime behavior is split between `loadConfig()` for global settings and backlog/feature propagation in `src/core/backlog/load.ts`.
- F22 adds a new precedence layer, so duplicating merge logic across CLI, runner, TUI, and web would create drift.
- A shared resolver lets `msq config show`, execution, and UI surfaces describe the same effective config.

**Alternatives considered**:
- Merge repo config only inside the runner: rejected because FR-008 requires inspection, not only execution-time behavior.
- Merge repo config only inside `loadConfig()`: rejected because backlog and feature precedence must still remain explicit and testable.

## Decision: Support `${ENV_VAR}` placeholders recursively in repo config string values

**Rationale**:
- The feature spec requires environment-backed sensitive values, including nested config locations.
- Recursive string substitution before schema validation keeps failure reporting deterministic and schema-safe.
- `${VAR_NAME}` is already familiar and was documented in `docs/features/F22-per-repo-config.md`.

**Alternatives considered**:
- Only top-level placeholder support: rejected because the spec calls out nested values.
- Silent fallback to empty string when vars are missing: rejected because FR-007 requires clear errors.
- Shell-style expansion at command execution time only: rejected because users need resolved-config inspection before running features.

## Decision: Add `msq config show` as the explicit resolved-config interface

**Rationale**:
- The repo already exposes a TUI command that prints a config summary, but there is no dedicated CLI contract for resolved configuration.
- A CLI command is the lowest-friction way to satisfy SC-001 and FR-008 for both automated tests and human validation.
- The same resolver output can be reused later by TUI/web views without inventing separate representations.

**Alternatives considered**:
- TUI-only inspection: rejected because it is harder to automate and less direct for scripts.
- Web-only inspection: rejected because web auth/runtime setup is heavier than a local CLI read.

## Decision: Represent repo-level execution defaults as a dedicated repo-config section aligned with backlog semantics

**Rationale**:
- Global `ConfigSchema` currently covers runtime/system settings like concurrency, notifications, workflow, and stage skills.
- Backlog and feature layers already own execution defaults such as `tool`, `effort`, `skills`, and `stageSkills`.
- F22 must let a repository define defaults without forcing edits in global config, so the repo file should be able to express backlog-like defaults alongside runtime overrides.

**Alternatives considered**:
- Restrict repo config to the current `ConfigSchema` only: rejected because it would not satisfy FR-009 around backlog behavior defaults.
- Put execution defaults directly at the repo-config root: rejected because a dedicated section preserves clearer semantics and safer merging.
