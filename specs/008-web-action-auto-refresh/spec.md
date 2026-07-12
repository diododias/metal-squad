# Feature Specification: Web Action State Auto Refresh

**Feature Branch**: `008-web-action-auto-refresh`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "F38 — Web Action State Auto Refresh"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Refresh run controls instantly (Priority: P1)

As a user operating an active run from the web UI, I need run control actions such as start, stop, pause, resume, and abort to change the visible state immediately after the action result is returned, so I can trust what I just did without reloading the page.

**Why this priority**: This is the main failure described in the feature. If the dashboard, run detail, cards, and buttons stay stale after a control action, the web mode feels unreliable even when the action succeeded.

**Independent Test**: Open the web UI, trigger each supported run control action from a visible run, and confirm that status, available controls, and the run's placement in the interface update automatically with no manual refresh.

**Acceptance Scenarios**:

1. **Given** a run is visible in the web dashboard and detail view, **When** the user pauses, resumes, stops, or aborts it, **Then** the visible status, action buttons, and summary information update automatically after the action result is returned.
2. **Given** a feature is waiting in backlog or TODO, **When** the user starts it from the web UI, **Then** the item leaves backlog or TODO and appears in the column that matches its new execution state without a page reload.
3. **Given** an action is rejected or fails, **When** the result is returned to the web UI, **Then** the interface shows that the requested transition did not take effect and keeps the visible state consistent with reality.

---

### User Story 2 - Resolve blockers without manual refresh (Priority: P1)

As a user resolving gates and stage requests from the web UI, I need approve, skip, and retry actions to refresh all relevant views immediately, so blocked work can continue without forcing a reload.

**Why this priority**: Blocked flows are time-sensitive. If the user approves or retries something and the screen still looks blocked, the control action appears broken and the next decision becomes unclear.

**Independent Test**: Open a blocked run with visible gates or stage requests, trigger approve, skip, and retry actions, and confirm that pending blockers, run status, and action affordances refresh automatically everywhere they are shown.

**Acceptance Scenarios**:

1. **Given** a gate or stage request is pending in the web UI, **When** the user approves it, **Then** the pending item, blocked status, and available follow-up controls update automatically without manual refresh.
2. **Given** a gate or stage request is pending, **When** the user skips or retries it, **Then** the resulting state change is reflected automatically in the blocker list and any related run or feature views.
3. **Given** the same blocked run is visible in more than one web surface, **When** the user resolves the blocker from one surface, **Then** the other surfaces show the same updated state during the same session.

---

### User Story 3 - Keep shared views in sync (Priority: P2)

As a user navigating between dashboard, run detail, and backlog-oriented views in the same web session, I need every representation of the same feature, task, or run to stay synchronized after an action, so I never see the same work item in conflicting states.

**Why this priority**: The problem is not limited to one screen. Trust in the web mode depends on all derived views reflecting the same latest state instead of requiring a manual refresh to reconcile them.

**Independent Test**: With the same feature or task visible in more than one part of the web UI, perform actions that change its state and verify that all affected surfaces converge automatically on the same result.

**Acceptance Scenarios**:

1. **Given** a feature or task is represented in both a board column and a detail-oriented view, **When** its state changes because of a web action, **Then** both surfaces refresh automatically to the same latest state.
2. **Given** a user performs multiple supported actions in sequence, **When** each result is returned, **Then** the interface settles on the latest confirmed state and does not re-show an older state afterward.
3. **Given** a feature or task has already advanced into execution, **When** the user returns to backlog or TODO views, **Then** the item no longer appears as if it were still waiting to start.

---

### Edge Cases

- What happens when an action succeeds in the control panel but the affected item is also visible in another part of the same session? All visible representations must converge on the same updated state automatically.
- What happens when two supported actions occur in quick succession for the same run or blocker? The interface must settle on the latest confirmed state and avoid briefly preserving an outdated one as the final result.
- What happens when an action fails or is denied? The interface must show that the requested transition did not happen and keep the visible state aligned with the actual execution state.
- What happens when a started feature or task already had an earlier failed or blocked attempt visible elsewhere? The active representation must move to the correct execution column without leaving a stale copy in backlog or TODO.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST refresh the visible state of the web UI immediately after any supported control action returns a result.
- **FR-002**: The system MUST reflect start, stop, pause, resume, and abort actions in dashboard summaries, run detail screens, action buttons, and item placement without requiring a page reload.
- **FR-003**: The system MUST reflect approve, skip, and retry actions for gates and stage requests without requiring a page reload.
- **FR-004**: When a feature or task is started from backlog or TODO, the system MUST remove it from waiting-state columns and show it in the column that matches its actual execution state as soon as that execution exists.
- **FR-005**: The system MUST keep all visible representations derived from the same shared session state synchronized after an action result is returned.
- **FR-006**: The system MUST show successful, failed, and intermediate action outcomes in the UI without requiring a manual refresh.
- **FR-007**: The system MUST prevent the same feature or task from remaining visible simultaneously as both "waiting to start" and "already in execution" after a supported state transition.
- **FR-008**: If a requested action does not take effect, the system MUST preserve or restore the correct visible state and clearly indicate that the requested transition was not applied.
- **FR-009**: The system MUST ensure that sequential actions on the same run, gate, or stage request resolve to the latest confirmed visible state rather than reintroducing a stale earlier state.
- **FR-010**: The system MUST deliver the updated state through the normal interactive web flow, without depending on a full page reload to make the result visible.

### Key Entities *(include if feature involves data)*

- **Web Action**: A user-initiated control request from the web UI, such as starting a feature, changing run execution state, or resolving a blocker.
- **Execution State**: The current real-world status of a feature, task, or run as represented in the product, including waiting, running, blocked, paused, failed, and completed states.
- **Blocker Request**: A gate or stage request that requires an approve, skip, or retry decision before work can continue.
- **Shared View State**: The common state reflected across dashboard, board columns, run detail, and other surfaces that present the same feature, task, or run during a web session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, 100% of supported web control actions update the visible UI state without the tester needing to press F5 or manually reload the page.
- **SC-002**: In acceptance testing, 100% of start actions move the affected feature or task out of backlog or TODO and into the correct execution-oriented column automatically.
- **SC-003**: In acceptance testing, 100% of approve, skip, and retry actions update blocker status and related run state across all visible affected surfaces in the same session.
- **SC-004**: In acceptance testing, 100% of failed or denied actions leave the interface showing the correct actual state rather than a false successful transition.
- **SC-005**: During end-to-end validation, users can observe the result of a supported control action on the current screen within 2 seconds after the action result is returned.
- **SC-006**: During regression validation, zero tested scenarios show the same feature or task simultaneously in backlog or TODO and in an active execution column after the transition has completed.

## Assumptions

- The web mode already supports the control actions covered by this feature; this work improves visible state synchronization rather than adding new action types.
- Dashboard, run detail, board columns, and blocker views can all present the same feature, task, or run during a single web session.
- Starting a feature or task creates or associates an execution record quickly enough that the UI can move it out of backlog or TODO as part of the same user flow.
- Existing access rules and business decisions for who may trigger actions remain unchanged by this feature.
- The expected behavior applies to both successful transitions and failed attempts to transition state.
