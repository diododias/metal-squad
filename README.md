# metal-squad (`msq`)

`metal-squad` is a multi-repo AI development orchestrator. A global SQLite
database is the authoritative source of operational state — Projects, Epics,
Work Items, Tasks, runs, and repo links all live there. `backlog.yaml` (and the
newer v3 asset) are import seeds and export artifacts, never a live
reconciliation source. Execution itself runs through tool adapters such as
`codex`, `claude`, and `opencode`.

The domain hierarchy is `Project -> Epic -> Work Item (type: feature|bug, one
target Repository) -> Task`. A Project groups one or more Repositories and
Epics; each Work Item targets exactly one Repository belonging to its Epic's
Project. `metal-squad` executes work as a dependency graph, supports staged
flows such as `specify -> plan -> implement -> validate`, persists runs across
repositories, and can ask for human approval or input through Telegram.

## What It Does

- Manages Projects, Epics, Work Items, and Tasks in a global SQLite catalog
- Links, moves, and unlinks Repositories from Projects with transactional safety
- Imports `backlog.yaml`/v3 assets as non-destructive seeds and exports the
  catalog back to a portable v3 asset
- Resolves dependencies between Work Items before execution, refusing
  cross-repo dependencies before a pipeline starts
- Routes execution, config, and skill discovery to the correct Repository path
  per Work Item, regardless of the terminal's current directory
- Runs one Work Item or a whole Repository backlog with configurable concurrency
- Supports staged workflows with pause/resume/abort and approval gates
- Applies an archive/delete/restore lifecycle with tombstones — no destructive
  deletes, no ID reuse
- Persists runs, token usage, output, retry history, gates, pipelines, and
  audit events in SQLite
- Backs up and restores the SQLite catalog WAL-safely
- Streams notifications to Telegram, Slack, Discord, webhook, or desktop
- Keeps a legacy TUI for monitoring runs, gates, output, and costs
- Exposes the official web dashboard for remote monitoring and control across
  Projects
- Lets you customize prompts via builtin, global, repo, and Spec Kit skills

## Requirements

- Node.js `24.16.x` (use `nvm use` to load the repository version)
- One or more supported CLIs installed and authenticated when used:
  - `codex`
  - `claude`
  - `opencode`
- Optional for notifications:
  - Telegram bot token stored in the OS keychain
  - Slack / Discord / webhook endpoints

## Installation

```bash
npm install
npm run build
npm link
```

This exposes:

- `msq`
- `metal-squad`

If your shell reports `permission denied: msq`, rebuild before linking:

```bash
npm run build
npm link
```

For local development without rebuilding:

```bash
npm run dev -- <command>
```

## Continuous Integration

The `CI / qualidade-completa` GitHub Actions check runs for pull requests to
`develop`, pushes to `develop`, and manual dispatches. It uses the same complete,
disposable-database quality gate as local development:

```bash
npm run gate:full
```

After the workflow succeeds for the first time, configure the `develop` GitHub
ruleset to require `CI / qualidade-completa` and require source branches to be
up to date before merge.

Examples:

```bash
npm run dev -- init
npm run dev -- run --feature feat-08
npm run dev -- ui
```

## Quick Start

