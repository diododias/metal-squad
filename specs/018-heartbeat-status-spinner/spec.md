# Feature Specification: Heartbeat Status Spinner

**Feature Branch**: `feat/f53-heartbeat-spinner-status`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "F53 — Heartbeat como spinner de status. Replace the noisy heartbeat that repeats the AI's last message with a status spinner that communicates execution, idle/waiting, interruption, failure, timeout, and completion. Group and minimize tool calls in the web transcript."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See that a run is working (Priority: P1)

As an operator following a run in the web dashboard, I want an animated status
indicator that clearly says the agent is running so that a slow session is not
mistaken for a stuck session.

**Why this priority**: Knowing whether work is progressing is the primary value
of the feature and is required before an operator can make a sensible decision
about waiting or intervening.

**Independent Test**: Start a run that produces output over time and verify that
its web card shows an active spinner, the label `Running`, and elapsed time
without requiring the operator to inspect raw output counters.

**Acceptance Scenarios**:

1. **Given** a run has started and is producing output, **When** the operator
   views its web card, **Then** the card shows an animated spinner, the `Running`
   label, and elapsed time.
2. **Given** two run cards are visible, one running and one not running, **When**
   the operator compares them, **Then** the running state is distinguishable by
   its visual treatment and label without reading raw stdout or stderr data.
3. **Given** the visual spinner is disabled, **When** a run is still producing
   output, **Then** the card continues to report `Running` without showing a
   misleading animated indicator.

---

### User Story 2 - Understand idle, interruption, failure, and completion (Priority: P1)

As an operator, I want the status to change when a session becomes idle,
interrupted, failed, timed out, or completed so that I can decide whether to
wait, answer a pending question, or stop investigating the run.

**Why this priority**: A status that only communicates activity cannot explain
the most important operational decisions or distinguish a recoverable wait from
an unsuccessful run.

**Independent Test**: Exercise runs that produce output, exceed a configured
idle threshold, receive an interruption, fail, time out, and complete; verify the
corresponding status event, label, and timing information for each case.

**Acceptance Scenarios**:

1. **Given** a run has produced no new output for longer than its configured
   idle threshold, **When** the next status update is shown, **Then** the card
   changes to `Idle / Waiting` and shows the idle duration.
2. **Given** an idle run receives new output, **When** that output arrives,
   **Then** the card returns to `Running` without presenting a stale idle state
   between the output and the next visible update.
3. **Given** the operator aborts a run, **When** the interruption is recorded,
   **Then** the card shows `Interrupted` and does not classify the run as
   `Failed`.
4. **Given** a run exits unsuccessfully for a reason other than timeout, **When**
   its terminal state is shown, **Then** the card shows `Failed` with a useful
   reason or summary.
5. **Given** a run exceeds the timeout policy, **When** its terminal state is
   shown, **Then** the card shows `Timed out`, distinct from `Failed`.
6. **Given** a run finishes successfully, **When** its terminal state is shown,
   **Then** the card shows `Completed` and stops the running indicator.
7. **Given** multiple runs are active, **When** one run changes status, **Then**
   the update identifies that run and its feature and changes only the matching
   web card.
8. **Given** a structured status update is delivered, **When** the web card
   renders it, **Then** the card uses the status fields and does not need to
   infer state from byte counts, repeated messages, or other incidental output.

---

### User Story 3 - Read tool calls without transcript noise (Priority: P2)

As an operator reading the transcript, I want tool calls grouped beneath the
current step and collapsible so that I can focus on the agent's main progress
while still being able to inspect details when needed.

**Why this priority**: Tool-call detail is valuable for diagnosis, but its
current presentation can obscure the reasoning and status that operators need
first.

**Independent Test**: Run a session with multiple tool calls in one step,
collapse and expand the group, and verify that the summary, indentation, order,
and collapsed state remain correct while the run continues.

**Acceptance Scenarios**:

1. **Given** the current step contains multiple tool calls, **When** the
   transcript is displayed, **Then** the calls appear in an indented group
   beneath that step with a summary such as `N tool calls`.
2. **Given** a tool-call group is collapsed, **When** the operator expands it,
   **Then** the individual calls show their start, completion, and available
   argument details in their original order.
3. **Given** the operator collapses a tool-call group during a run, **When** new
   output or status updates arrive, **Then** the group remains collapsed until
   the operator expands it.

### Edge Cases

- When visual heartbeat updates are disabled, state detection still works and
  no periodic spinner is shown.
