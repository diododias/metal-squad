---
description: "Implementation task list for F54 Telegram feature topics"
---

# Tasks: F54 - Tópico de Telegram por Feature

**Input**: Design documents from `/specs/018-telegram-feature-topics/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/telegram-topic-routing-contract.md`, and `quickstart.md`

**Tests**: Included because the specification defines independent test criteria and the constitution requires automated coverage for new or changed behavior.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an incremental delivery.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing project runtime is sufficient for F54 and keep dependency changes explicit.

- [ ] T001 Confirm that the existing TypeScript, native `fetch`, `better-sqlite3`, `zod`, and Vitest setup supports F54; add only any missing dependency or script in `package.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared persistence, event metadata, and configuration boundaries required by every feature-linked Telegram notification.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [ ] T002 [P] Add the `feature_topic_associations` migration with the `(chat_id, feature_id)` uniqueness constraint, lifecycle fields, lease fields, error fields, and indexes in `src/db/index.ts`.
- [ ] T003 Implement association reads, creation reservations, lease-expiry recovery, activation, invalidation, and error recording behind repository helpers in `src/db/repo.ts`.
- [ ] T004 [P] Extend outbound notification and inbound request context types with stable feature, chat, thread, request, gate, and stage metadata in `src/core/events/types.ts`.
- [ ] T005 Propagate `featureId` and optional `featureName` on `run:start`, `run:failed`, `run:done`, `gate:created`, `stage:approval`, and `stage:input` notifications while leaving global alerts unassociated in `src/core/events/notifications.ts`.
- [ ] T006 [P] Preserve `telegramChatId`, `chatId`, and optional static `forumTopicId` parsing and redaction while documenting the feature-aware metadata contract in `src/config/index.ts`.
- [ ] T007 Add migration, uniqueness, reservation, activation, invalidation, and persisted-error coverage for `FeatureTopicAssociation` in `tests/db/telegram-topics.test.ts`.

**Checkpoint**: The database and event/configuration contracts are ready for story-specific Telegram routing.

---

## Phase 3: User Story 1 - Organizar cada feature em seu próprio tópico (Priority: P1) 🎯 MVP

**Goal**: Create one identifiable Telegram forum topic on the first feature-linked notification and route every fragment for that feature to its own topic.

**Independent Test**: Configure a forum-enabled supergroup, send notifications for two feature IDs, and verify that each feature creates or reuses exactly one topic and every payload targets only that feature's returned `message_thread_id`.

### Tests for User Story 1

- [ ] T008 [US1] Add failing tests for sanitized topic titles, stable feature IDs, the 128-character boundary, first-event creation, and one-topic-per-feature routing in `tests/core/notify-telegram-topics.test.ts`.
- [ ] T009 [US1] Add failing tests for `getChat`, `createForumTopic`, `sendMessage`, message splitting, and final-fragment-only `reply_markup` payloads in `tests/core/notify-telegram.test.ts`.

### Implementation for User Story 1

- [ ] T010 [US1] Implement feature-topic title sanitization, truncation, in-process locking, and create/resolve lifecycle policy in `src/core/notify/telegram-topics.ts`.
- [ ] T011 [US1] Extend the Telegram Bot API client to validate/resolve a feature topic and send all message fragments with its `message_thread_id` in `src/core/notify/telegram.ts`.
- [ ] T012 [US1] Route notification metadata with `featureId` and `featureName` through the notification manager while keeping channel delivery isolated in `src/core/notify/manager.ts`.

**Checkpoint**: US1 is independently functional when a new feature notification creates one topic and all subsequent messages remain isolated to it.

---

## Phase 4: User Story 2 - Continuar uma feature no mesmo contexto (Priority: P2)

**Goal**: Reuse the persisted topic across retries, later stages, process restarts, and inbound interactive responses.

**Independent Test**: Create an association, reload the notification path, send later-stage/retry events, and submit matching plus mismatched Telegram commands; only the matching topic may resolve the pending request.

### Tests for User Story 2

- [ ] T013 [US2] Add coverage for restart reuse, no extra `createForumTopic` call, concurrent first events, and lease-expiry recovery in `tests/core/notify-telegram-topics.test.ts`.
- [ ] T014 [US2] Add coverage for matching and mismatched chat/thread context on message and callback-query commands for gates, stage approvals, and stage input in `tests/core/notify-telegram-poller.test.ts`.

### Implementation for User Story 2

- [ ] T015 [US2] Update repository transactions so one active `(chatId, featureId)` association remains authoritative across concurrent creators and process restarts in `src/db/repo.ts`.
- [ ] T016 [US2] Make the topic resolver reuse active persisted associations and recover only through the same feature association after invalidation or expired creation leases in `src/core/notify/telegram-topics.ts`.
- [ ] T017 [US2] Parse Telegram chat and `message_thread_id` context for messages and callback queries, join pending requests to their feature association, and reject mismatches without state mutation in `src/core/notify/telegram-poller.ts`.

**Checkpoint**: US2 is independently functional when a feature's full retry/resume history and valid interactive responses remain in one topic.

---

## Phase 5: User Story 3 - Detectar configuração incompatível com segurança (Priority: P2)

**Goal**: Fail clearly and recoverably for incompatible destinations, unavailable topics, and Telegram API failures without cross-feature or General-topic fallback.

**Independent Test**: Exercise a regular group, a non-forum supergroup, a failed topic creation, and an unavailable stored thread; verify actionable persisted errors, controlled recovery, and zero misrouted feature messages.

### Tests for User Story 3

- [ ] T018 [US3] Add coverage for incompatible destinations, missing topic-management permissions, create/recovery failures, delivery errors, unavailable threads, and duplicate-prevention guarantees in `tests/core/notify-telegram-topics.test.ts`.
- [ ] T019 [US3] Add coverage proving a Telegram failure is isolated from Slack, Discord, webhook, and desktop delivery in `tests/core/notify-manager.test.ts`.

### Implementation for User Story 3

- [ ] T020 [US3] Validate `getChat.type === 'supergroup'` and `getChat.is_forum === true`, and persist actionable configuration/API errors with feature and chat context in `src/core/notify/telegram-topics.ts`.
- [ ] T021 [US3] Detect controlled thread-unavailable failures, invalidate and recreate the same feature association, retry the original delivery once, and persist terminal failures in `src/core/notify/telegram.ts`.
- [ ] T022 [US3] Enforce that feature-linked sends never fall back to another feature's thread or the General topic while preserving `Promise.allSettled` channel isolation in `src/core/notify/manager.ts`.

**Checkpoint**: US3 is independently functional when every incompatible or unavailable destination fails visibly and remains recoverable without violating feature isolation.

---

## Phase 6: User Story 4 - Manter notificações sem feature compatíveis (Priority: P3)

**Goal**: Keep global and legacy Telegram notifications on their configured static destination while feature-linked messages use dynamic topics.

**Independent Test**: Dispatch a global notification and a feature-linked notification in the same configuration and verify that only the latter creates or uses a feature association.

### Tests for User Story 4

- [ ] T023 [US4] Add regression coverage for no-feature messages, legacy `telegramChatId`, static `forumTopicId`, mixed global/feature dispatch, and the unchanged notification event set in `tests/core/notify-telegram.test.ts` and `tests/config/notifications.test.ts`.

### Implementation for User Story 4

- [ ] T024 [US4] Preserve static `forumTopicId` delivery for messages without `featureId` and keep legacy `telegramChatId` normalization compatible in `src/core/notify/telegram.ts` and `src/config/index.ts`.
- [ ] T025 [US4] Ensure global notifications do not create topic associations and Telegram-specific routing metadata remains ignored by non-Telegram channels in `src/core/notify/manager.ts`.

**Checkpoint**: US4 is independently functional when existing global and legacy notifications behave as before alongside feature-aware routing.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Align source-of-truth documentation, verify the complete quickstart, and run repository validation gates.

- [ ] T026 [P] Document forum-supergroup permissions, topic lifecycle, legacy `forumTopicId`, recovery behavior, and redaction expectations in `docs/features/F54-telegram-feature-topics.md`.
- [ ] T027 [P] Update Telegram configuration examples and the requirement that the bot can manage forum topics in `README.md`.
- [ ] T028 [P] Keep the deterministic scenarios, isolated `MSQ_DB_PATH`, captured Bot API requests, and association/error-row inspection steps synchronized in `specs/018-telegram-feature-topics/quickstart.md`.
- [ ] T029 Run the focused F54 Vitest suites and record the results against the scenarios in `specs/018-telegram-feature-topics/quickstart.md`.
- [ ] T030 Run `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`, and record any required follow-up in `package.json` or `specs/018-telegram-feature-topics/quickstart.md`.
- [ ] T031 Audit every F54 requirement, contract rule, entity transition, and success criterion for task traceability in `specs/018-telegram-feature-topics/spec.md`, `specs/018-telegram-feature-topics/data-model.md`, and `specs/018-telegram-feature-topics/contracts/telegram-topic-routing-contract.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; confirm the existing runtime before implementation.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories. T002, T004, and T006 can start in parallel; T003 depends on T002, T005 depends on T004, and T007 depends on T002/T003.
- **User Story 1 (Phase 3)**: Depends on the complete Foundational phase and is the MVP increment.
- **User Stories 2 and 3 (Phases 4-5)**: Depend on the Foundational phase and the US1 topic-routing contract; their distinct test and poller work can proceed in parallel after US1's resolver boundary is stable, but shared-file implementation tasks should remain sequential.
- **User Story 4 (Phase 6)**: Depends on the Foundational phase and the US1 manager/channel integration so legacy and dynamic routes can be verified together.
- **Polish (Phase 7)**: Depends on all stories selected for delivery.

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2; no dependency on another user story.
- **US2 (P2)**: Depends on the persisted association and resolver delivered by US1, then adds restart, concurrency, and inbound-context behavior.
- **US3 (P2)**: Depends on the resolver and delivery path delivered by US1, then adds validation, recovery, and failure isolation.
- **US4 (P3)**: Depends on the manager/channel boundary delivered by US1; it preserves the no-feature path independently of US2 and US3.

