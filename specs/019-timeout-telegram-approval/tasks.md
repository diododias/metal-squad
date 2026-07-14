# Tasks: F55 — Aprovação via Telegram ao atingir timeout

**Input**: Design documents from `specs/019-timeout-telegram-approval/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/timeout-telegram-approval.md`, `quickstart.md`

**Tests**: Included because the specification defines acceptance scenarios and the constitution requires automated coverage for changed behavior.

**Organization**: Tasks are grouped by user story. The implementation must preserve existing gate, input, global notification, and non-timeout failure behavior.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare focused fixtures and migration coverage without changing runtime behavior.

- [X] T001 [P] Add reusable typed-timeout adapter fixtures in `tests/adapters/misc.test.ts`.
- [X] T002 [P] Add isolated SQLite migration setup for F55 tables in `tests/db/index-migrate.test.ts`.
- [X] T003 [P] Add Telegram timeout callback and topic fixtures alongside existing notification fixtures in `tests/core/notify-telegram-poller-context.test.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the typed timeout contract and durable SQLite primitives required by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Add `timeout_occurrences`, `timeout_approval_requests`, and `recovery_decisions` tables with foreign keys, status checks, uniqueness constraints, and indexes in `src/db/index.ts`.
- [X] T005 [P] Define the structured timeout result, sanitized progress field, and adapter-facing types in `src/core/adapters/types.ts`.
- [X] T006 Implement F55 repository row types, status mappings, and read accessors for timeout occurrences, approval requests, and recovery decisions in `src/db/repo.ts`.
- [X] T007 [P] Preserve stdout/stderr/progress while throwing structured timeout metadata from `runCli` in `src/core/adapters/spawn.ts`.
- [X] T008 [P] Convert `CliTimeoutError` into the structured timeout result without changing abort or generic failure behavior in `src/core/adapters/codex.ts`.
- [X] T009 [P] Convert `CliTimeoutError` into the structured timeout result without changing abort or generic failure behavior in `src/core/adapters/claude.ts`.
- [X] T010 [P] Convert adapter timeout failures into the structured timeout result without changing non-timeout failures in `src/core/adapters/opencode.ts`.

**Checkpoint**: SQLite can represent the timeout lifecycle and every adapter can distinguish timeout from abort, gate, input, and generic failure.

---

## Phase 3: User Story 1 — Receber decisão quando uma execução expira (Priority: P1) 🎯 MVP

**Goal**: Persist one timeout occurrence and one pending Telegram approval request, block the affected run/pipeline, and send a sanitized request to the feature topic.

**Independent Test**: Simulate a typed adapter timeout and verify that the run/pipeline is blocked, the occurrence/request rows exist exactly once, and one Telegram message contains feature, stage/run, elapsed/limit, reason, Retry, and Keep blocked in the associated topic.

### Tests for User Story 1

- [X] T011 [P] [US1] Add adapter assertions for timeout metadata, runtime, and sanitized partial progress in `tests/adapters/misc.test.ts` and `tests/adapters/codex.test.ts`.
- [X] T012 [P] [US1] Add migration, uniqueness, terminal-run, and one-request-per-occurrence tests in `tests/db/index-migrate.test.ts` and `tests/db/repo.test.ts`.
- [X] T013 [P] [US1] Add event payload, message content, action buttons, topic routing, and delivery-audit tests in `tests/core/events-notifications-full.test.ts`, `tests/core/notify-telegram.test.ts`, and `tests/core/notify-telegram-topics.test.ts`.
- [X] T014 [US1] Add runner integration coverage proving timeout persistence occurs before notification, the run/pipeline becomes blocked, and the stage checkpoint remains available in `tests/runner/execute.test.ts`.

### Implementation for User Story 1

- [X] T015 [US1] Implement idempotent timeout-occurrence and approval-request creation, including the terminal-success race guard, in `src/db/repo.ts`.
- [X] T016 [US1] Add `timeout:approval-created` event types and durable event persistence with occurrence/request context in `src/core/events/types.ts` and `src/core/events/persistence.ts`.
- [X] T017 [US1] Subscribe to `timeout:approval-created` and build the sanitized Telegram message with Retry and Keep blocked callbacks in `src/core/events/notifications.ts`.
- [X] T018 [US1] Handle the structured timeout in `executeStageRun`, persist/block the run and pipeline before emitting the event, and wait on the existing staged checkpoint in `src/core/runner/execute.ts`.
- [X] T019 [US1] Record pending, sent, and failed Telegram delivery attempts without changing the timeout decision state in `src/core/notify/manager.ts` and `src/core/notify/telegram.ts`.

**Checkpoint**: A timeout produces one durable, topic-scoped, human-readable approval request and never continues as an active run.

---

## Phase 4: User Story 2 — Autorizar uma nova tentativa pelo Telegram (Priority: P1)

**Goal**: Resolve a pending timeout request atomically and resume exactly the affected stage once when Retry is explicitly selected; Keep blocked and silence do not retry.

**Independent Test**: Create a pending request, submit Retry, and verify one approved decision, one claimed/attached retry run for the same stage, preserved prior checkpoints, and a resumed pipeline; repeat the callback and verify no second retry.

### Tests for User Story 2

- [X] T020 [P] [US2] Add compare-and-set, duplicate-claim, Keep blocked, and retry-run attachment tests in `tests/db/repo-extended.test.ts`.
- [X] T021 [P] [US2] Add Retry/Keep blocked textual and callback handling tests, including callback acknowledgment and topic context, in `tests/core/notify-telegram-poller.test.ts`.
- [X] T022 [US2] Add staged-pipeline retry tests proving the same stage is re-entered with prior checkpoints and no full-pipeline restart in `tests/runner/execute.test.ts`.

### Implementation for User Story 2

- [X] T023 [US2] Implement atomic context-validated resolution, recovery-decision creation, retry claiming, and retry-run attachment in `src/db/repo.ts`.
- [X] T024 [US2] Parse `timeout:<requestId> retry|keep_blocked`, validate request/feature/run/stage/chat/topic, and ignore invalid or already-resolved callbacks in `src/core/notify/telegram-poller.ts`.
- [X] T025 [US2] Emit and persist `timeout:approval-resolved` only when the SQLite compare-and-set wins in `src/core/events/types.ts`, `src/core/events/persistence.ts`, and `src/db/repo.ts`.
- [X] T026 [US2] Return a typed retry control from the timeout wait and re-enter only the affected stage while preserving session/checkpoint state in `src/core/runner/execute.ts`.
- [X] T027 [US2] Link the newly created retry run to the approved request and recovery audit, and keep Keep blocked/no-response paths terminally blocked in `src/db/repo.ts` and `src/core/runner/execute.ts`.

**Checkpoint**: One valid Retry callback resumes one affected stage; duplicate, Keep blocked, and absent decisions do not create a retry.

---

## Phase 5: User Story 3 — Evitar decisões duplicadas e preservar os fluxos existentes (Priority: P2)

**Goal**: Make late, duplicate, cancelled, superseded, wrong-topic, and delivery-failure paths safe while preserving gates, inputs, global notifications, and non-timeout executions.

**Independent Test**: Submit duplicate and late callbacks, callbacks from another topic, callbacks after cancellation/success, and simulated Telegram failures; verify no unrelated feature changes, no extra run, durable pending/error state, and unchanged existing human-control flows.

### Tests for User Story 3

- [X] T028 [P] [US3] Add duplicate, late, cancelled, superseded, wrong-chat, and wrong-thread no-op tests in `tests/core/notify-telegram-poller-context.test.ts` and `tests/core/notify-telegram-poller.test.ts`.
- [X] T029 [P] [US3] Add Telegram outage and notification delivery-audit tests proving failed delivery never approves or recovers a timeout in `tests/core/notify-telegram.test.ts` and `tests/core/events-notifications-full.test.ts`.
- [X] T030 [P] [US3] Add regression coverage for gates, interactive inputs, global notifications, and non-timeout adapter failures in `tests/core/notify-telegram-poller.test.ts`, `tests/core/events-notifications.test.ts`, and `tests/adapters/misc.test.ts`.

### Implementation for User Story 3

- [X] T031 [US3] Enforce terminal run/pipeline checks, immutable request context, and single-effective-decision invariants in `src/db/repo.ts`.
- [X] T032 [US3] Reject callbacks after cancellation/supersession or from a mismatched feature topic without resolving any request in `src/core/notify/telegram-poller.ts`.
- [X] T033 [US3] Preserve `Promise.allSettled` behavior for existing notification events while exposing timeout delivery errors for audit in `src/core/notify/manager.ts` and `src/core/events/notifications.ts`.
- [X] T034 [US3] Expose blocked timeout/request state through existing dashboard serialization without exposing Telegram tokens or message secrets in `src/web/state.ts` and `src/web/types.ts`.

**Checkpoint**: Every invalid or late decision is a no-op, delivery failure remains diagnosable, and existing gates/inputs/notifications retain their current observable behavior.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete F55 contract and keep the feature artifacts synchronized.

- [X] T035 [P] Update the focused command list and acceptance evidence notes after implementation in `specs/019-timeout-telegram-approval/quickstart.md`.
- [X] T036 Run the focused Telegram, event, adapter, runner, and SQLite suites recorded in `specs/019-timeout-telegram-approval/quickstart.md`.
- [X] T037 Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from the scripts defined in `package.json`.
- [X] T038 Run documentation and backlog consistency checks from `package.json` and verify the final F55 task/spec/plan/contract paths in `specs/019-timeout-telegram-approval/tasks.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