- When output arrives in a burst after an idle period, the state returns to
  `Running` immediately and does not visibly oscillate between states.
- Timeout remains distinct from ordinary failure so that the timeout workflow
  can provide its own guidance.
- The legacy TUI does not receive new heartbeat behavior; heartbeat-only TUI
  presentation is removed where it is no longer needed.
- Concurrent runs have independent status and tool-call groups; an update for
  one run never changes another run's card.
- A run that produces no output before completing still reports its lifecycle
  transitions and terminal result.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose discrete session statuses `running`,
  `idle`, `interrupted`, `failed`, `timed_out`, and `completed`, with
  `interrupted`, `failed`, `timed_out`, and `completed` treated as terminal
  outcomes.
- **FR-002**: The system MUST change a running session to `idle` when the time
  since its most recent output exceeds a configurable idle threshold.
- **FR-003**: Idle-state detection MUST operate independently of the visual
  spinner, so disabling the spinner MUST NOT disable state detection or state
  transitions.
- **FR-004**: The configuration MUST expose an idle-threshold setting that can
  be changed for testing and for operator-specific runtime needs.
- **FR-005**: The web dashboard MUST show an animated spinner and the `Running`
  label for running sessions, and MUST use visually distinct representations for
  idle, interrupted, failed, timed-out, and completed sessions.
- **FR-006**: The status indicator MUST show elapsed time for every active or
  terminal session and MUST show idle duration while the session is `idle`.
- **FR-007**: The system MUST expose tool-call records with distinct start,
  completion, and available argument information so that the web transcript can
  group calls without parsing raw output text.
- **FR-008**: The web transcript MUST display tool calls indented beneath their
  current step, group related calls, show a count summary, and allow each group
  to be collapsed or expanded.
- **FR-009**: Status and tool-call records MUST include the run and feature
  identity needed to keep cards independent when multiple runs are active.
- **FR-010**: State updates MUST be delivered through the existing session event
  delivery path as structured records, so the web dashboard does not infer
  status by parsing byte counters or incidental output text.
- **FR-011**: The primary heartbeat presentation MUST communicate status rather
  than repeat the last AI message or present raw stdout/stderr byte counts as
  the main information.
- **FR-012**: Heartbeat-only behavior in the legacy TUI MUST be removed rather
  than extended, while shared session behavior remains available to the web
  dashboard.

### Key Entities *(include if feature involves data)*

- **Session Status**: The current lifecycle state of a run, including elapsed
  time, idle duration when applicable, and an interruption or failure reason.
- **Status Event**: A structured state transition or periodic status record
  associated with one run and feature.
- **Tool Call Record**: A structured record of one tool invocation, including
  its lifecycle phase, ordering, and available arguments.
- **Tool Call Group**: A set of related tool calls nested beneath one current
  step, with a count and collapsed/expanded presentation state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of runs emit a structured status event at start and a
  structured terminal event; runs that cross the configured idle threshold emit
  `idle`, and runs that are interrupted, fail, time out, or complete emit the
  corresponding terminal status.
- **SC-002**: In acceptance tests, the web dashboard reflects `idle` within one
  status-detection cycle after the configured threshold is reached.
- **SC-003**: In acceptance tests with concurrent runs, 100% of status updates
  remain associated with the correct run and feature card.
- **SC-004**: In acceptance tests, operators can collapse and expand every
  tool-call group, and 100% of groups retain their selected state through later
  output and status updates in the same run.
- **SC-005**: 0 primary heartbeat status displays rely on raw byte counts or a
  repeated last AI message as the status explanation.
- **SC-006**: 0 live heartbeat-only presentation references remain in the legacy
  TUI after delivery.
- **SC-007**: At least 90% of acceptance-test participants correctly identify
  whether a sample session is running, idle, interrupted, failed, timed out, or
  completed from the web card without inspecting raw output counters.

## Assumptions

- The web dashboard is the official target for new heartbeat and transcript
  behavior; the legacy TUI is not expanded.
- The default idle threshold is 30 seconds and can be overridden by the
  operator; automated tests may use shorter values.
- The existing session identity and event-delivery mechanisms remain available
  and are extended with the structured status and tool-call records required by
  this feature.
- Tool arguments follow the existing output visibility and redaction rules;
  this feature does not expose information that the operator could not already
  access.
- F55 owns timeout policy and operator guidance. This feature only guarantees
  that timeout is represented distinctly from ordinary failure.
- F58 and other consumers reuse the status names defined here rather than
  introducing competing lifecycle labels.
