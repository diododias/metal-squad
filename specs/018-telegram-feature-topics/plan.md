# Implementation Plan: F54 - Tópico de Telegram por Feature

**Branch**: `[018-telegram-feature-topics]` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-telegram-feature-topics/spec.md`

## Summary

Associar cada notificação vinculada a uma feature a um único tópico persistido
no supergrupo do Telegram, criando o tópico sob demanda e reutilizando-o em
retomadas, tentativas e reinícios. A implementação separa a resolução de
tópicos da entrega de mensagens, guarda a associação e seu último erro no
SQLite, valida o destino com a Bot API e mantém o roteamento legado para
notificações sem `featureId`.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js >=20.17.0

**Primary Dependencies**: `better-sqlite3` for persisted associations and
transactions, `zod` for notification configuration, native `fetch` for the
Telegram Bot API, `vitest` for mocked API/poller tests, and the existing event
bus/notification manager

**Storage**: Global SQLite database with a new feature-topic association table;
existing runtime config remains in `~/.config/metal-squad/config.json` or
`.msq/config.yaml`, and legacy `telegramChatId`/`forumTopicId` remain readable

**Testing**: Focused Vitest suites for topic resolution, DB migration,
Telegram payloads, event routing, and poller context validation, followed by
`npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`

**Target Platform**: Local macOS/Linux CLI, Ink legacy UI poller, and the web
dashboard process running with a Telegram bot that can manage forum topics

**Project Type**: CLI orchestrator with SQLite-backed runtime state, event-driven
notification adapters, and a React web dashboard

**Performance Goals**: Make a new feature topic and deliver its first message
within 10 seconds in at least 95% of accessible-destination attempts; reuse an
existing association without an extra Telegram topic-creation call; keep topic
resolution bounded to one create/recovery attempt per notification

**Constraints**: Telegram topic names are limited to 128 characters and text
messages to 4096 characters; feature titles must be sanitized/truncated while
preserving the stable ID; feature notifications must never fall back to another
feature's topic; a failed create/recovery/delivery must be persisted; global
notifications retain the configured legacy destination

**Scale/Scope**: One configured notification supergroup, many feature IDs, one
association per `(chatId, featureId)`, and all existing feature-linked events
(`run:start`, `run:failed`, `run:done`, `gate:created`, `stage:approval`, and
`stage:input`); no multi-supergroup policy or migration of historical messages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Source of truth**: PASS. The active spec is the versioned source of truth;
  implementation tasks must also update the F54 feature documentation and
  notification configuration guidance before observable behavior is released.
- **Layer ownership**: PASS. `src/core/notify/` owns Telegram API/routing,
  `src/db/` owns association persistence and migrations, `src/core/events/`
  supplies feature metadata, and the poller owns inbound context validation.
- **Validation**: PASS. Focused tests cover API payloads, idempotency,
  recovery, invalid destinations, poller isolation, and legacy routing; the
  repository build/test/typecheck/lint gates remain required for source edits.
- **Runtime evidence**: PASS with scoped applicability. The quickstart checks
  persisted association/error rows and captured Telegram requests; no nested
  executor run is required for an adapter-routing feature.
- **Harness safety**: PASS / not applicable. This plan does not validate the
  `msq` executor, create worktrees, or launch a nested runner.
- **UI scope**: PASS. No new UI surface is required; any configuration display
  remains read-only in the official web dashboard.
- **Gate Status (pre-design)**: PASS

## Project Structure

### Documentation (this feature)

```text
specs/018-telegram-feature-topics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── telegram-topic-routing-contract.md
└── tasks.md                 # created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/notify/
│   ├── telegram.ts                 # Bot API client and feature-aware send
│   ├── telegram-topics.ts          # title, resolve/create/recover policy
│   ├── telegram-poller.ts          # inbound chat/topic validation
│   └── manager.ts                   # event metadata and legacy fallback
├── core/events/
│   ├── notifications.ts             # feature metadata for routed events
│   └── types.ts                     # stable inbound/outbound event context
├── config/index.ts                  # compatible Telegram channel schema
└── db/
    ├── index.ts                     # migration for topic associations
    └── repo.ts                      # association/error read-write helpers

