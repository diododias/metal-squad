# Feature Specification: Reorder Workflow Steps

**Feature Branch**: `feat/set06-steps-reordenar`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Allow users to reorder a feature's workflow steps. The saved order determines the order of the next execution, without losing steps or their associated settings."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reorder a workflow (Priority: P1)

As a feature editor, I want to move a workflow step to a different position so that I can control the order in which the feature is handled without rebuilding the workflow.

**Why this priority**: The sequence of steps directly determines the execution sequence, so an editor must be able to correct it before starting another run.

**Independent Test**: Can be fully tested by moving one existing step between two others, saving the feature, reopening it, and confirming the same sequence is shown and used for a later run.

**Acceptance Scenarios**:

1. **Given** a workflow with at least two steps, **When** the editor moves a step to another valid position and saves, **Then** the workflow displays the new complete sequence.
2. **Given** a saved reordered workflow, **When** the editor reopens the feature, **Then** the saved sequence is retained.
3. **Given** a saved reordered workflow, **When** a new run starts, **Then** its steps are handled in the saved sequence.

---

### User Story 2 - Preserve step configuration while reordering (Priority: P2)

As a feature editor, I want each step to retain its existing guidance and execution setting when its position changes so that reordering does not require reconfiguration.

**Why this priority**: Reordering is intended to change sequence only; losing a step's configuration would make the operation unsafe and create avoidable recovery work.

**Independent Test**: Can be fully tested by reordering a workflow whose steps have guidance and execution settings, then confirming every setting remains attached to its original step.

**Acceptance Scenarios**:

1. **Given** a step with associated guidance, **When** it is moved and the workflow is saved, **Then** the same guidance remains associated with that step.
2. **Given** a step with an execution-isolation setting, **When** it is moved and the workflow is saved, **Then** the same setting remains associated with that step.

### Edge Cases

- Moving a step must not create a duplicate or remove any step from the workflow.
- The first and last steps can be moved when another valid position exists; a request that would not change the sequence leaves it unchanged.
- A reorder saved while a run is already active affects only a future run; the active run keeps its established sequence.
- If saving the reordered workflow cannot be completed, the editor receives clear feedback and the last saved sequence remains intact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a feature editor to change the relative position of any workflow step when the workflow contains at least two steps.
- **FR-002**: The system MUST present the updated sequence before the editor saves it.
- **FR-003**: The system MUST save the complete reordered sequence when the editor saves the feature configuration.
- **FR-004**: The system MUST retain every existing workflow step exactly once after a reorder.
- **FR-005**: The system MUST retain each step's existing guidance and execution-isolation setting when its position changes.
- **FR-006**: The system MUST use the saved sequence for runs started after the reorder is saved.
- **FR-007**: The system MUST not alter the sequence of a run that was already active when the reorder was saved.
- **FR-008**: The system MUST tell the editor when a reordered sequence could not be saved and preserve the last saved sequence.

### Key Entities *(include if feature involves data)*

- **Workflow step**: A named unit in a feature workflow. Its ordered position defines when it is handled during a run.
- **Workflow sequence**: The complete ordered list of workflow steps for a feature.
- **Step guidance**: Existing instructions associated with a particular workflow step.
- **Execution-isolation setting**: Existing setting that determines whether a particular workflow step runs separately from others.
- **Run**: A single execution of a feature workflow, which uses the sequence established when it starts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, an editor can move a selected step and save the new sequence in 30 seconds or less without recreating the workflow.
- **SC-002**: Across all tested reorder operations, the saved workflow contains the same number of steps as before the operation, with each original step appearing exactly once.
- **SC-003**: Across all tested reordered workflows, every step retains its pre-existing guidance and execution-isolation setting.
- **SC-004**: In every acceptance test that starts a run after saving a reordered workflow, the run handles the steps in the saved sequence.
- **SC-005**: In usability review, feature editors can verify the new sequence before saving and receive understandable feedback if saving fails.

## Assumptions

- This desirable Settings M1 item is considered only after the capability to add workflow steps is available.
- The feature applies to existing feature editors and their current workflow configuration; it does not introduce new user roles or permissions.
- The interaction method for moving a step may be chosen to fit the existing editor, provided it clearly supports the outcomes in this specification.
- Reordering changes sequence only. Creating, deleting, or changing the content of steps is outside this feature's scope.
- An active run keeps the sequence it had when it began; the newly saved sequence applies to subsequent runs.

## Dependencies

- Depends on SET-04, which enables editors to manage workflow steps.