Phase 1 has no dependency. Phase 2 depends on the setup fixtures and blocks all user stories. User Stories 1 and 2 are both P1, but User Story 2 depends on the persisted request/event contract delivered by User Story 1. User Story 3 depends on the runtime paths from User Stories 1 and 2. Polish depends on the desired stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2; no dependency on another story.
- **User Story 2 (P1)**: Depends on Phase 2 and the timeout request/control contract from User Story 1; independently validates the retry decision once that contract exists.
- **User Story 3 (P2)**: Depends on User Stories 1 and 2 so it can harden their terminal, duplicate, delivery, and compatibility paths.

### Parallel Opportunities

Phase 1 tasks T001–T003 can run in parallel. In Phase 2, T004/T005 can run in parallel, followed by T007–T010 in parallel after T005. For User Story 1, T011–T013 can run in parallel; T014 follows the runner contract. For User Story 2, T020 and T021 can run in parallel, while T022 follows the retry control design. For User Story 3, T028–T030 can run in parallel. T035 is independent of the validation commands T036–T038.

## Parallel Example: User Story 1

```text
T011: adapter timeout contract tests in tests/adapters/misc.test.ts and tests/adapters/codex.test.ts
T012: SQLite migration/idempotency tests in tests/db/index-migrate.test.ts and tests/db/repo.test.ts
T013: event/message/topic tests in tests/core/events-notifications-full.test.ts, tests/core/notify-telegram.test.ts, and tests/core/notify-telegram-topics.test.ts
```

