# Feature Specification: Step-Scoped Custom Guidance

**Feature Branch**: `015-step-custom-guidance`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Feature: F46 — Prompt/Skill Customizado por Step

Summary:
Problema: skills sao resolvidas por precedence global (repo > global > external > builtin), sem mecanismo claro de skill/prompt extra que guie especificamente um step de uma feature.
Objetivo: permitir associar uma skill ou prompt extra a um step especifico de uma feature, reaproveitando o skill registry (F02) quando possivel em vez de criar um path paralelo de resolucao.
Escopo esperado (investigacao no specify antes de codificar): src/core/skills/ (discovery/resolve, sem duplicar precedence), src/core/backlog/ (schema para associar skill/prompt por step), src/core/backlog/prompt.ts (injecao do prompt customizado, F03).
Validacao: step com skill/prompt customizado usa esse conteudo na montagem final do prompt sem quebrar steps sem customizacao; npm run build, npm test e npm run typecheck passam.

Existing feature brief from docs/features/F46-custom-prompt-per-step.md:
# F46 — Prompt/Skill Customizado por Step

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Media
**Relaciona**: F02 (Skill Registry), F03 (Dynamic Prompt Builder)

## Relato do usuario (2026-07-11)

> permitir inserir uma skill ou prompt que vai guiar aquela step"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guide one specific step with extra instructions (Priority: P1)

An operator defines a feature with multiple execution steps and attaches extra guidance to only one of them. When that step is prepared for execution, the system includes the extra guidance in that step's final prompt without affecting the prompts for other steps.

**Why this priority**: This is the core outcome of the feature. Without step-scoped guidance, users still have to rely on feature-wide defaults or manual prompt rewrites.

**Independent Test**: Configure a feature where only one step declares custom guidance, then compare the assembled prompt for that step against the prompts for untouched steps and confirm only the targeted step changes.

**Acceptance Scenarios**:

1. **Given** a feature with multiple steps and only one step declares custom guidance, **When** the system assembles the prompt for that step, **Then** the final prompt includes the declared step-specific guidance alongside the normal feature context.
2. **Given** the same feature contains another step with no custom guidance, **When** the system assembles the prompt for that other step, **Then** the prompt matches the current default behavior with no extra guidance added.

---

### User Story 2 - Reuse the existing skill registry for named step guidance (Priority: P2)

An operator references an existing skill by name as guidance for a specific step and expects the system to resolve it through the same discovery and precedence rules already used elsewhere in the product.

**Why this priority**: The feature should extend the current skills model instead of creating a separate resolution path that behaves differently and becomes harder to reason about.

**Independent Test**: Reference a named guidance skill for one step where the same skill name exists in more than one source, then verify the system chooses the same winning source that the standard skill registry would choose.

**Acceptance Scenarios**:

1. **Given** a step references a named guidance skill, **When** the system resolves that guidance, **Then** it uses the same precedence and validation behavior already defined for standard skill resolution.
2. **Given** a step references a named guidance skill that does not exist, **When** the feature configuration is validated before execution, **Then** the system rejects the configuration with a clear error identifying the missing guidance reference.

---

### User Story 3 - Add step guidance without breaking existing features (Priority: P3)

An operator adds step-scoped guidance to a feature that already relies on inherited defaults and expects existing steps without custom guidance to continue behaving exactly as before.

**Why this priority**: Adoption depends on safe incremental use. Teams need to add step-specific guidance without rewriting all existing prompt configuration or risking regressions in unaffected steps.

**Independent Test**: Assemble prompts for a feature that has inherited guidance plus one customized step and confirm the inherited guidance still appears where expected while untouched steps remain unchanged.

**Acceptance Scenarios**:

1. **Given** a feature already has inherited guidance and one step also defines step-specific guidance, **When** the prompt for that step is assembled, **Then** the final prompt contains both inherited guidance and step-specific guidance in a deterministic order.
2. **Given** a feature contains no step-specific guidance anywhere, **When** prompts are assembled for its steps, **Then** the resulting prompts are identical to the behavior before this feature was introduced.

