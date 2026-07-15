---
description: "Actionable tasks for Rename Config to Settings"
---

# Tasks: Rename Config to Settings

**Input**: Design documents from `/specs/028-rename-config-settings/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/settings-ui.md`

**Tests**: Required. The specification requires focused acceptance coverage for all changed user-facing labels, the stable `#/config` route, and the unchanged ordered categories. The project constitution also requires automated coverage for changed behavior.

**Organization**: Tasks are grouped by user story so each increment can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: User story label for that task
- Every task names its exact target file path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing focused web-test rendering pattern and retain the feature's observable UI contract as the implementation boundary.

- [X] T001 Review the focused web-client test setup and route baseline in tests/web/client.test.ts before adding rendered Settings assertions
- [X] T002 [P] Verify the feature acceptance boundary and stable internal identifiers in specs/028-rename-config-settings/contracts/settings-ui.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No new infrastructure is required. The existing hash route, keyboard event mapping, page component, tab state, runtime configuration, and WebSocket contracts are the foundation and must remain intact.

**⚠️ CRITICAL**: Complete the baseline review in Phase 1 before changing user-visible labels. No foundational source task is needed because this is a presentation-only rename.

**Checkpoint**: Existing `#/config` behavior and the category implementation are identified as preservation boundaries; user-story work can begin.

---

## Phase 3: User Story 1 - Find Settings Consistently (Priority: P1) 🎯 MVP

**Goal**: Present one consistent Settings name in desktop/mobile navigation, the destination heading, and keyboard help while retaining the existing route and `g c` shortcut.

**Independent Test**: Render the affected client surfaces; confirm navigation, page heading, and shortcut help say `Settings`; trigger/select the navigation path and confirm it resolves to `#/config` and the `config` route.

### Tests for User Story 1

- [X] T003 [US1] Add rendered client assertions for the Settings navigation label, Settings page heading, `g c` help label, and unchanged `#/config` route in tests/web/client.test.ts

### Implementation for User Story 1

- [X] T004 [P] [US1] Change the configuration navigation item's visible label from `Config` to `Settings` without altering its `/config` path or keyboard map in src/web/client/App.tsx
- [X] T005 [P] [US1] Change the configuration page header title from `Config` to `Settings` without changing `SUB_TABS` or tab state in src/web/client/pages/ConfigPage.tsx
- [X] T006 [P] [US1] Change the `g c` shortcut help label from `Go to Config` to `Go to Settings` in src/web/client/HelpOverlay.tsx

**Checkpoint**: The navigation, destination heading, and keyboard help consistently show Settings; `#/config` and `g c` still reach the existing page.

---

## Phase 4: User Story 2 - Keep Existing Configuration Choices Available (Priority: P2)

**Goal**: Preserve the existing Runtime, Defaults, Skills, Notifications, and Budget tabs in their current order and with their existing selectable behavior.

**Independent Test**: Render Settings and assert the exact ordered category list; select each category and confirm its existing content is displayed without changing the hash route.

### Tests for User Story 2

- [X] T007 [US2] Extend the Settings rendering coverage to assert the Runtime, Defaults, Skills, Notifications, and Budget tab order and selectable content in tests/web/client.test.ts

### Implementation for User Story 2

- [X] T008 [US2] Preserve the existing `SUB_TABS` identifiers, labels, order, and tab-to-content switch while applying the renamed header in src/web/client/pages/ConfigPage.tsx

**Checkpoint**: Settings retains every pre-existing category in the same order, and every category still renders its prior content.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete observable contract and required repository gates without expanding the terminology-only scope.

- [X] T009 [P] Reconcile implemented visible labels and compatibility boundaries against specs/028-rename-config-settings/contracts/settings-ui.md
- [X] T010 Run the focused Settings client regression suite with npm exec vitest run tests/web/client.test.ts
- [X] T011 Run the required build, test, type-check, and lint gates from package.json
- [X] T012 Perform the dashboard validation for navigation, `#/config`, categories, and `g c` in specs/028-rename-config-settings/quickstart.md (served artifact and rendered-client coverage; browser unavailable in this session)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately; T001 establishes the applicable test pattern and T002 may run in parallel.
- **Foundational (Phase 2)**: Depends on Phase 1; it has no source change, but confirms the non-negotiable compatibility boundary before implementation.
- **User Story 1 (Phase 3)**: Starts after Phase 2. T003 defines failing coverage before T004-T006; the three implementation tasks can proceed in parallel because they edit different files.
- **User Story 2 (Phase 4)**: Starts after the stable Settings page from US1. T007 verifies preservation before T008 confirms no category behavior changed.
- **Polish (Phase 5)**: Starts after US1 and US2; T009 can run in parallel with source-complete review, then execute T010-T012 in order.

### User Story Dependencies

- **US1 (P1)**: Depends only on the completed compatibility review; it is the MVP.
- **US2 (P2)**: Depends on US1's renamed page surface because it verifies the categories within Settings; it must not change their identifiers, labels, order, or selection behavior.

### Parallel Opportunities

- T001 and T002 can run concurrently.
- After T003 is in place, T004 (`App.tsx`), T005 (`ConfigPage.tsx`), and T006 (`HelpOverlay.tsx`) can run concurrently.
- T009 can be reviewed in parallel with final implementation review; do not begin execution gates until T007-T008 are complete.

## Parallel Example: User Story 1

```text
Task: "Change the navigation label in src/web/client/App.tsx"
Task: "Change the page heading in src/web/client/pages/ConfigPage.tsx"
Task: "Change the keyboard-help label in src/web/client/HelpOverlay.tsx"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T002 and preserve the `#/config` compatibility boundary.
2. Write T003 so the new visible-label and route expectations are explicit.
3. Complete T004-T006, then run T010 to prove the Settings terminology and route behavior.
4. Stop and validate the P1 navigation-to-heading journey before taking US2.

### Incremental Delivery

1. Deliver US1 as the terminology-only Settings outcome.
2. Add US2's explicit category preservation coverage and confirm no tab behavior changed.
3. Complete the contract review, required gates, and manual dashboard validation.

## Notes

- Keep `Config` in non-rendered component names, routes, state fields, and runtime configuration identifiers.
- Do not modify the legacy Ink TUI, database, server, WebSocket messages, or configuration schema.
- All tasks use the required checkbox, sequential ID, optional parallel marker, story label where applicable, and exact file-path format.
