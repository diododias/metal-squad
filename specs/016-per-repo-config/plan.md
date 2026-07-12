# Implementation Plan: F22 - Per-Repo Config

**Branch**: `[016-per-repo-config]` | **Date**: 2026-07-12 | **Spec**: [/Users/luizdiodo/new_repos/metal-squad/specs/016-per-repo-config/spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-per-repo-config/spec.md`

## Summary

Add repository-scoped configuration via `.msq/config.yaml`, merge it between the existing global config and backlog/feature settings, resolve `${ENV_VAR}` placeholders during load, and expose the effective resolved configuration through a dedicated inspection surface (`msq config show` plus shared resolver output for TUI/web).

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js >=20.17.0

**Primary Dependencies**: `zod`, `yaml`, `commander`, `better-sqlite3`, `ink`, `react`

**Storage**: Local files (`~/.config/metal-squad/config.json`, repo `.msq/config.yaml`, `backlog.yaml`) plus SQLite runtime/catalog state

**Testing**: `vitest`, plus build/typecheck via `npm run build` and `npm run typecheck`

**Target Platform**: Local CLI/TUI/web runtime on macOS/Linux Node environments

**Project Type**: CLI orchestrator with TUI and local web companion

**Performance Goals**: Config resolution remains local-file bounded and completes fast enough to keep CLI/TUI startup interactive; no network dependency for config loading

**Constraints**: Must preserve current behavior when `.msq/config.yaml` is absent; must keep precedence deterministic; must fail clearly on invalid repo config or missing env vars; must not store resolved secrets back into repo files

**Scale/Scope**: Single repository context per invocation; one repo-local config file; shared resolution path reused by CLI, TUI, web, and runner

## Constitution Check

The current `.specify/memory/constitution.md` is still an unfilled template, so there are no ratified project-specific constitutional gates to enforce from that file.

Operational gates derived from the live repo remain:
- Keep the implementation in the current checkout on `develop` semantics, with no new worktrees.
- Preserve backward compatibility for repos without `.msq/config.yaml`.
- Validate through the repo baseline relevant to touched code: `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint` if TypeScript source changes require it.

**Gate Status (pre-design)**: PASS

## Project Structure

### Documentation (this feature)

```text
specs/016-per-repo-config/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── config-resolution-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── init.ts
│   ├── run.ts
│   ├── resume.ts
│   └── status.ts
├── config/
│   └── index.ts
├── core/
│   ├── backlog/
│   │   ├── load.ts
│   │   └── schema.ts
│   ├── runner/
│   │   └── execute.ts
│   ├── skills/
│   │   └── backlog.ts
│   └── workflow/
│       └── stageSkills.ts
├── ui/
│   ├── commands/
│   │   └── definitions.ts
│   ├── components/
│   └── catalog.ts
└── web/
    ├── server.ts
    ├── state.ts
    └── static/

tests/
├── commands/
├── config/
├── runner/
├── ui/
└── web/
```

**Structure Decision**: Extend the existing single-project CLI structure. Centralize new merge logic in `src/config/`, integrate backlog/feature precedence where feature execution is already assembled, and reuse the same resolver output for CLI inspection plus TUI/web read paths.

## Phase 0: Research Decisions

- Use `.msq/config.yaml` as the repository-scoped config file to match the existing F22 feature doc and avoid colliding with global JSON config.
- Introduce a shared effective-config resolver rather than scattering merge logic across commands, runner, TUI, and web.
- Scope env interpolation to string values anywhere in repo config, with `${VAR_NAME}` syntax and fail-fast errors on missing variables.
- Add `msq config show` as the primary explicit inspection interface, while allowing TUI/web surfaces to consume the same resolved payload.

## Phase 1: Design Direction

### Config Resolution Model

1. Load global config from `~/.config/metal-squad/config.json` using the current `ConfigSchema`.
2. Optionally load `.msq/config.yaml` from the active repo root.
3. Resolve env placeholders within repo config before schema validation.
4. Merge global config with repo config into a repo-effective base.
5. Merge repo-effective defaults with backlog defaults.
6. Merge feature overrides last when resolving a concrete feature execution view.

### Proposed Implementation Areas

- `src/config/index.ts`
  - Add repo config path discovery and parsing.
  - Add env interpolation and clear source-specific errors.
  - Add shared helpers for global, repo, and effective config resolution.
- `src/core/backlog/schema.ts`
  - Introduce repo-config schema for repo-level execution defaults compatible with backlog/feature semantics.
- `src/core/backlog/load.ts` and/or a new resolver module
  - Build a normalized effective execution config object for inspection and runtime usage.
- `src/commands/`
  - Add `msq config show` command with human-readable and JSON output.
- `src/ui/commands/definitions.ts`, `src/ui/catalog.ts`, `src/web/*`
  - Reuse the same resolver to show effective config, instead of only raw global config or backlog snippets.
- `tests/config`, `tests/commands`, `tests/ui`, `tests/web`, `tests/runner`
  - Cover missing-file compatibility, precedence, env interpolation, invalid repo config, and inspection output.

### Agent Context Update

No dedicated agent-context update script exists in this repo's `.specify/scripts/` or adjacent project automation. For this plan stage, that step is a documented no-op.

## Post-Design Constitution Check

- No ratified constitution rules were introduced or violated.
- The design preserves the repo's current validation baseline and no-worktree rule.
- Backward-compatibility remains explicit in the design.

**Gate Status (post-design)**: PASS

## Complexity Tracking

No constitution violations require justification.
