# Feature Specification: Custom Skill or Prompt Per Step

**Feature Branch**: `013-step-custom-skill`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Feature: F46 — Prompt/Skill Customizado por Step

Summary:
Problema: skills sao resolvidas por precedence global (repo > global > external > builtin), sem mecanismo claro de skill/prompt extra que guie especificamente um step de uma feature.
Objetivo: permitir associar uma skill ou prompt extra a um step especifico de uma feature, reaproveitando o skill registry (F02) quando possivel em vez de criar um path paralelo de resolucao.
Escopo esperado (investigacao no specify antes de codificar): src/core/skills/ (discovery/resolve, sem duplicar precedence), src/core/backlog/ (schema para associar skill/prompt por step), src/core/backlog/prompt.ts (injecao do prompt customizado, F03).
Validacao: step com skill/prompt customizado usa esse conteudo na montagem final do prompt sem quebrar steps sem customizacao; npm run build, npm test e npm run typecheck passam."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guide one specific step with extra instructions (Priority: P1)

An operator defines a feature with multiple steps and needs one specific step to run with extra guidance that does not apply to the rest of the feature. They attach a custom skill reference or extra prompt text to that step, and the system uses it only when assembling the prompt for that step.

**Why this priority**: This is the core value of the feature. Without step-scoped guidance, the system still forces users to rely on feature-wide defaults or global skill precedence, which is the current limitation.

**Independent Test**: Configure one feature where only a single step has custom guidance, build the final prompt for that step and for another untouched step, and verify that the targeted step includes the extra guidance while the other step remains unchanged.

**Acceptance Scenarios**:

1. **Given** a feature contains multiple steps and one step declares custom guidance, **When** the system assembles the prompt for that step, **Then** the final prompt includes the declared step-specific guidance in addition to the normal feature context.
2. **Given** the same feature contains another step with no custom guidance, **When** the system assembles the prompt for that other step, **Then** the final prompt matches the existing behavior with no extra step-specific content added.

---

### User Story 2 - Reuse the existing skill registry instead of a second resolution path (Priority: P2)

An operator references a named skill as step-specific guidance and expects the system to resolve that skill using the same discovery and precedence rules already used elsewhere, rather than maintaining a separate lookup mechanism just for step customization.

**Why this priority**: The feature must extend the existing mental model instead of creating conflicting behavior. Reusing the registry reduces ambiguity and keeps step customization consistent with the current skill ecosystem.

**Independent Test**: Reference a step-specific skill name that exists in more than one source, verify that the same source would win as in the standard skill registry flow, and confirm the resolved content is what enters the step prompt.

**Acceptance Scenarios**:

1. **Given** a step references a named guidance skill, **When** the system resolves that reference, **Then** it applies the same precedence and validation rules already used for other named skills.
2. **Given** a step references a named guidance skill that does not exist, **When** the backlog is validated or loaded for execution, **Then** the system rejects the configuration with a clear missing-guidance error before the step runs.

---

### User Story 3 - Combine feature defaults with step-level overrides without regressions (Priority: P3)

An operator already uses feature-level or task-level skills and now adds step-level customization. They expect existing defaults to continue working and the step-specific customization to be merged predictably instead of replacing unrelated context or breaking unaffected steps.

**Why this priority**: The feature only becomes safe to adopt if teams can add step-specific customization incrementally without rewriting existing backlog configurations.

**Independent Test**: Execute prompt assembly for a feature that uses existing defaults plus one customized step, and verify that inherited guidance still appears where expected while the additional step guidance is applied only to the intended step in a deterministic order.

**Acceptance Scenarios**:

1. **Given** a feature already defines default guidance and one step also defines step-specific guidance, **When** the prompt for that step is assembled, **Then** the final prompt contains both the inherited guidance and the step-specific guidance in a documented, deterministic order.
2. **Given** a feature contains no step-specific guidance anywhere, **When** prompts are assembled for its steps, **Then** the resulting prompts are identical to the pre-feature behavior.

---

### Edge Cases

