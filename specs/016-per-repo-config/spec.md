# Feature Specification: F22 - Per-Repo Config

**Feature Branch**: `[016-per-repo-config]`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Feature: F22 — Per-Repo Config"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Apply repo-specific defaults (Priority: P1)

As a maintainer working across multiple repositories, I want a repository to define its own default Metal Squad settings so each repo behaves appropriately without changing my global preferences.

**Why this priority**: This is the core user value of the feature. Without repo-specific defaults, users must repeatedly edit global settings or manually override behavior for each repository.

**Independent Test**: Can be fully tested by defining repo-specific settings in one repository, loading configuration there, and confirming the resolved settings differ from the global baseline only for that repository.

**Acceptance Scenarios**:

1. **Given** a user has existing global Metal Squad settings and a repository defines repo-specific settings, **When** configuration is loaded inside that repository, **Then** the resolved configuration uses the global settings as a base and applies the repo-specific overrides for matching fields.
2. **Given** a repository does not define repo-specific settings, **When** configuration is loaded inside that repository, **Then** the resolved configuration remains consistent with existing global behavior.

---

### User Story 2 - Preserve deeper override precedence (Priority: P2)

As a maintainer configuring workflow execution, I want backlog-level and feature-level defaults to continue overriding broader settings so the most specific intent always wins.

**Why this priority**: The feature must extend existing behavior safely. Preserving override precedence prevents regressions in backlog and feature execution.

**Independent Test**: Can be fully tested by defining conflicting values at global, repo, backlog, and feature levels and verifying the resolved result follows the expected hierarchy.

**Acceptance Scenarios**:

1. **Given** the same setting is defined globally, at the repository level, in backlog defaults, and at the feature level, **When** the configuration is resolved for that feature, **Then** the feature-level value takes precedence.
2. **Given** a setting is absent from the feature level but present in backlog defaults and repo settings, **When** the configuration is resolved, **Then** the backlog value overrides the repo value and the repo value overrides the global value.

---

### User Story 3 - Reference sensitive values safely (Priority: P3)

As a maintainer who needs repository-specific integrations, I want repo configuration to reference environment variables so sensitive values are not stored directly in the repository.

**Why this priority**: Secure and reusable configuration is important, but it builds on the successful introduction of repo-level config loading and merge behavior.

**Independent Test**: Can be fully tested by defining repo configuration with environment variable placeholders and confirming the resolved configuration substitutes available values without altering unrelated settings.

**Acceptance Scenarios**:

1. **Given** a repo configuration contains environment variable placeholders and those variables are available at runtime, **When** the configuration is loaded, **Then** the resolved configuration includes the runtime values instead of the placeholders.
2. **Given** a repo configuration contains environment variable placeholders and a referenced variable is unavailable, **When** the configuration is loaded, **Then** the system surfaces a clear configuration error without silently using an incorrect value.

### Edge Cases

- A repository contains a repo configuration file with only one overridden field; all unspecified fields must continue to inherit from broader defaults.
- A repository contains invalid repo configuration content; the system must fail clearly without corrupting resolved settings.
- A repo configuration references an environment variable used in nested configuration data, and substitution must work consistently in that nested location.
- Existing users with only global configuration and backlog defaults must observe no behavior change after the feature is introduced.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support repository-scoped configuration stored within an individual repository.
- **FR-002**: The system MUST resolve configuration using this precedence order: global configuration, then repository configuration, then backlog defaults, then feature-level overrides.
- **FR-003**: The system MUST apply repository-scoped overrides only when operating inside the repository that defines them.
- **FR-004**: The system MUST preserve current behavior for repositories that do not define repository-scoped configuration.
- **FR-005**: The system MUST support repository-scoped values for execution defaults already supported by broader configuration, including workflow-related defaults and notification-related defaults.
- **FR-006**: The system MUST resolve environment variable placeholders found in repository-scoped configuration values during configuration loading.
- **FR-007**: The system MUST report invalid repository-scoped configuration in a way that identifies the repository configuration as the source of the problem.
- **FR-008**: The system MUST provide a way for users to view the fully resolved effective configuration after repository-scoped overrides and later precedence layers are applied.
- **FR-009**: The system MUST ensure repository-scoped configuration can define defaults for backlog behavior without requiring changes to global configuration.
- **FR-010**: The system MUST preserve compatibility with existing global defaults so current repositories continue working unless they opt into repository-scoped configuration.

### Key Entities *(include if feature involves data)*

- **Global Configuration**: User-wide Metal Squad settings that apply across repositories unless overridden by more specific configuration sources.
- **Repository Configuration**: Repository-local settings that customize behavior for one repository while inheriting unspecified values from broader defaults.
- **Backlog Defaults**: Repository backlog-defined defaults that shape behavior for features in that backlog and override broader configuration layers.
- **Feature Overrides**: Feature-specific settings that take final precedence for a single backlog item or workflow execution.
- **Resolved Configuration**: The effective configuration produced after merging all applicable layers and resolving environment variable placeholders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a repository with repo-specific settings, users can inspect the resolved configuration and confirm the repository overrides are applied in under 1 minute.
- **SC-002**: In repositories without repo-specific settings, existing configuration-driven workflows continue to behave the same in 100% of regression validation scenarios.
- **SC-003**: When conflicting values exist across configuration layers, the resolved value matches the documented precedence order in 100% of validation scenarios.
- **SC-004**: Users can configure repository-specific sensitive values through environment variables without storing the resolved secrets directly in repository configuration files.

## Assumptions

- Repository-scoped configuration is intended for a single repository context and does not yet introduce multi-project config management.
- Existing global configuration remains the default source of truth when a repository does not opt into repository-scoped configuration.
- Repository-scoped configuration uses the same general setting categories users already understand from broader Metal Squad configuration.
- Validation for this feature will continue to rely on the existing build, test, and typecheck quality gates already used by the project.