---

### Edge Cases

- A step declares both a named skill reference and direct prompt text; both must be included in a predictable order so operators can reason about the final prompt.
- A step-specific skill reference duplicates guidance already inherited from broader feature defaults; the final prompt must avoid ambiguous or conflicting duplication.
- A step-specific prompt block is empty or whitespace-only; it must be ignored rather than creating blank guidance sections.
- A feature is loaded from persisted backlog data or catalog-backed data; step-specific guidance must survive that transition unchanged.
- A step is retried or resumed after a previous execution attempt; the same step-specific guidance must still be present when rebuilding the prompt.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a feature author to attach step-specific guidance to an individual execution step without applying that same guidance to the rest of the feature.
- **FR-002**: The system MUST support step-specific guidance as a named skill reference, direct prompt text, or both together for the same step.
- **FR-003**: When step-specific guidance is expressed as a named skill reference, the system MUST resolve it through the existing skill registry and its established precedence rules rather than through a separate step-only lookup mechanism.
- **FR-004**: The system MUST validate each named step-specific guidance reference before execution and fail fast with a clear error when a referenced skill cannot be resolved.
- **FR-005**: The system MUST preserve current prompt assembly behavior for steps that do not define step-specific guidance.
- **FR-006**: When a step includes direct prompt text, the system MUST add that text only to the final prompt of the targeted step and MUST NOT inject it into any other step prompt.
- **FR-007**: When a step declares both a named skill reference and direct prompt text, the system MUST merge them in one documented, deterministic order.
- **FR-008**: The system MUST preserve step-specific guidance data after backlog loading, catalog import, and any other runtime preparation flow so the same step receives the same guidance at execution time.
- **FR-009**: The system MUST keep inherited feature-level guidance available to customized steps unless the feature configuration explicitly removes it through an existing supported mechanism.
- **FR-010**: The system MUST ignore empty step-specific prompt text instead of emitting blank guidance sections in the final prompt.
- **FR-011**: The system MUST make step-specific guidance visible in the assembled prompt content so an operator can verify that the intended customization was applied.
- **FR-012**: The system MUST avoid introducing a parallel precedence model that conflicts with the existing user mental model for skill discovery and resolution.

### Key Entities *(include if feature involves data)*

- **Execution Step**: A single unit of work within a feature that may inherit default guidance and optionally define its own additional guidance.
- **Step Guidance**: The step-scoped customization attached to one execution step, including an optional named skill reference, optional direct prompt text, or both.
- **Guidance Reference**: A named pointer to a discovered skill that must be resolved through the standard skill registry rules.
- **Prompt Assembly Context**: The combined inherited and step-specific inputs used to build the final prompt for one execution step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In validation scenarios where only one step declares custom guidance, 100% of prompts assembled for that step include the extra guidance and 0% of prompts for untouched steps include it.
- **SC-002**: In validation scenarios where a step references a named skill available from multiple sources, 100% of resolutions match the same winning source returned by the standard skill registry for that name.
- **SC-003**: In regression validation scenarios using features with no step-specific guidance, 100% of assembled prompts remain unchanged from pre-feature behavior.
- **SC-004**: In invalid-configuration scenarios with missing named step guidance, the system blocks execution before the step starts in 100% of cases and identifies the missing reference.
- **SC-005**: In repeated-run, retry, and resume validation scenarios, the prompt for a customized step preserves the same guidance ordering in 100% of cases.

## Assumptions

- The existing concept of an execution step is the correct unit for attaching custom guidance, so this feature extends current step modeling rather than introducing a new hierarchy.
- Named step guidance should reuse the existing skill registry and source precedence rules; no new source category is required for this feature.
- Direct step-specific prompt text is additive guidance for a single step and does not replace the rest of the prompt context by default.
- Existing inherited guidance at feature or broader workflow level remains valid and should continue to apply when a step adds its own extra guidance.
- Runtime flows that reload feature definitions, retries, or resume execution should all rebuild prompts from the same canonical step data.