## Parallel Example: User Story 2

```text
T020: repository compare-and-set tests in tests/db/repo-extended.test.ts
T021: Telegram callback tests in tests/core/notify-telegram-poller.test.ts
```

## Parallel Example: User Story 3

```text
T028: invalid-context and late-callback tests in tests/core/notify-telegram-poller-context.test.ts and tests/core/notify-telegram-poller.test.ts
T029: delivery-failure tests in tests/core/notify-telegram.test.ts and tests/core/events-notifications-full.test.ts
T030: compatibility regression tests in tests/core/notify-telegram-poller.test.ts, tests/core/events-notifications.test.ts, and tests/adapters/misc.test.ts
```

## Implementation Strategy

### MVP First (User Stories 1 and 2)

1. Complete Phase 1 and Phase 2.
2. Complete User Story 1 and validate one timeout request in the correct topic.
3. Complete User Story 2 and validate one explicit Retry for the affected stage.
4. Stop and validate the P1 flow before hardening compatibility and failure paths.

### Incremental Delivery

1. Deliver the durable typed-timeout and pending-request foundation.
2. Deliver timeout notification and blocked-state behavior (US1).
3. Deliver explicit Telegram Retry/Keep blocked recovery (US2).
4. Deliver duplicate, late, wrong-topic, outage, and regression protections (US3).
5. Run the complete validation gates and update quickstart evidence.

### Format Validation

All 38 implementation tasks use the required checklist format: `- [X]`, sequential `T###` ID, optional `[P]`, required `[US#]` only in user-story phases, and an explicit repository file path in every description.

## Notes

- No extension hooks were dispatched because `.specify/extensions.yml` is absent.
- No TUI or new notification channel is introduced; the design reuses the existing dashboard, Telegram topic association, event bus, poller, and SQLite persistence boundaries.
- The task list stops at the tasks stage; implementation and `msq-develop` QA are subsequent workflow stages.
