# metal-squad (`msq`)

`metal-squad` is a backlog-driven AI development orchestrator built around a
repo-local `backlog.yaml`, a global SQLite state database, and tool adapters
such as `codex`, `claude`, and `opencode`.

It executes work as a graph of `epics -> features -> tasks`, supports staged
flows such as `specify -> plan -> implement -> validate`, persists runs across
repositories, and can ask for human approval or input through Telegram.

## What It Does

- Stores project work in a versioned `backlog.yaml`
- Resolves dependencies between features before execution
- Runs one feature or a whole backlog with configurable concurrency
- Supports staged workflows with pause/resume/abort and approval gates
- Persists runs, token usage, output, retry history, gates, and pipelines in SQLite
- Streams notifications to Telegram, Slack, Discord, webhook, or desktop
- Keeps a legacy TUI for monitoring runs, gates, output, and costs
- Exposes the official web dashboard for remote monitoring and control
- Lets you customize prompts via builtin, global, repo, and Spec Kit skills

## Requirements

- Node.js `>=20`
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

Examples:

```bash
npm run dev -- init
npm run dev -- run --feature feat-08
npm run dev -- ui
```

## Quick Start

1. Create or edit a `backlog.yaml` in the repo root.
2. Install and authenticate the adapter CLI you want to use.
3. Register the repo and create the initial backlog if needed:

```bash
msq init
```

4. Run a single feature:

```bash
msq run --feature feat-08
```

5. Inspect status:

```bash
msq status
msq stats --period 7d
msq ui
```

## Core Files and Paths

- Repo-local backlog: `./backlog.yaml`
- Example backlog: [backlog.example.yaml](./backlog.example.yaml)
- Global config: `~/.config/metal-squad/config.json`
- Global DB: `~/.local/share/metal-squad/app.db`
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

### `msq daemon`

Manages a background web daemon.

```bash
msq daemon start
msq daemon stop
msq daemon status
msq daemon restart
```

The daemon stores its PID in `~/.local/share/metal-squad/daemon.pid`.

## Backlog Model

The loader-backed filename is `backlog.yaml`.

The current schema version is `2`. Version `1` still parses, but the loader
prints a warning and normalizes it to v2 shape.

### Top-Level Schema

```yaml
version: 2
repo: metal-squad
epics:
  - id: e02-modern-tui
    title: E02 - Modern TUI
    features: []
```

### Supported Fields

Top level:

- `version`
- `repo`
- `epics`

Defaults e budget sao configurados no Projeto (catalogo SQLite). O
`backlog.yaml` e um asset de importacao somente de epics e features. Backlogs
legados com `defaults` continuam carregando, mas o bloco e ignorado com aviso.

`feature`:

- `id`
- `title`
- `spec`
- `tool`
- `model`
- `effort`
- `dependsOn`
- `tasks`
- `skills`
- `specFile`
- `context`
- `workflow`
- `retry`
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

### Defaults and Inheritance

`metal-squad` applies defaults in this order:

1. Defaults do Projeto (DB)
2. Valores explicitos da feature

Current propagation behavior:

- Defaults do Projeto propagam para features que omitem valores de execucao.
- Valores explicitos da feature continuam tendo precedencia.

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
- `validate -> reviewr`

Stage skill precedence is:

1. System defaults
2. Global config `stageSkills`
3. Projeto (catalogo SQLite) `stageSkills`

If a stage has no explicit mapping, the registry tries to resolve a skill with
the same name as the stage itself.

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

- `feature.spec`
- `feature.specFile`
- `feature.context`
- `feature.tasks`
- `task.taskFile`

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
  "staleRunThresholdMinutes": 120,
  "promptContextCharLimit": 20000,
  "theme": "default",
  "telegramChatId": "123456789",
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
  "workflow": {
    "pollIntervalMs": 2000
  },
  "budget": {
    "defaultMaxCostUsd": 5,
    "alertAtPercent": 80
  },
  "stageSkills": {
    "specify": ["speckit-specify"],
    "plan": ["speckit-plan", "speckit-tasks"],
    "implement": ["speckit-implement", "dev-flow"],
    "validate": ["reviewr"]
  },
  "web": {
    "host": "127.0.0.1",
    "port": 8743,
    "auth": "token"
  }
}
```

### Config Semantics

- `concurrency`: default concurrency for `msq run`
- `toolTimeoutMs`: adapter timeout floor for tools that use it
- `staleRunThresholdMinutes`: used by `msq status --repair-stale`
- `promptContextCharLimit`: max chars per context section injected into prompts
- `theme`: optional built-in TUI theme name: `default`, `dark`, `light`, or `minimal`
- `telegramChatId`: legacy shortcut for a Telegram notification destination
- `notifications.channels`: preferred notification routing
- `notifications.events`: which events should be emitted
- `workflow.autoAdvance`: project default with per-feature override for staged auto-advance
- `workflow.pollIntervalMs`: polling interval for stage request resolution
- `budget.defaultMaxCostUsd`: fallback cost cap when backlog has no `budget.maxCostUsd`
- `budget.alertAtPercent`: alert threshold percentage
- `stageSkills`: global stage-to-skill overrides
- `web.host`: bind address for the web dashboard
- `web.port`: port for the web dashboard
- `web.auth`: `token` or `none`

### Precedence

For stage skill mapping:

1. system mapping
2. global config `stageSkills`
3. Projeto `stageSkills` (catalogo SQLite)

For feature execution values:

1. defaults do Projeto (catalogo SQLite)
2. campos da feature

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

- repos
- runs
- token usage
- gates
- retry history
- run output
- task runs
- pipelines
- run events
- stage requests

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
specs/
tests/
```

## Related Docs

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/ROADMAP.md](./docs/ROADMAP.md)
- [docs/features](./docs/features)
- [backlog.example.yaml](./backlog.example.yaml)