tests/
├── core/notify-telegram.test.ts
├── core/notify-telegram-topics.test.ts
├── core/notify-telegram-poller.test.ts
├── core/events-notifications.test.ts
├── config/notifications.test.ts
└── db/telegram-topics.test.ts
```

**Structure Decision**: Extend the existing single-project structure. Keep
Telegram protocol details and topic lifecycle in `src/core/notify/`, keep
cross-process state and uniqueness in `src/db/`, and pass feature identity as
metadata from event notifications. The web dashboard is not made responsible
for Telegram routing and the legacy Ink UI is not expanded.

## Phase 0: Research Decisions

- Use the Telegram Bot API `getChat` response to require `type ===
  'supergroup'` and `is_forum === true` before creating a feature topic. Use
  `createForumTopic` to obtain the authoritative `message_thread_id`, then use
  that ID in `sendMessage`; the bot must have topic-management permission.
- Persist one association per `(chatId, featureId)` with a unique constraint.
  The row stores the thread ID, stable initial title, lifecycle state, lease
  owner/expiry for concurrent creation, and the last actionable error. A
  short-lived in-process mutex avoids duplicate work within one process; the
  SQLite reservation/lease is the cross-process guard.
- Resolve the topic before sending any feature-linked message. If there is no
  row, reserve creation, validate the destination, create the topic, and
  commit the returned thread ID. If the stored thread is unavailable, mark it
  invalid, attempt a controlled recovery/recreation, update the same unique
  association, and retry only the original message once. Never use the
  configured general topic as a feature fallback.
- Keep `forumTopicId` as the explicit destination for legacy/global messages.
  A `featureId` in notification metadata opts that message into dynamic topic
  routing; no-feature messages continue through the existing configured chat
  and topic unchanged.
- Build topic names as a sanitized `featureId` plus feature name, truncating
  only the name portion to Telegram's 128-character limit. Once created, the
  association is authoritative even if the feature name changes or an admin
  renames the topic.
- Extend inbound Telegram update parsing with chat and thread context for both
  messages and callback queries. Resolve a gate or stage request only when the
  update comes from the configured chat and the stored topic for that request's
  feature; invalid-context replies are acknowledged but do not mutate state.
- Record API, validation, recovery, and delivery failures in the association
  row with feature/chat/thread context, while preserving the existing
  `Promise.allSettled` isolation between notification channels.

## Phase 1: Design Direction

1. Add a Telegram topic resolver/service that accepts `chatId`, `featureId`,
   optional feature name, and a send callback. Keep `TelegramChannel` backward
   compatible for a static `forumTopicId`, while allowing the manager to ask
   the resolver for a topic when metadata contains a feature identity.
2. Add DB migration/repository helpers for the association and its status/error
   fields. Enforce uniqueness on `(chat_id, feature_id)`, preserve the first
   title, and make upsert/recovery atomic. Lease expiry must make a crashed
   creator recoverable without allowing a second active association.
3. Update event notification metadata so every feature-linked event carries a
   stable `featureId`; supply `featureName` when the event producer has it or
   resolve it from the catalog at topic-creation time. Do not attach a feature
   to budget alerts or other global notifications unless the source already
   provides one.
4. Update the poller to parse Telegram's incoming chat/thread fields and gate,
   stage, and input commands. Add repository lookups for gate/request context,
   reject mismatched chat/topic combinations, and keep callback answers
   best-effort without resolving an unrelated request.
5. Preserve legacy config parsing and web redaction. Document that the bot must
   be an administrator able to manage topics, while `forumTopicId` continues
   to define the general/legacy destination. Add/update the F54 feature
   document and README configuration examples as implementation artifacts.

### Validation coverage

- Topic title sanitation and 128-character boundary while preserving the
  feature ID; Unicode/control-character and renamed-feature cases.
- `getChat` compatibility checks, `createForumTopic`/`sendMessage` payloads,
  static legacy topic behavior, and message splitting with the same thread ID.
- Two concurrent first notifications for one feature produce one persisted
  association and one effective topic; two feature IDs remain isolated.
- Restart/retry reuses the stored association; missing/closed topic recovery
  updates the association and never sends to another feature's thread.
- API/config/delivery errors persist actionable context and do not disappear
  into an alternate destination.
- Poller accepts a matching topic, rejects a wrong topic/chat, handles message
  and callback-query context, and leaves existing gate/stage/input commands'
  resolution semantics unchanged.
- Global notifications and legacy `telegramChatId`/`forumTopicId` behavior
  remain unchanged.

### Agent Context Update

No action required. This checkout has no `.specify/extensions/agent-context/`
directory, context update script, or managed Spec Kit block in `CLAUDE.md`; the
available `.specify/scripts/` only contains setup, prerequisite, and feature/task
scripts. The required context-update step is therefore a documented no-op.

## Post-Design Constitution Check

- **Source of truth**: PASS. The design is traced to the F54 spec and requires
  the corresponding feature/README documentation to stay aligned with runtime
  routing and configuration.
- **Layer ownership**: PASS. API calls, topic lifecycle, persistence, event
  metadata, and inbound command validation have separate owners.
- **Validation**: PASS. Focused automated coverage exercises every new branch,
  with repository-wide build/test/typecheck/lint gates for implementation.
- **Runtime evidence**: PASS. The quickstart requires both persisted topic/error
  rows and captured or live Telegram request evidence.
- **Harness safety**: PASS / not applicable. No executor QA or nested runner is
  introduced by this plan.
- **UI scope**: PASS. No TUI-only code is extended and no new UI is required.
- **Gate Status (post-design)**: PASS

## Complexity Tracking

No constitution violations require justification.