1. Create or edit a `backlog.yaml` in the repo root (or prepare a v3 asset for
   a multi-repo Project — see [Backlog Model](#backlog-model)).
2. Install and authenticate the adapter CLI you want to use.
3. Register the repo, then create a Project and link the repo to it:

```bash
msq init
msq projects create "My Project"
msq projects repos link <projectId> --repo-id <repoId>
```

4. Load the backlog into the catalog (creates Epics/Work Items under that
   Project's linked repo):

```bash
msq backlog load
```

5. Run a single Work Item (still identified by its legacy `feature` id in v2
   seeds):

```bash
msq run --feature feat-08
```

6. Inspect status:

```bash
msq status
msq stats --period 7d
msq ui
msq web
```

## Core Files and Paths

- Repo-local backlog seed: `./backlog.yaml`
- Example backlog: [backlog.example.yaml](./backlog.example.yaml)
- Global config: `~/.config/metal-squad/config.json`
- Global DB (authoritative catalog): `~/.local/share/metal-squad/app.db`
- SQLite backups: `~/.config/metal-squad/backup/<timestamp>/app.db` (run `npm run db:backup`, or `msq db backup --output <path>` for an ad hoc copy)
- Repo skills: `./.msq/skills/<skill-name>/`
- Global skills: `~/.config/metal-squad/skills/<skill-name>/`
- Generated task decomposition output: `./.msq/generated/<featureId>/decompose.yaml`

Real feature runs should use the global DB path above (no override) so run/completion
history accumulates in one place — that history is what drives "Ready to start" in the
TUI. Only override it in sandboxed/test environments where the global path is genuinely
not writable:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" msq run --feature feat-08
```

## Command Reference

### `msq init`

Creates `backlog.yaml` if it does not exist and registers the current repo in
the global DB.

```bash
msq init
```

### `msq projects`

Manages Projects and their linked Repositories. A Project groups Repositories
and Epics and owns the Work Item type-to-template map.

```bash
msq projects list
msq projects list --include-archived --include-deleted --format json
msq projects create "My Project" --description "..."
msq projects update <projectId> --name "New name" --expected-revision <rev>
msq projects archive <projectId> --expected-revision <rev>
msq projects delete <projectId> --expected-revision <rev>
msq projects restore <projectId> --expected-revision <rev>

msq projects repos link <projectId> --repo-id <repoId> --path <path>
msq projects repos move <repoId> <toProjectId>
msq projects repos unlink <repoId>
```

A Repository belongs to at most one Project at a time; `repos move` transfers
it transactionally. `--expected-revision` guards mutations against concurrent
edits (see [Revision Concurrency](#revision-concurrency-and-mutation-contract)).

### `msq epics`

Manages Epics within a Project. An Epic has no operational Repository of its
own — every Work Item under it still targets one Repository of the Project.

```bash
msq epics list --project-id <projectId>
msq epics create <projectId> "Epic title" --description "..."
msq epics update <epicId> --status in_progress --expected-revision <rev>
msq epics archive <epicId> --expected-revision <rev>
msq epics delete <epicId> --expected-revision <rev>
msq epics restore <epicId> --expected-revision <rev>
```

Epic `status` (`todo | in_progress | done`) is set manually; Work Item status
stays derived from its runs.

### `msq work-items`

Creates and manages Work Items — the canonical term for a unit of work of type
`feature` or `bug`. Each Work Item targets exactly one Repository linked to
its Epic's Project.

```bash
msq work-items create --epic <epicId> --repo <repoId> --title "..." \
  --description "..." --depends-on <workItemId>
msq work-items archive <workItemId> --expected-revision <rev>
msq work-items delete <workItemId> --expected-revision <rev>
msq work-items restore <workItemId> --expected-revision <rev>
```

`--depends-on` may be repeated; cross-repo dependencies are rejected before a
pipeline is created.

### `msq run`

Executes the backlog using the dependency graph.

```bash
msq run
msq run --feature feat-08
msq run --concurrency 2
msq run --feature feat-08 --auto-advance-stages
```

Options:

- `-f, --feature <id>`: run only one feature
- `-c, --concurrency <n>`: override global concurrency
- `--auto-advance-stages`: skip manual stage approval and advance automatically

### `msq resume <target>`

Resumes a paused or aborted pipeline using a run id, feature id, or repo id.

```bash
msq resume 12
msq resume feat-08
msq resume c23e66ae4cb5
```

Options:

- `-c, --concurrency <n>`: override global concurrency

### `msq decompose <featureId>`

Asks the feature adapter to break a feature into smaller tasks. The agent must
write the output YAML to `.msq/generated/<featureId>/decompose.yaml`.

```bash
msq decompose feat-08
msq decompose feat-08 --apply
```

Options:

- `--apply`: merge suggested tasks back into `backlog.yaml`

### `msq skills`

Lists skills discoverable from builtin, global, repo, and Spec Kit sources.

```bash
msq skills
```

### `msq status`

Shows the most recent runs and resumable pipelines.

```bash
msq status
msq status -n 50
msq status --repair-stale
msq status --repair-stale --stale-minutes 180
```

Options:

- `-n, --limit <n>`: number of runs displayed
- `--repair-stale`: mark orphan `running` runs as `failed` before listing
- `--stale-minutes <n>`: threshold for stale-run repair

### `msq stats`

Shows aggregated stats or a detailed run time breakdown.

```bash
msq stats
msq stats --period 7d
msq stats --tool codex
msq stats --repo c23e66ae4cb5 --format json
msq stats --run 42
```

Options:

- `--period <period>`: `24h`, `7d`, `30d`, `2w`
- `--repo <repoId>`: filter by repo id
- `--tool <tool>`: `claude`, `codex`, `opencode`
- `--run <runId>`: show a time breakdown for one run
- `--format <format>`: `text` or `json`

When `--run` is used, `msq` also reports the run's context-exploration mix
(Dora queries, Serena queries, and shell reads) when that telemetry is present.

### `msq ui`

Starts the legacy interactive TUI. New UI work targets `msq web`.

```bash
msq ui
```

### `msq web`

Starts the web dashboard in the foreground.

```bash
msq web
msq web --host 0.0.0.0 --port 8743
msq web --no-auth
```

Options:

- `--host <host>`: bind address (default `127.0.0.1`)
- `--port <port>`: port number (default `8743`)
- `--no-auth`: disable password authentication
- `--rotate-token`: generate a fresh auto-generated password before starting,
  invalidating the previous one (ignored when `MSQ_WEB_PASSWORD` is set)

No credential is ever put in the printed URL. Open it, then log in through the
password form at `/auth` (a plain HTML form, submitted via `POST`, never a
query param). The password is resolved in this order:

1. `MSQ_WEB_PASSWORD` env var — set your own, never persisted by `msq`.
2. a fallback token auto-generated on first run and stored in the OS keychain
   (fallback to `~/.config/metal-squad/config.json` under `webToken`).

Programmatic clients can still authenticate with `Authorization: Bearer
<password>` or by sending `{ type: 'auth', token: '...' }` over WebSocket.

#### Analytics

Open **Analytics** in the web dashboard to inspect token consumption, efficiency,
and operational waste. The initial state contains only a seven-day summary and
the top five groups; detailed breakdowns, Work Items, drilldowns, and CSV/JSON
exports are requested on demand, so a normal state push does not grow with the
total run history.

Use the Project context by default, or select **All projects** and refine by
Epic, Repository, Work Item, tool, model, stage, status, or data quality.
Click a Tool, Model, or Stage group to apply that filter; select a Work Item to
open its bounded run drilldown; export always applies the current filters.

`unknown/unscoped` means an older run lacks a Project or Epic snapshot;
`unknown model` means its model was not recorded; and `derived` values were
reconstructed from historical telemetry. These rows remain in totals so the
breakdowns reconcile with the summary, but comparisons involving them can be
partial. Exports contain aggregate analytics only and omit repository paths,
branch names, commit SHAs, and PR URLs.

For repeatable Analytics performance checks, use the sandbox-only fixture:

```bash
rtk node scripts/with-sandbox-db.mjs npm run db:fixture -- --scenario analytics-volume
```

It creates 3 Projects, 6 Repositories, 12 Epics, 24 Work Items, and 3,600
deterministic telemetry rows, including incomplete historical data. The
regression baseline exercises summary, breakdown, and ranking queries in under
1.5 seconds and checks the relevant SQLite index plan; it never writes the
global catalog.

### `msq daemon`

Manages a background web daemon.

```bash
msq daemon start
msq daemon stop
msq daemon status
msq daemon restart
```

The daemon stores its PID in `~/.local/share/metal-squad/daemon.pid`.

### `msq backlog load`

Consumes a `backlog.yaml` (v1/v2, repo-scoped) or a v3 asset (Project-scoped,
multi-repo) and publishes epics/Work Items into the catalog DB as a
non-destructive import seed. Never overwrites or archives existing entities by
YAML diff; conflicts are reported explicitly instead of applied.

```bash
msq backlog load
msq backlog load --file ./backlog.yaml --dry-run
msq backlog load --file ./export.v3.yaml --project <projectId> \
  --repo-map repoA=/abs/path/to/repoA --repo-map repoB=/abs/path/to/repoB
```

Options:

- `--file <path>`: seed file (default: `./backlog.yaml` in the current repo)
- `--mode <mode>`: import mode, only `seed` is supported
- `--format <format>`: `text` or `json` report
- `--dry-run`: print the plan without writing to the DB
- `--project <id>`: target Project for a v3 asset (default: the asset's own id)
- `--repo-map <repoId>=<path>`: resolve a v3 asset's repository ids to local
  paths; repeatable

### `msq backlog export`

Exports a Project's catalog (Epics, Work Items, linked Repositories) from the
DB to a portable v3 asset (YAML or JSON) — the inverse of `backlog load` for a
v3 asset, used for backup, transport, and disaster recovery.

```bash
msq backlog export --project <projectId>
msq backlog export --project <projectId> --file ./export.v3.yaml
msq backlog export --project <projectId> --format json --include-archived
```

Options:

- `--project <id>` (required): Project to export
- `--file <path>`: output file (default: stdout)
- `--format <format>`: `yaml` (default) or `json`
- `--include-archived`: include archived Epics/Work Items
- `--include-paths`: include each Repository's local path (not portable across
  machines — omit when sharing the export)

### `msq db backup` / `msq db restore`

Creates or restores a WAL-safe, integrity-checked copy of the SQLite catalog.
Prefer these over copying `app.db` directly while `msq` may be running.

```bash
msq db backup --output ~/backups/app-$(date +%Y%m%d).db
msq db restore --input ~/backups/app-20260701.db
msq db restore --input ~/backups/app-20260701.db --yes
```

Options:

- `--output <path>` (required for `backup`): destination file
- `--input <path>` (required for `restore`): backup file to restore from
- `--yes`: skip the interactive confirmation prompt

`restore` saves a backup of the DB it is about to replace before overwriting
it, so a bad restore can itself be rolled back. See
[docs/runbooks/backup-restore.md](./docs/runbooks/backup-restore.md) for the
full backup/restore/migration/rollback runbook.

## Backlog Model

There are two seed/export formats: the repo-scoped `backlog.yaml` (v1/v2) and
the Project-scoped v3 asset. Both are import seeds and export artifacts, not a
live reconciliation source — the catalog DB is authoritative once a seed has
been loaded (see [Projects and source-of-truth governance](#projects-and-source-of-truth-governance)).

### v2: repo-scoped `backlog.yaml`

The loader-backed filename is `backlog.yaml`.

The current v2 schema version is `2`. Version `1` still parses, but the loader
prints a warning and normalizes it to v2 shape.

```yaml
version: 2
repo: metal-squad
epics:
  - id: e02-modern-tui
    title: E02 - Modern TUI
    features:
      - id: feat-01
        title: Example feature
        # Optional execution overrides; omitted values come from Repository defaults.
        tool: codex
        effort: high
```

`backlog.yaml` is an import seed for epics and Work Items, loaded into whatever
repo/Project the current repo is linked to. Repository defaults and budget
settings are stored in the catalog DB, not authored in this file. The loader
accepts legacy `defaults` and `budget` blocks for migration, warns that they
are ignored, and resolves effective execution values from Repository defaults.
The v2 seed still uses `features` as a compatibility import key; new domain
contracts use Work Item terminology.

Top level fields: `version`, `repo`, `epics`.

`feature` (v2 import key; canonical entity: `Work Item`):

- `id`
- `title`
- `spec`
- `tool`: a tool-registry ID, such as `codex`
- `model`
- `effort`
- `thinking`
- `dependsOn`
- `tasks`
- `skills`
- `specFile`
- `context`
- `workflow`
- `retry`
- `maxTokens`
- `autoStart`: opt-in auto-pilot flag (default `false`) — see
  [Auto-Pilot](#auto-pilot) below

`workflow`:

- `mode`: `single | staged`
- `stages`
- `approvals.channel`: currently `telegram`
- `autoAdvance`
- `syncTasksToBacklog`

`retry`:

- `maxAttempts`
- `backoffMs`
- `onFail`: `stop | continue | gate`

### v3: Project-scoped asset (multi-repo)

The v3 asset is the export/import format for a whole Project spanning multiple
Repositories, produced by `msq backlog export` and consumed by
`msq backlog load` (see [Command Reference](#msq-backlog-load)).

```yaml
version: 3
project:
  id: proj-1
  name: My Project
  description: optional
  position: 0
repositories:
  - repoId: repoA
    label: repo-a
    remote: git@example.com:org/repo-a.git
    path: /abs/path/to/repo-a   # only present with --include-paths
epics:
  - id: epic-1
    title: Epic title
    status: todo   # todo | in_progress | done
    position: 0
workItems:
  - id: feat-01
    title: Example Work Item
    epicId: epic-1
    repoId: repoA
    position: 0
    # remaining fields are the same execution fields as v2 `feature`
```

Loading a v3 asset resolves each `repoId` to a local path via `--repo-map
<repoId>=<path>`, an already-registered repo, or fails fast if neither is
available. `--project` overrides which Project the asset seeds into (default:
the asset's own `project.id`). Archived Epics/Work Items are included only when
exported with `--include-archived`, and `archivedAt` round-trips accordingly.

### Settings Ownership: App, Repository defaults, and Work Item

Settings have three explicit owners:

| Level | Source of truth | Owns | Execution inheritance |
| --- | --- | --- | --- |
| App | `~/.config/metal-squad/config.json` | runtime infrastructure, notifications, web settings, budget alerts, and the tool registry | Does not provide execution defaults |
| Repository defaults | catalog DB for the repository | execution defaults (`tool`, `model`, `effort`, `thinking`, skills, workflow, stage-to-skill map, and `maxTokens`) | Base for every Work Item in the Repository |
| Work Item | catalog entry imported from `backlog.yaml` and editable in Settings | Work Item-specific execution overrides and work | Overrides Repository defaults only |

`msq config show --feature <id>` is the current compatibility command and
resolves execution values in only two steps: **Repository defaults → Work Item**.
App configuration is intentionally outside that inheritance chain. A Work
Item's `tool` value is a reference to an App-level
tool-registry entry; the registry controls how the selected tool runs, not a
third layer of Work Item defaults.

### Tool Registry

The App-level `tools` registry declares the tools available to projects and
features. Every entry has an `id` referenced by `tool`, an `adapter`, and its
invocation and capability settings:

- `command`, `baseArgs`, `env`, and `versionCheck`
- `capabilities` and `thinkingBudget`
- `minTimeoutMs`

The default registry includes `claude`, `codex`, and `opencode`. Custom IDs are
allowed, and more than one ID may use the same adapter. A feature cannot select
an unregistered ID.

`task`:

- `id`
- `title`
- `status`: `todo | running | done | failed | blocked`
- `dependsOn`
- `taskFile`
- `skills`

### Real Backlog Example

See [backlog.yaml](./backlog.yaml) for the current repo configuration and
[backlog.example.yaml](./backlog.example.yaml) for a complete example covering
all schema options.

### Auto-Pilot

Set `autoStart: true` on a feature to opt it into automatic continuation
(default is `false`, manual-only). When a feature with `autoStart: true`
reaches a qualifying outcome, `msq` automatically starts the next eligible
`autoStart` feature — same dependency-respecting order the scheduler already
uses, without a fresh manual command:

- **success** — the finished feature stays `done`; the next eligible feature
  starts.
- **blocked** (waiting on human input or gate approval) — the feature stays
  blocked for manual recovery; the next eligible feature starts anyway.
- **ordinary execution failure** — the feature stays failed for manual
  recovery; the next eligible feature starts anyway.
- **budget/token protective stop** — auto-pilot halts; no further feature
  starts until an operator resolves the block manually. This preserves the
  budget cap guarantees from F14.
- **manual abort** — auto-pilot does not continue; recovery is manual.

Manual starts (`msq run --feature <id>`, or the web/TUI "start" action) work
the same as before for any feature, whether or not it has `autoStart: true`.
Only the *automatic* continuation is opt-in.

### Repository defaults and Work Item inheritance

`metal-squad` applies defaults in this order:

1. Repository defaults (DB)
2. Explicit Work Item values

Current propagation behavior:

- Repository defaults propagate to Work Items that omit execution values.
- Explicit Work Item values still take precedence.

### Projects and source-of-truth governance

The Projects roadmap adopts the hierarchy `Project -> Epic -> Work Item ->
Task`. A Project groups Repositories and Epics and owns the type-to-template
map. An Epic has no operational Repository, and each Work Item targets exactly
one Repository in its Epic's Project.

SQLite remains authoritative for operational state. Versioned specs, ADRs and
the constitution preserve intent and governance. `backlog.yaml` is a
non-destructive import seed with dry-run and explicit conflicts; it is not a
bidirectional reconciliation source. See [ADR-001](./docs/adr/ADR-001-governanca-fonte-de-verdade-terminologia.md)
and the [Projects roadmap](./docs/epics/epico%20-%20projetos/ROADMAP.md).

New Project contracts use `WorkItem`, `WorkItemCatalogEntry`, `workItemId`,
`action:createWorkItem`, and `msq work-items`. The existing v2 `features` YAML
key and persistence names such as `backlog_features`, `feature_id`,
`FeatureSchema`, and `projectDefaults` remain compatibility aliases during the
epic; they are not new domain names.

### Lifecycle: archive, delete, and restore

Project, Epic, and Work Item entities share one policy engine for lifecycle
transitions:

- A **pristine** entity (no run has ever started) can be archived or logically
  deleted. Delete uses a tombstone (`deleted_at`) — the ID is preserved and
  never reused.
- An entity with any **terminal run** (done, failed, aborted) can only be
  archived, not deleted.
- A **running** entity must be cancelled before it can be archived or deleted.
- `restore` reverses an archive and validates that ancestors (Epic, Project)
  and the linked Repository still exist and are reachable.

```bash
msq projects archive <projectId> --expected-revision <rev>
msq epics delete <epicId> --expected-revision <rev>
msq work-items restore <workItemId> --expected-revision <rev>
```

The web dashboard exposes the same actions plus an `/archived` view with
restore and an audit trail. Every mutation carries an audit event (actor,
entity, operation, timestamp).

### Revision concurrency and mutation contract

Mutating commands and WebSocket actions accept `--expected-revision` /
`revision` to detect concurrent edits: if the entity's current revision does
not match, the mutation is rejected with a typed conflict error instead of
silently overwriting another change. Every related write inside one mutation
uses a single transaction.

### Repo routing and health

Execution, config resolution, and skill discovery for a Work Item always use
its target Repository's registered path — not the terminal's current working
directory. If a Repository's registered path is missing, unreadable, or
outside an allowed root, the web dashboard reports it with a health
diagnostic instead of silently failing or starting a run against the wrong
directory.

### File Validation

If you use:

- `specFile`
- `taskFile`

the loader resolves them relative to the repo root and fails fast if the files
do not exist.

## How Execution Works

### Feature Graph

When you run `msq run`, the scheduler:

1. Loads and validates the backlog
2. Validates all referenced skills
3. Resolves the dependency graph from `dependsOn`
4. Schedules features respecting dependency readiness and concurrency
5. Persists all run state to SQLite

### Workflow Modes

#### `single`

Runs one session for the feature.

Use when the feature should be executed in one uninterrupted pass.

#### `staged`

Runs the feature stage by stage. The default system stage mapping is:

- `specify -> speckit-specify`
- `plan -> speckit-plan, speckit-tasks`
- `implement -> speckit-implement, dev-flow`
- `validate -> review`

The default workflow template supplies this mapping. Each Repository's
defaults can customize its `stageSkills`; App configuration does not provide a
competing stage-skill layer. If a stage has no explicit mapping, the registry
tries to resolve a skill with the same name as the stage itself.

### Approvals and Human Input

Staged workflows can ask for:

- approval to advance to the next stage
- free-form human input to continue the current stage

Telegram reply contracts:

- `stage:<requestId> advance`
- `stage:<requestId> hold`
- `stage:<requestId> retry`
- `input:<requestId> <your text>`

Gate reply contracts:

- `gate:<gateId> approve`
- `gate:<gateId> skip`
- `gate:<gateId> retry`

### Retry Policy

Each feature can define:

- how many attempts to make
- backoff between attempts
- what to do on failure

`onFail` behavior:

- `stop`: mark the run as failed
- `continue`: allow dependents to continue
- `gate`: create a gate and block progress

### Budget Enforcement

Backlog budgets are enforced during execution.

Supported limits:

- global token cap
- global estimated cost cap
- per-feature token cap

When the configured alert threshold is reached, `budget:alert` events are
emitted. When a limit is exceeded, the pipeline is paused or gated depending on
scope.

## Adapter Configuration

Supported `tool` values:

- `claude`
- `codex`
- `opencode`

### `claude`

- Uses `feature.model` as `--model` when provided
- Otherwise maps `effort` to:
  - `low -> haiku`
  - `medium -> sonnet`
  - `high -> opus`

### `codex`

- Uses `codex exec`
- Passes `feature.model` with `-m`
- Maps `effort` to `model_reasoning_effort`
- Uses at least a 30-minute timeout, or the higher configured timeout

### `opencode`

- Uses `opencode run`
- Expects `model` in `provider/model` format, for example:
  - `anthropic/claude-sonnet-4-5`

## Skills and Prompt Customization

Skills are prompt templates used to build the input given to the adapter.

### Discovery Order

Skills are resolved by priority in this order:

1. Repo-local skills: `./.msq/skills/<name>/`
2. Global skills: `~/.config/metal-squad/skills/<name>/`
3. Spec Kit skills discovered from `./.agents/skills/` and `./.specify`
4. Builtin skills

### Builtin Skills

Builtin skills include:

- `implement`
- `review`
- `test`
- `decompose`

### Repo Skill Layout

Minimal repo skill:

```text
.msq/
  skills/
    my-skill/
      SKILL.md
      metadata.yaml
```

Example:

```md
<!-- .msq/skills/my-skill/SKILL.md -->
Perform a targeted implementation for {{featureId}}.

{{summary}}

{{spec}}

{{context}}

{{tasks}}
```

```yaml
# .msq/skills/my-skill/metadata.yaml
description: Targeted implementation workflow
inputs: [summary, specFile, context, tasks]
outputs: [code]
```

Supported template variables:

- `{{featureId}}`
- `{{featureTitle}}`
- `{{summary}}`
- `{{spec}}`
- `{{context}}`
- `{{tasks}}`

Prompt inputs are assembled from:

- `feature.spec` — inlined as the feature summary
- `feature.specFile` — content **inlined** under a `--- path ---` block (the spec
  stays the only authoritative description of the feature shipped in full)
- `feature.context` — emitted as **paths only** so the agent loads them on demand
- `feature.tasks` — task metadata (`id`, `title`, status, deps, skills) is
  inlined
- `task.taskFile` — emitted as a `Task file: <path>` line per task, **not**
  inlined; the agent decides when (or whether) to read it

Long prompt sections are truncated according to `promptContextCharLimit`.

## Global Configuration

Global config lives at:

- `~/.config/metal-squad/config.json`

It is created automatically on first run.

### Full Config Shape

```json
{
  "concurrency": 3,
  "toolTimeoutMs": 600000,
  "heartbeatMs": 30000,
  "staleRunThresholdMinutes": 120,
  "idleThresholdMs": 30000,
  "promptContextCharLimit": 20000,
  "notifications": {
    "channels": [
      { "type": "desktop" },
      { "type": "telegram", "chatId": "123456789", "forumTopicId": 42 },
      { "type": "slack", "webhookUrl": "https://hooks.slack.com/services/..." },
      { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/..." },
      { "type": "webhook", "url": "https://example.com/msq" }
    ],
    "events": [
      "gate:created",
      "run:failed",
      "budget:alert",
      "run:done",
      "stage:approval",
      "stage:input"
    ]
  },
  "budget": {
    "alertAtPercent": 80
  },
  "web": {
    "host": "127.0.0.1",
    "port": 8743,
    "auth": "token"
  },
  "tools": [
    {
      "id": "codex",
      "adapter": "codex",
      "command": "codex",
      "baseArgs": [],
      "env": {},
      "versionCheck": ["--version"],
      "capabilities": { "model": true, "effort": true, "thinking": false },
      "thinkingBudget": {},
      "minTimeoutMs": 1800000
    }
  ]
}
```

### Config Semantics

- `concurrency`: default concurrency for `msq run`
- `toolTimeoutMs`: adapter timeout floor for tools that use it
- `heartbeatMs`: interval used by the App to report a running adapter's health
- `staleRunThresholdMinutes`: used by `msq status --repair-stale`
- `idleThresholdMs`: threshold for detecting a run with no useful output
- `promptContextCharLimit`: max chars per context section injected into prompts
- `notifications.channels`: preferred notification routing
- `notifications.events`: which events should be emitted
- `budget.alertAtPercent`: alert threshold percentage
- `web.host`: bind address for the web dashboard
- `web.port`: port for the web dashboard
- `web.auth`: `token` or `none`
- `tools`: App-level registry that resolves each selected tool ID to its adapter
  and invocation settings

### Precedence

For Work Item execution values:

1. Repository defaults
2. Work Item fields

App configuration is not an execution-default layer. It supplies infrastructure
and the tool registry; a selected Work Item/Repository-default tool ID must
resolve there.

## Notifications and Telegram

Notifications can be sent to:

- `desktop`
- `telegram`
- `slack`
- `discord`
- `webhook`

If no channel is configured, the dispatcher falls back to desktop notifications.

### Telegram Setup

Telegram requires:

- `telegramChatId` or `notifications.channels[].chatId`
- a bot token stored in the OS keychain under account `telegram-bot-token`

For feature-linked notifications, configure the chat as a Telegram forum
supergroup and make the bot an administrator with permission to create/manage
topics and send messages. Metal Squad creates one topic per `featureId` on the
first notification and reuses it across retries, stages, resumes, and restarts.
The optional `forumTopicId` remains the static destination for global or legacy
messages without a `featureId`; feature messages never fall back to that topic
or to another feature's topic.

There is currently no dedicated CLI command for secret management. From the repo
root, you can store the token with:

```bash
node --input-type=module -e "import { setSecret } from './dist/security/secrets.js'; await setSecret('telegram-bot-token', 'YOUR_BOT_TOKEN')"
```

The poller reads Telegram updates and resolves:

- gates
- stage approvals
- stage input requests

#### Enabling per-feature topics (step by step)

Making the bot an "administrator" is **not** enough on its own — Telegram gates
topic creation behind a specific permission that is not granted by default. If
it is missing, every notification tied to a `featureId` (including questions
that need your input) fails silently: it is logged to the server console but
never reaches the chat.

1. In the target Telegram group, open **Group settings → Topics** and enable
   **Topics** (this converts the group into a forum-enabled supergroup; the
   Telegram API reports this as `type: supergroup` + `is_forum: true`).
2. Open **Group settings → Administrators** and add the bot (or edit its
   existing admin entry).
3. In the bot's permission list, explicitly enable **Manage Topics** (labeled
   "Manage Topics" in English clients, may read differently in other
   languages). Being promoted to administrator does **not** enable this
   permission automatically — it must be toggled on by hand unless the bot is
   the group's creator.
4. Also keep **Send Messages** enabled for the bot.
5. Set the group's numeric id as `telegramChatId` / `notifications.channels[].chatId`.
   Supergroup ids are negative and typically start with `-100`.

If the permission was missing before, the next feature run/notification
automatically retries topic creation — no restart or cache clear is needed.

##### Verifying topic health

Metal Squad persists one row per `(chatId, featureId)` in the
`feature_topic_associations` table, including the last Telegram API error.
To check whether topics are actually being created:

```bash
sqlite3 -header -column ~/.local/share/metal-squad/app.db \
  "SELECT feature_id, state, last_error, updated_at
     FROM feature_topic_associations
    ORDER BY updated_at DESC LIMIT 20;"
```

- `state = 'active'` with a non-null `thread_id` means the topic exists and
  notifications for that feature should be delivering normally.
- `state = 'error'` with `last_error` containing
  `createForumTopic: Bad Request: not enough rights to create a topic` means
  the bot is missing the **Manage Topics** permission — revisit step 3 above.

## Legacy TUI Usage

Start it with:

```bash
msq ui
```

The TUI remains available for compatibility, but new features, improvements, and
hotfixes target the web dashboard.

The optional `theme` config changes the built-in TUI palette on the next
startup. If the configured value is unknown, `msq ui` falls back to `default`
and shows a notice in the UI instead of failing startup.

Main capabilities:

- browse recent runs
- inspect run output
- inspect task runs and stage progress
- view gates
- open cost dashboard
- launch pending features
- pause, resume, or abort pipelines

### TUI Shortcuts

- `q`: quit
- `tab`: cycle focus
- `esc`: return to overview / close dashboard
- `j` / `k` or arrow keys: move selection
- `enter`: open selected run
- `ctrl+s`: pause/resume output streaming in run view
- `d`: toggle dashboard
- `[` / `]`: change dashboard period
- `n`: start selected pending feature from overview
- `p`: pause selected pipeline
- `r`: resume selected pipeline
- `x`: abort selected feature or pipeline
- In gates panel:
  - `a`: approve
  - `s`: skip
  - `r`: retry

## Observability and Persistence

The SQLite DB persists:

- projects, repos, and Project-Repository links
- epics and Work Items (`backlog_features` is the legacy persistence name for
  Work Items, kept for compatibility)
- runs
- token usage
- gates
- retry history
- run output
- task runs
- pipelines
- run events
- stage requests
- audit events (actor, entity, operation, timestamp, revision)

`msq status`, `msq stats`, the web dashboard, and the legacy TUI all read from this DB.

## Troubleshooting

### `backlog.yml` is ignored

The consumed filename is `backlog.yaml`, not `backlog.yml`.

### DB is read-only or cannot be opened

Use a writable local DB path:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" msq run --feature feat-08
```

### Missing skills referenced in backlog

Run:

```bash
msq skills
```

Then either:

- add the missing skill under `.msq/skills/`
- add it under `~/.config/metal-squad/skills/`
- install or expose the corresponding Spec Kit skill
- remove the reference from the backlog

### Referenced files are missing

If `specFile` or `taskFile` points to a non-existent path, the loader fails
before execution. Fix the path or create the file.

### Repository path is unreachable

If a Work Item's target Repository path was moved, deleted, or is on an
unmounted volume, the web dashboard reports repo `health: unavailable` instead
of starting a run against the wrong directory. Re-link the Repository to its
current path (`msq projects repos link <projectId> --repo-id <repoId> --path
<newPath>`) before retrying. See
[docs/runbooks/backup-restore.md](./docs/runbooks/backup-restore.md) for full
repo-path recovery steps.

### Model not found

Check whether `tool` and `model` belong together. Examples:

- `tool: codex` with `model: gpt-5.4`
- `tool: claude` with a Claude model
- `tool: opencode` with `provider/model`

### No Telegram actions are being applied

Check:

- the bot token is stored in keychain under `telegram-bot-token`
- the configured chat id is correct
- `stage:approval`, `stage:input`, or `gate:created` are enabled in `notifications.events`

### Notifications (including questions) silently stop arriving

If per-feature topics were recently enabled and notifications for some or all
features stopped showing up in Telegram — with no visible error to the
user — the bot is very likely missing the **Manage Topics** admin permission
on the forum supergroup. Topic creation then fails on Telegram's side, the
failure is only logged server-side, and the notification for that `featureId`
is dropped instead of delivered. See
[Enabling per-feature topics](#enabling-per-feature-topics-step-by-step) and
[Verifying topic health](#verifying-topic-health) above to diagnose and fix it.

## Repository Structure

```text
src/
  index.ts
  cli.ts
  commands/
  config/
  core/
    adapters/
    backlog/
    budget/
    events/
    notify/
    orchestrator/
    runner/
    skills/
  db/
  security/
  ui/
docs/
  adr/
  epics/
  features/
  hotfixes/
  runbooks/
specs/
tests/
```

## Related Docs

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — placeholder; not a decision
  source, see [.claude/rules/repo-context.md](./.claude/rules/repo-context.md)
- [docs/ROADMAP.md](./docs/ROADMAP.md) — transition notice only, not a live backlog
- [ADR-001](./docs/adr/ADR-001-governanca-fonte-de-verdade-terminologia.md) —
  governance, source-of-truth, and terminology decisions for the Projects model
- [Projects epic roadmap](<./docs/epics/epico - projetos/ROADMAP.md>) —
  milestones and acceptance criteria for the multi-repo Project model
- [docs/runbooks/backup-restore.md](./docs/runbooks/backup-restore.md) —
  backup, restore, migration, rollback, and repo-path recovery
- [docs/features](./docs/features)
- [backlog.example.yaml](./backlog.example.yaml)