### Within Each User Story

- Write the story tests before its implementation and make them fail for the new behavior.
- Implement persistence/configuration contracts before resolver or poller behavior that consumes them.
- Keep Telegram protocol calls in `src/core/notify/`, SQLite operations in `src/db/`, event metadata in `src/core/events/`, and presentation out of the routing path.
- Stop at each checkpoint and run the story's independent test criteria before proceeding.

### Parallel Opportunities

- **Foundational**: T002, T004, and T006 touch separate files and can start in parallel; T003 follows T002 and T005 follows T004.
- **US1**: T008 and T009 are separate test files and can be prepared in parallel before T010-T012.
- **US2/US3**: Once US1 is stable, poller tests/implementation (T014/T017) and failure-isolation tests/implementation (T019/T022) are separable by file ownership, subject to sequential integration of shared resolver behavior.
- **Polish**: T026, T027, and T028 touch separate documentation files and can run in parallel.

### Parallel Example: Foundational Phase

```text
Task T002: Add the association migration in src/db/index.ts
Task T004: Extend event context types in src/core/events/types.ts
Task T006: Preserve Telegram config parsing in src/config/index.ts
```

### Parallel Example: User Story 1

```text
Task T008: Add topic-title and first-routing tests in tests/core/notify-telegram-topics.test.ts
Task T009: Add Bot API payload and message-splitting tests in tests/core/notify-telegram.test.ts
```

### Parallel Example: Polish

```text
Task T026: Update docs/features/F54-telegram-feature-topics.md
Task T027: Update README.md
Task T028: Synchronize specs/018-telegram-feature-topics/quickstart.md
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1) and validate first-event creation, title constraints, payload routing, and message splitting independently.
3. Stop for an MVP review before adding restart/poller recovery or broader failure handling.

### Incremental Delivery

1. Add US2 for restart, retry, concurrency, and inbound topic-context continuity.
2. Add US3 for incompatible destinations, controlled recovery, persisted failures, and channel isolation.
3. Add US4 for global/legacy compatibility regression coverage.
4. Complete Phase 7 and run the full repository validation gates.

### Completion Criteria

- Every task above has a unique sequential ID, starts with `- [ ]`, uses `[P]` only for parallel work, uses `[USn]` only inside a user-story phase, and names at least one exact file path.
- Each user story has an independent test criterion and story-specific automated coverage.
- The MVP is deliverable after US1 without requiring US2, US3, or US4.
- The final documentation and quickstart remain aligned with the specification, plan, data model, and routing contract.
