# Feature Specification: Board cards display feature stages

**Feature Branch**: `feat/set09-boardpage-passa-stages`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "SET-09 — BoardPage passa stages aos cards"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compare feature workflows on the board (Priority: P1)

As a workflow operator, I want every board card to show the steps configured for the feature it represents, so that I can compare items with different workflows in the same status view.

**Why this priority**: The board is only reliable for workflow comparison when a card reflects its own feature's configured steps rather than a shared or missing workflow.

**Independent Test**: Configure two features with different workflow steps, show their run cards in the same board status column, and verify that each card displays only its feature's steps.

**Acceptance Scenarios**:

1. **Given** two catalogued features with different configured workflow steps and visible run cards in the same board status, **When** an operator views the board, **Then** each card displays the steps configured for the feature it represents.
2. **Given** a catalogued feature has a visible TODO item, **When** an operator views the board, **Then** its TODO card displays that feature's configured workflow steps.
3. **Given** a visible run or TODO item refers to a feature absent from the catalog, **When** an operator views the board, **Then** the card remains usable without workflow steps and the board continues to render.

### Edge Cases

- A run and a TODO item for the same feature both use that feature's configured workflow steps.
- A feature missing from the catalog does not prevent unrelated cards from rendering.
- Features with no configured workflow steps display no steps without creating a misleading default workflow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The board MUST provide each run card with the workflow steps configured for the feature represented by that run.
- **FR-002**: The board MUST provide each TODO card with the workflow steps configured for the feature represented by that TODO item.
- **FR-003**: When a represented feature has no catalog entry, the board MUST render its card without workflow steps and without interrupting the rest of the board.
- **FR-004**: When features with different configured workflows appear in the same board status, each card MUST retain the workflow steps of its own feature.

### Key Entities *(include if feature involves data)*

- **Feature catalog entry**: The configured record for a feature, including its workflow steps.
- **Board card**: A visual representation of either a run or a TODO item and its feature-specific workflow context.
- **Workflow steps**: The ordered steps configured for a feature's workflow and displayed on its board card.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a focused board verification containing two features with different workflows, 100% of visible run cards display only the steps configured for their own feature.
- **SC-002**: In a focused board verification containing TODO items for configured features, 100% of visible TODO cards display the steps configured for their own feature.
- **SC-003**: In a focused board verification containing an item whose feature is absent from the catalog, the board renders all visible cards and the absent feature's card remains usable without steps.
- **SC-004**: An operator can distinguish the configured workflows of two cards in the same status column without leaving the board.

## Assumptions

- The board already renders workflow steps when they are supplied to a card; this feature supplies the feature-specific workflow context to both supported card types.
- The existing feature catalog is the authoritative source for configured workflow steps.
- The feature is limited to associating existing workflow-step information with board cards; it does not introduce workflow editing, new card types, or fallback workflow definitions.
- SET-07 and SET-08 are available as prerequisites for status-only board grouping and workflow-step display.
