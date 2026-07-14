---
description: "Implementation tasks for the Heartbeat Status Spinner feature"
---

# Tasks: Heartbeat Status Spinner

**Input**: Design documents from `/specs/018-heartbeat-status-spinner/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/websocket-session-status.md`, and `quickstart.md`

**Tests**: Tests are included because the feature specification requires lifecycle, adapter, persistence, WebSocket, concurrent-run, and UI acceptance coverage, and the project constitution requires automated coverage for changed behavior.

**Organization**: Shared lifecycle and storage contracts are established first; implementation then proceeds by independently testable user story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish focused fixtures and test entry points for the existing TypeScript/Vitest project.

- [X] T001 [P] Create reusable fake-child, fake-clock, session-status, and tool-call fixtures in `tests/fixtures/heartbeat-status.ts`
- [X] T002 [P] Add focused status and transcript test entry points with shared render helpers in `tests/web/status.test.ts` and `tests/web/transcript.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared configuration, lifecycle, event, persistence, and transport contracts required by all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add `idleThresholdMs` with a 30-second default and `web.statusSpinner` with a true default to the Zod schemas, runtime/repo merge logic, and config snapshot in `src/config/index.ts`
- [X] T004 Define `SessionStatus`, status snapshots, normalized tool-call records, terminal-state rules, and adapter callback types in `src/core/adapters/types.ts`
- [X] T005 Extend the typed event contracts and event-bus surface with `run:status` and `tool:call` in `src/core/events/types.ts`, `src/core/events/bus.ts`, and `src/core/events/index.ts`
- [X] T006 Refactor `runCli` to track last output and emit structured start, running, idle, interrupted, failed, timed-out, and completed transitions independently from visual animation in `src/core/adapters/spawn.ts`
- [X] T007 Pass run/feature identity and lifecycle callbacks through the Codex, Claude, and OpenCode adapters, removing raw heartbeat-message emission while retaining ordinary output and usage behavior in `src/core/adapters/codex.ts`, `src/core/adapters/claude.ts`, and `src/core/adapters/opencode.ts`
- [X] T008 Add backward-compatible session-status columns to `runs` and the normalized `run_tool_calls` table with indexes and idempotent migration logic in `src/db/index.ts`
- [X] T009 Implement session-status and tool-call upsert/list helpers, including `(run_id, id)` completion updates and enriched run/history projections, in `src/db/repo.ts`
- [X] T010 Persist structured status and tool-call events and preserve legacy `runs.status` mappings for pipeline/statistics consumers in `src/core/events/persistence.ts` and `src/core/runner/execute.ts`
- [X] T011 Extend WebSocket/state contracts and initial run projections for session status, status history, and normalized tool calls in `src/web/types.ts` and `src/web/state.ts`
- [X] T012 [P] Add regression coverage for config defaults/overrides and fresh/legacy database migration in `tests/config/index.test.ts` and `tests/db/index-migrate.test.ts`

**Checkpoint**: Shared lifecycle events, persistence, and transport contracts are available without requiring the web UI to infer state from output bytes or text.

---

## Phase 3: User Story 1 - See that a run is working (Priority: P1) 🎯 MVP

**Goal**: Show a clearly running web card with an optional animated spinner, the `Running` label, and elapsed time while preserving the running state when animation is disabled.

**Independent Test**: Start a run that produces output over time, open its web detail card, and verify `Running`, elapsed time, and the spinner; disable `web.statusSpinner` and verify the label/state remains while animation disappears.

### Implementation for User Story 1

- [X] T013 [P] [US1] Create the accessible status indicator component with running visual tokens, label, elapsed-time formatting, and animation opt-out in `src/web/client/components/status/RunStatusIndicator.tsx`
- [X] T014 [US1] Integrate the structured running status into the run-detail summary and per-run client state in `src/web/client/pages/RunDetailPage.tsx` and `src/web/client/App.tsx`
- [X] T015 [P] [US1] Add spinner keyframes, reduced-motion behavior, and distinct running styling without coupling animation to backend detection in `src/web/static/styles.css`
- [X] T016 [P] [US1] Verify running-card rendering, elapsed time, visual distinction, and disabled-spinner behavior in `tests/web/status.test.ts`
- [X] T017 [US1] Update client WebSocket/state tests to prove a structured `run:status` running event drives the card without parsing heartbeat text in `tests/web/client.test.ts` and `tests/web/state.test.ts`

**Checkpoint**: A slow active run is visibly and unambiguously running in the web dashboard, with or without animation.

---

## Phase 4: User Story 2 - Understand idle, interruption, failure, and completion (Priority: P1)

**Goal**: Expose every non-running lifecycle state with accurate timing, safe reasons, terminal semantics, and isolation between concurrent runs.

**Independent Test**: Exercise output pause/resume, abort, non-zero exit, timeout, and successful close with a short configured threshold; verify each status, reason, elapsed/idle timing, terminal behavior, and correct run/feature card.

### Implementation for User Story 2

- [X] T018 [US2] Render `Idle / Waiting`, `Interrupted`, `Failed`, `Timed out`, and `Completed` labels, idle duration, elapsed time, safe reason text, and stopped animation in `src/web/client/components/status/RunStatusIndicator.tsx` and `src/web/client/pages/RunDetailPage.tsx`
- [X] T019 [US2] Apply incoming `run:status` messages by both `runId` and `featureId`, update only the matching card, and retain terminal snapshots across later state refreshes in `src/web/client/App.tsx` and `src/web/state.ts`
- [X] T020 [US2] Broadcast structured status events only to authenticated clients subscribed to the matching run and include current status in run-detail/reconnect payloads in `src/web/server.ts` and `src/web/types.ts`
- [X] T021 [US2] Ensure abort, timeout, non-zero exit, successful close, and no-output completion flow through the correct terminal status while retaining legacy pipeline outcomes in `src/core/runner/execute.ts` and `src/core/adapters/control.ts`
- [X] T022 [P] [US2] Add fake-timer and adapter regression tests for threshold crossing, immediate running resumption, interruption, failure, timeout, completion, disabled animation, and no-output completion in `tests/adapters/spawn.test.ts`, `tests/adapters/codex.test.ts`, and `tests/adapters/misc.test.ts`
- [X] T023 [P] [US2] Test status persistence, bounded reasons, terminal immutability, and legacy `runs.status` compatibility in `tests/core/events-persistence.test.ts`, `tests/db/index-migrate.test.ts`, and `tests/db/repo.test.ts`
- [X] T024 [P] [US2] Test authenticated WebSocket status delivery, run/feature scoping, concurrent-run isolation, and reconnect/detail reconstruction in `tests/web/server.test.ts` and `tests/web/status.test.ts`

**Checkpoint**: Operators can distinguish waiting, intervention, failure, timeout, and success from the web card without consulting raw output counters.

---

## Phase 5: User Story 3 - Read tool calls without transcript noise (Priority: P2)

**Goal**: Normalize tool-call lifecycle data at adapter boundaries and render ordered, step-scoped, collapsible groups whose local state survives live updates.

**Independent Test**: Run a session with multiple tool calls in one step, collapse and expand the group, then deliver additional output/status events and verify count, indentation, order, lifecycle details, and retained collapsed state.

### Implementation for User Story 3

- [X] T025 [P] [US3] Normalize Codex, Claude, and OpenCode tool-call start/completion/failure records with stable IDs, monotonic sequence, step association, and redacted arguments/output in `src/core/adapters/codex.ts`, `src/core/adapters/claude.ts`, and `src/core/adapters/opencode.ts`
- [X] T026 [US3] Emit normalized `tool:call` events and update one persisted record from start through completion/failure in `src/core/events/persistence.ts` and `src/db/repo.ts`
- [X] T027 [US3] Deliver scoped `tool:call` messages and persisted tool-call history in run-detail subscriptions while preserving ordinary `run:output` lines in `src/web/server.ts` and `src/web/types.ts`
- [X] T028 [US3] Replace legacy provider-text parsing for tool calls with structured records in `src/web/client/hooks/useLocalOutput.ts` and `src/web/client/pages/RunDetailPage.tsx`
- [X] T029 [P] [US3] Implement indented step-scoped tool-call groups with `N tool calls` summaries, ordered lifecycle details, and explicit expand/collapse controls in `src/web/client/components/transcript/AgentTranscript.tsx`, `src/web/client/components/transcript/ToolCallCard.tsx`, and `src/web/client/components/transcript/ToolCallGroup.tsx`
- [X] T030 [US3] Keep collapsed state keyed by `runId + step/stage + groupSequence` while status, output, and tool-call events append to the same group in `src/web/client/App.tsx` and `src/web/client/pages/RunDetailPage.tsx`
- [X] T031 [US3] Enforce bounded, sanitized, display-only arguments/output/error fields at adapter and WebSocket boundaries in `src/core/adapters/types.ts`, `src/core/adapters/codex.ts`, `src/core/adapters/claude.ts`, `src/core/adapters/opencode.ts`, and `src/web/server.ts`
- [X] T032 [P] [US3] Add adapter normalization tests for stable IDs, synthetic starts, ordering, step association, and sanitized fields in `tests/adapters/codex.test.ts`, `tests/adapters/misc.test.ts`, and `tests/adapters/opencode.test.ts`
- [X] T033 [P] [US3] Add transcript rendering tests for grouping, count summaries, indentation, expansion details, ordering, and collapse persistence through later events in `tests/web/transcript.test.ts` and `tests/web/client.test.ts`
- [X] T034 [P] [US3] Add persistence and WebSocket reconnect tests proving tool-call history is reconstructible and isolated per run in `tests/core/events-persistence.test.ts`, `tests/db/repo.test.ts`, and `tests/web/server.test.ts`

**Checkpoint**: Tool details remain inspectable without obscuring the current step or resetting an operator's collapse choice.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Remove the obsolete TUI heartbeat presentation, synchronize feature documentation, and run the required validation gates.

- [X] T035 Remove heartbeat-only rendering and copy from the legacy Ink TUI while preserving shared output/status behavior in `src/ui/format.ts`, `src/ui/components/MainPanel.tsx`, and `src/ui/theme/styles.ts`
- [X] T036 Update TUI and web regression assertions so no live heartbeat-only presentation remains and structured status/tool-call output is the canonical path in `tests/ui/format.test.ts`, `tests/ui/render.test.tsx`, and `tests/web/client.test.ts`
- [X] T037 Reconcile implementation details, contract examples, and end-to-end evidence steps with the delivered behavior in `specs/018-heartbeat-status-spinner/quickstart.md` and `specs/018-heartbeat-status-spinner/contracts/websocket-session-status.md`
- [X] T038 Run the feature quickstart and repository gates from `specs/018-heartbeat-status-spinner/quickstart.md`: `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint`; record any implementation-impacting discrepancy in the feature artifacts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: Depends on Setup; T003, T004, T008, and T011 touch separate ownership boundaries and can be started in parallel, while event, adapter, persistence, and repository work follows the relevant contracts.
- **User Stories (Phases 3–5)**: Depend on the complete Foundational phase. US1 and US2 share the status contract but can be validated independently; US3 can proceed independently once the shared event/storage contracts exist.
- **Polish (Phase 6)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2; no dependency on US2 or US3.
- **US2 (P1)**: Depends on Phase 2; consumes the same status snapshots as US1 but has independent terminal-state and isolation tests.
- **US3 (P2)**: Depends on Phase 2; shares event/storage transport but is independently testable with adapter and transcript fixtures.

### Parallel Opportunities

- Setup: T001, T002.
- Foundation: T003, T004, T008, T011, and T012 where their files do not overlap.
- US1: T013, T015, and T016 after the status payload shape is fixed.
- US2: T022, T023, and T024 after lifecycle implementation is available.
- US3: T025, T029, T032, T033, and T034 where file ownership does not overlap.
- Different user stories may be staffed in parallel after Phase 2, subject to the explicitly listed file overlaps.

## Parallel Example: User Story 1

```text
T013: Build RunStatusIndicator.tsx
T015: Add spinner CSS in src/web/static/styles.css
T016: Add focused status component tests in tests/web/status.test.ts
```

## Parallel Example: User Story 2

```text
T022: Exercise lifecycle transitions in adapter tests
T023: Exercise persistence and legacy status compatibility
T024: Exercise WebSocket isolation and reconnect behavior
```

## Parallel Example: User Story 3

```text
T025: Normalize provider tool-call records
T029: Build grouped transcript presentation
T032: Add adapter normalization tests
T033: Add transcript grouping/collapse tests
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate the running card independently with the focused web tests and the configured quickstart path.
4. Stop for an MVP demonstration before adding terminal-state and transcript detail.

### Incremental Delivery

1. Deliver the shared structured lifecycle and persistence foundation.
2. Deliver US1 for active-run visibility.
3. Deliver US2 for operational decision-making across idle and terminal states.
4. Deliver US3 for transcript detail without noise.
5. Finish TUI removal, documentation synchronization, and full validation.

## Notes

- `[P]` marks tasks that can run in parallel without sharing incomplete files.
- `[US1]`, `[US2]`, and `[US3]` map directly to the priorities and stories in `spec.md`.
- Legacy `RunStatus` compatibility is intentional; the structured `SessionStatus` is the canonical web lifecycle.
- The feature does not add a new dependency or extend the legacy Ink TUI.
