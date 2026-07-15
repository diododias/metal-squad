# Feature Specification: Rename Config to Settings

**Feature Branch**: `feat/set10b-renomear-config-settings`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "SET-10b — Rename Config to Settings"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find Settings Consistently (Priority: P1)

As a product user, I want the navigation and page heading to use the name
"Settings", so that configuration options have one clear, consistent name.

**Why this priority**: This is the complete customer-facing outcome of the feature;
without it, the product retains conflicting terminology.

**Independent Test**: Open the application navigation, select "Settings", and
confirm that the destination heading is "Settings".

**Acceptance Scenarios**:

1. **Given** a user can view the main navigation, **When** they look for the
   configuration area, **Then** it is labelled "Settings".
2. **Given** a user selects "Settings" from the navigation, **When** the
   destination opens, **Then** its main heading is "Settings".

---

### User Story 2 - Keep Existing Configuration Choices Available (Priority: P2)

As a product user, I want the existing settings categories to remain available
after the rename, so that a terminology change does not remove or reorganize my
configuration choices.

**Why this priority**: Continuity protects the workflows of people who already
use the configuration area.

**Independent Test**: Navigate to Settings and verify that every category that
is currently available is still available and selectable.

**Acceptance Scenarios**:

1. **Given** a user opens Settings, **When** they view its category tabs,
   **Then** the same set of pre-existing categories is displayed.
2. **Given** a user selects any pre-existing category, **When** its content is
   shown, **Then** its configuration options remain available.

### Edge Cases

- A user reaches the renamed area through navigation rather than a direct link;
  the destination must load successfully with no dead navigation item.
- The rename must not leave a visible "Config" label in navigation or the page
  heading.
- The rename must not remove, rename, or reorder the existing settings categories.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST present the configuration area as "Settings" in
  the main navigation.
- **FR-002**: Selecting "Settings" from the main navigation MUST open the
  configuration area successfully.
- **FR-003**: The configuration area MUST use "Settings" as its main page
  heading.
- **FR-004**: The product MUST use the Settings name consistently for the
  configuration area, with no remaining "Config" label in its navigation or
  page heading.
- **FR-005**: The set, names, order, and selectable behavior of the existing
  settings categories — Runtime, Defaults, Skills, Notifications, and Budget —
  MUST remain unchanged by this feature.

### Key Entities

- **Settings area**: The product area where users view and adjust existing
  configuration categories.
- **Settings category**: An existing selectable group of related configuration
  options within the Settings area.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In focused acceptance testing, 100% of tested navigation paths to
  the configuration area display "Settings" in both the navigation item and the
  destination heading.
- **SC-002**: In focused acceptance testing, 100% of the settings categories
  available before the rename remain visible, selectable, and in the same order.
- **SC-003**: A user can locate and open Settings from the main navigation in
  one selection, without encountering a failed or blank destination.
- **SC-004**: Review of the affected user-facing navigation and heading shows
  zero remaining uses of "Config" for the renamed area.

## Assumptions

- This is a terminology-only change; it does not add, remove, or change the
  behavior of configuration options or categories.
- The existing audience and access permissions for the configuration area remain
  unchanged.
- The renamed destination replaces the prior naming; continued support for
  previously shared direct links is outside this feature unless separately
  requested.
- The existing category labels and order are the baseline to preserve.
- The Features & Prompts category was removed by the preceding SET-10 change
  and is not part of this rename's preservation boundary.

## Dependencies

- This feature is independently deliverable and is naturally sequenced after
  SET-10 in the Settings roadmap.

## Scope Boundaries

- Included: the configuration area's user-facing navigation name, destination
  name, and preservation of its existing categories.
- Excluded: new settings categories, permission changes, configuration behavior
  changes, and a redesign of the settings experience.
