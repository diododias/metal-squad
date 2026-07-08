# Feature Specification: F08 Session and Run Navigation

**Feature Branch**: `002-session-run-navigation`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Feature: F08 — Navegacao por Sessoes/Runs" based on `docs/features/F08-session-navigation.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drill Down Through Navigation Levels (Priority: P1)

An operator opens the TUI and navigates from the global overview into a specific
repository, then into a feature, and finally into a single run without leaving
the keyboard-driven flow.

**Why this priority**: The navigation hierarchy is the core value of the feature.
Without reliable drill down, historical sessions and run data remain effectively
hidden.

**Independent Test**: This can be tested by opening the TUI with existing run
history and verifying that a user can move from overview to a run detail screen
using only the supported navigation keys.

**Acceptance Scenarios**:

1. **Given** the user is on the overview screen with multiple registered repos,
   **When** the user selects a repo and presses `enter`,
   **Then** the TUI opens the repo-level view for that repo.

2. **Given** the user is on the repo view,
   **When** the user selects a feature and presses `enter`,
   **Then** the TUI opens the selected feature's run history.

3. **Given** the user is on a feature's run history,
   **When** the user selects a run and presses `enter`,
   **Then** the TUI opens the detail view for that run.

4. **Given** the user is in any nested view,
   **When** the user presses `esc`,
   **Then** the TUI returns to the previous level and preserves the prior selection context.

---

### User Story 2 - Inspect Historical Run Details (Priority: P2)

An operator opens a feature's run history to understand what happened in a
specific run, including its full log, status, tool, duration, token usage, and
timestamps.

**Why this priority**: Once drill down exists, the next most valuable outcome is
understanding a run without leaving the TUI or cross-referencing separate
system records.

**Independent Test**: This can be tested with recorded runs that include logs and
metadata, validating that the detail view exposes the full record for a selected
run and remains readable for long content.

**Acceptance Scenarios**:

1. **Given** a feature has multiple historical runs,
   **When** the user opens that feature,
   **Then** the TUI lists the runs in a way that allows the user to distinguish one run from another.

2. **Given** the user opens a specific run,
   **When** the detail view renders,
   **Then** it shows the run's complete log plus key metadata including result, duration, token usage, and relevant timestamps.

3. **Given** the selected run is still in progress or has partial data,
   **When** the user opens the detail view,
   **Then** the TUI shows the available fields and clearly indicates any values that are not yet available.

---

### User Story 3 - Compare and Find Runs Quickly (Priority: P3)

An operator narrows the visible run set with filters or search and compares two
runs from the same feature to understand differences in outcome, duration, and
token usage.

**Why this priority**: History becomes useful only when the operator can locate
the relevant runs quickly and evaluate whether a new run improved or regressed
against a prior one.

**Independent Test**: This can be tested with one feature containing multiple
runs across different statuses and tools, validating filtering, searching, and
side-by-side comparison without relying on other navigation flows.

**Acceptance Scenarios**:

1. **Given** the user is viewing a list of repos, features, or runs,
   **When** the user opens the status filter and selects one or more statuses,
   **Then** only matching items remain visible and the active filter state is clearly shown.

2. **Given** the user is viewing run history,
   **When** the user searches by feature id or title,
   **Then** the list narrows to matching results and allows the user to open a match directly.

3. **Given** the user selects two runs from the same feature,
   **When** the user opens the comparison view,
   **Then** the TUI highlights differences in result, duration, and token usage between the two runs.

4. **Given** the user attempts to compare runs that do not belong to the same feature,
   **When** the comparison action is invoked,
   **Then** the TUI prevents the action and explains the constraint.

### Edge Cases

- The selected repo has no epics or features with recorded runs.
- The selected feature has only one historical run, so comparison is not yet possible.
- Applying filters or search returns no matches.
- A run detail view is opened for a run whose log is empty, truncated, or still being written.
- The underlying run list refreshes while the user is in a nested view.
- A previously selected run is no longer available because data was removed or reindexed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present a navigation hierarchy with the levels `Overview`, `Repo`, `Feature`, and `Run`.
- **FR-002**: The `Overview` level MUST list all registered repos that have navigable run history and show enough summary information for the user to choose where to drill down next.
- **FR-003**: The `Repo` level MUST allow the user to browse the repo's epics and features that have recorded runs.
- **FR-004**: The `Feature` level MUST show the historical runs for the selected feature and preserve their association to that feature.
- **FR-005**: The `Run` detail view MUST display the selected run's full log and key metadata, including status, tool, duration, token usage, and relevant timestamps when available.
- **FR-006**: The system MUST support keyboard navigation using `j` and `k` to move selection, `enter` to drill down, and `esc` to return to the previous level.
- **FR-007**: When the user returns to a previous level, the system MUST preserve the user's last selection and position unless the selected item no longer exists.
- **FR-008**: The system MUST provide a comparison view that compares exactly two runs from the same feature on result, duration, and token usage.
- **FR-009**: The system MUST prevent comparisons across different features and show a clear explanation when the user attempts it.
- **FR-010**: The system MUST provide filtering by run status, including `running`, `done`, `failed`, and `blocked`.
- **FR-011**: The system MUST provide filtering by tool or adapter used for the run.
- **FR-012**: The system MUST provide search by feature id or feature title within the current navigation context.
- **FR-013**: The system MUST indicate when filters or search are active and MUST allow the user to clear them without leaving the current view.
- **FR-014**: The system MUST show an explanatory empty state when the current repo, feature, filter, or search scope has no matching data.
- **FR-015**: The system MUST keep operator-facing labels, prompts, and status text in English.

### Key Entities *(include if feature involves data)*

- **Repository Summary**: A navigable record for a registered repo, including its identity and the summary signals needed at the overview level.
- **Feature Record**: A navigable feature within a repo, including feature id, title, and the history of runs attached to it.
- **Run Record**: A single historical execution entry for a feature, including result, tool, token usage, timestamps, duration, and full log content.
- **Comparison Pair**: A temporary user selection consisting of exactly two runs from the same feature for side-by-side inspection.
- **Filter State**: The currently applied status filter, tool filter, and search query that shape the visible list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability checks with existing run data, 90% of operators can navigate from `Overview` to a target run in 30 seconds or less without leaving the keyboard flow.
- **SC-002**: In validation runs, 100% of features with recorded history show their associated runs in the feature view without mixing runs from other features.
- **SC-003**: Operators can open a run detail view and identify the run's result, duration, and token usage in 10 seconds or less for 95% of sampled runs.
- **SC-004**: Operators can narrow a target run set using filters or search in no more than 3 interaction steps after opening the relevant list view.
- **SC-005**: For 100% of valid comparison attempts, the comparison view shows differences for result, duration, and token usage; for 100% of invalid attempts, the user receives an explanatory message instead of a broken view.

## Assumptions

- The feature builds on the existing multi-panel TUI shell introduced by F05 and does not redefine the overall application layout.
- Registered repos, feature metadata, run history, token usage, and run logs are already available from the existing system records.
- Comparison is limited to two runs from the same feature in this version; cross-feature and cross-repo comparison are out of scope.
- Search is intended to help operators find features by identifier or title, not to provide full-text search across logs.
- English-only operator-facing copy remains the product standard for new TUI work in this repo.