- What happens when a step declares both a named skill and direct extra prompt text? The system must apply both in a deterministic order so operators can predict the final prompt content.
- What happens when a step-specific guidance declaration duplicates a skill already inherited from feature or task defaults? The system must avoid ambiguous duplication and preserve a single predictable result.
- What happens when direct extra prompt text is empty or whitespace-only? The system must ignore it rather than injecting blank sections into the final prompt.
- What happens when a feature is loaded from the catalog and some steps use custom guidance while others do not? The loaded runtime representation must preserve the same step-specific behavior as the source backlog.
- What happens when a step-specific configuration is present on one step of a staged workflow but the stage is retried or resumed later? The same custom guidance must still be applied to that step on subsequent prompt builds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a feature author to associate step-specific guidance with an individual step without requiring the same guidance to apply to the rest of the feature.
- **FR-002**: The system MUST support step-specific guidance as a named skill reference, a direct extra prompt block, or both together for the same step.
- **FR-003**: When a step uses a named skill reference, the system MUST resolve that reference through the existing skill registry and its current precedence rules rather than through a second resolution mechanism dedicated to step customization.
- **FR-004**: The system MUST validate every named step-specific guidance reference before execution and fail fast with a clear error when any referenced guidance is missing.
- **FR-005**: When assembling the final prompt for a step, the system MUST include inherited feature or task guidance exactly as it does today unless that same step explicitly adds more guidance.
- **FR-006**: When a step includes direct extra prompt text, the system MUST append that text only to the targeted step's final prompt and MUST NOT inject it into prompts for other steps of the same feature.
- **FR-007**: When a step declares both named guidance and direct extra prompt text, the system MUST merge them in a single documented order so the resulting prompt is deterministic across repeated runs, retries, and resumes.
- **FR-008**: Steps with no step-specific guidance MUST preserve the current prompt assembly behavior with no added content and no behavioral regression.
- **FR-009**: The runtime representation used after backlog loading or catalog import MUST preserve step-specific guidance data so prompt assembly behaves the same whether execution uses freshly loaded backlog data or catalog-backed feature data.
- **FR-010**: The system MUST avoid introducing a parallel precedence model for direct or named step guidance that conflicts with the existing skill registry mental model.
- **FR-011**: The system MUST ignore empty step-specific prompt text instead of producing blank guidance sections in the assembled prompt.
- **FR-012**: The system MUST make the presence of step-specific guidance observable in the assembled prompt content so operators can verify that the intended step received the customization.

### Key Entities *(include if feature involves data)*

- **Step Guidance**: The step-scoped customization attached to a single step, composed of an optional named skill reference, an optional direct extra prompt block, or both.
- **Guidance Reference**: A named pointer to an existing skill that must be resolved through the standard skill registry and precedence rules.
- **Prompt Assembly Context**: The full set of inherited feature, task, and step-specific inputs used to build the final prompt for one step execution.
- **Execution Step**: A single unit of work inside a feature that may inherit default guidance and optionally define its own additional guidance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In validation scenarios where only one step declares custom guidance, 100% of assembled prompts for that step include the extra guidance and 0% of prompts for untouched steps include it.
- **SC-002**: In scenarios where a step references a named guidance skill available from multiple sources, 100% of resolutions match the same winning source that the standard skill registry would return for that name.
- **SC-003**: In validation scenarios covering existing features with no step-specific guidance, 100% of assembled prompts remain unchanged from pre-feature behavior.
- **SC-004**: In validation scenarios with invalid named step guidance, the system blocks execution before the step starts in 100% of cases and reports which reference is missing.
- **SC-005**: In validation scenarios with both inherited guidance and step-specific guidance, the final prompt order is identical across repeated runs, retries, and resume flows in 100% of tested cases.

## Assumptions

- The term "step" refers to the execution unit already represented in the backlog flow today, and this feature extends that unit rather than introducing a new execution hierarchy.
- Named step guidance should behave like any other skill lookup already supported by the project; no new source types or precedence tiers are needed for this feature.
- Direct extra prompt text is additive guidance for a single step, not a replacement for the rest of that step's prompt context.
- Existing feature-level and task-level guidance remain valid and continue to be the default behavior when a step does not declare its own customization.
- Prompt assembly for retries, resumes, and catalog-backed execution should continue to derive from the same canonical step data, so step-specific guidance must survive those flows unchanged.
