# Feature Specification: Remover step com limpeza

**Feature Branch**: `feat/set05-steps-remover-step`  
**Created**: 2026-07-15  
**Status**: Implemented  
**Roadmap**: Settings — M1 (Restaurar edição de Feature)  
**Origin**: SET-05

**Input**: User description: "Remove a workflow step through its close control and remove every guidance or isolation setting associated with that step so the updated workflow can be saved."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove a configured step safely (Priority: P1)

As a workflow editor, I want to remove a step through its close control so that the workflow no longer contains that step or any settings that refer to it, and I can save the updated workflow without an invalid-reference error.

**Why this priority**: Removing obsolete steps is essential editing work; leaving their associated settings behind prevents the editor from saving a valid workflow.

**Independent Test**: Configure a workflow with multiple steps, add guidance and an isolation setting to one step, remove that step, and save the workflow. The saved workflow no longer includes the removed step or references to it.

**Acceptance Scenarios**:

1. **Given** a workflow with at least two steps and guidance attached to one of them, **When** the editor removes that step through its close control, **Then** the step and its guidance are absent from the edited workflow.
2. **Given** a workflow with at least two steps and one marked to run in isolation, **When** the editor removes that marked step, **Then** the removed step is no longer listed as isolated and the workflow can be saved.
3. **Given** a workflow with at least two steps and a step without associated guidance or isolation settings, **When** the editor removes that step, **Then** the remaining workflow settings are unchanged and the workflow can be saved.
4. **Given** a workflow with only one step, **When** the editor attempts to use that step's close control, **Then** removal is prevented and the workflow retains its required step.
5. **Given** a workflow has an execution already in progress, **When** the editor removes and saves one of its steps, **Then** the active execution retains its recorded steps and a later execution uses the saved workflow revision.

---

### Edge Cases

- A removal must affect only the selected step; guidance and isolation settings for every remaining step must be retained.
- If the selected step is part of a workflow currently executing, the saved edit applies to a later execution and does not alter that in-progress execution.
- Saving after a valid removal must not expose an invalid-reference error caused by the removed step.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a close control for each workflow step; when only one step remains, that control cannot remove the step.
- **FR-002**: When an editor removes a step, the system MUST remove that step from the workflow's ordered list of steps.
- **FR-003**: In the same edit operation, the system MUST remove all guidance associated with the selected step.
- **FR-004**: In the same edit operation, the system MUST remove the selected step from the workflow's isolated-step settings.
- **FR-005**: After a step removal, the system MUST allow the editor to save the workflow when every remaining field is otherwise valid.
- **FR-006**: The system MUST prevent removal when the selected step is the workflow's only remaining step, and MUST leave the workflow unchanged.
- **FR-007**: Removing one step MUST NOT remove or change guidance or isolation settings associated with other steps.
- **FR-008**: A change to a workflow during an active execution MUST affect only subsequent executions; the active execution's recorded steps remain unchanged.

### Key Entities *(include if feature involves data)*

- **Workflow step**: A named, ordered unit of work in a workflow that an editor may retain or remove.
- **Step guidance**: Optional editor-provided instructions associated with one workflow step.
- **Isolated-step setting**: An optional designation that associates a workflow step with isolated execution.
- **Workflow revision**: The saved workflow configuration used for future executions, distinct from the record of an active execution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of tested removals of a step that has both guidance and an isolated-step setting, the saved workflow contains no reference to that removed step.
- **SC-002**: In 100% of tested removals of a step with no associated settings, all remaining steps and their associated settings are preserved.
- **SC-003**: Editors can complete the remove-and-save flow for a workflow with multiple steps in under 30 seconds under normal operating conditions.
- **SC-004**: In usability validation, all participating editors can distinguish the blocked single-step case from a successful removal without losing the remaining step.

## Assumptions

- Only users who can already edit a workflow can remove its steps.
- A workflow must always retain at least one step.
- The existing save flow remains the point at which the editor confirms a removal.
- Active executions keep their recorded configuration and are not retrospectively modified by a later workflow edit.
- SET-04, which establishes editable workflow steps, is available before this feature is delivered.

## Delivered Behavior

- Each workflow stage now has an accessible close control. Removing a non-final stage sends one composed patch that removes the stage, its guidance, and its isolation entry; the final control is disabled with an explanatory message.
- Pipelines persist a structural workflow revision at creation. Resume restores that revision while continuing to re-read `approvals.autoAdvance` from the live catalog.
- Focused component, WebSocket, catalog, repository, runner, and command regression suites cover the removal and revision behavior.
