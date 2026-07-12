# Feature Specification: Backlog Auto-Pilot

**Feature Branch**: `014-backlog-auto-pilot`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Feature: F45 — Piloto Automatico (Auto-Pilot de Backlog)

Summary:
Problema: hoje o disparo de uma nova feature e manual. O pedido e um modo piloto automatico: ao concluir uma feature, iniciar automaticamente a proxima elegivel sem dependencia pendente; se uma feature travar (gate pendente ou falha que nao seja de budget/token), pular para a proxima demanda elegivel em vez de ficar parado; isso so vale para demandas marcadas explicitamente como auto-exec.
Objetivo: adicionar ao orchestrator um loop reativo de 'o que iniciar a seguir', disparado por eventos de conclusao/falha/bloqueio, respeitando uma flag por feature de execucao automatica.
Escopo esperado (investigacao no specify antes de codificar): src/core/orchestrator/ (loop sobre o scheduler existente), src/core/events/ (gatilho via run:done/run:failed/run:blocked), src/core/backlog/ (novo campo autoStart ou similar por feature).
Validacao: conclusao de uma feature auto-exec dispara a proxima elegivel automaticamente; bloqueio/falha nao-budget pula para a proxima demanda auto-exec; demandas sem a flag continuam so manuais; npm run build, npm test e npm run typecheck passam.

Existing feature brief from docs/features/F45-piloto-automatico.md:
# F45 — Piloto Automatico (Auto-Pilot de Backlog)

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Alta
**Relaciona**: F14 (Budget Caps), F12 (Pause/Resume/Abort), orchestrator/scheduler

## Relato do usuario (2026-07-11)

> Permitir piloto automatico, de forma que uma feature seja concluida e outra
> ja seja iniciada desde que nao tenha dependencias pendentes
> Quando uma feature entra em bloqueio (pausada esperando aprovacao ou falhou
> por motivos diferentes de falta de tokens/limite excedido), deve puxar a
> proxima demanda no backlog e por para iniciar
> demanda no backlog devem ser marcadas para execucao automatica, nao
> iniciando demandas que nao tiverem marcadas para execucao automatica,
> sendo iniciadas apenas manualmente

## Problema

Hoje o disparo de uma nova feature parece manual. O pedido e um modo 'piloto
automatico' onde:

1. Ao concluir uma feature, a proxima elegivel (sem dependencia pendente) e
   iniciada automaticamente.
2. Se uma feature trava (gate pendente de aprovacao, ou falha que nao seja
   por budget/limite de tokens), o piloto pula para a proxima demanda
   elegivel do backlog em vez de ficar parado.
3. Isso so vale para demandas explicitamente marcadas como 'auto exec' no
   backlog — demandas sem essa marca so iniciam manualmente.

## Escopo provavel

- `src/core/orchestrator/` — scheduler ja faz ordenacao topologica; este
  modo adiciona um loop de 'o que iniciar a seguir' reagindo a eventos de
  conclusao/falha/bloqueio
- `src/core/events/` — provavel gatilho via event bus (`run:done`,
  `run:failed`, `run:blocked`)
- `src/core/backlog/` — novo campo no schema (`autoStart`/similar) por
  feature/demanda

## Proximo passo

Definir precisamente a distincao entre 'falhou por falta de tokens/limite'
(nao deve puxar proxima demanda — ver F14 budget caps) e outras falhas (deve
puxar). Isso depende de como `onFail`/budget cap hoje sinalizam o motivo da
falha (`src/core/orchestrator/`, `src/db/`)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start the next eligible automatic feature after a success (Priority: P1)

An operator maintains a backlog with features that are explicitly marked for automatic execution. When one automatic feature finishes successfully, the system immediately starts the next eligible automatic feature whose dependencies are already satisfied, without requiring a new manual start command.

**Why this priority**: This is the core value of the feature. Without automatic handoff after success, the backlog still depends on manual babysitting between completed features.

**Independent Test**: Prepare a backlog with at least two dependency-free automatic features in deterministic order, complete the first one successfully, and verify that the next eligible automatic feature starts without any operator action.

**Acceptance Scenarios**:

1. **Given** an automatic feature finishes successfully and another automatic feature is already eligible, **When** the first feature reaches its completed state, **Then** the next eligible automatic feature starts without a manual trigger.
2. **Given** an automatic feature finishes successfully and the next backlog item is not marked for automatic execution, **When** the first feature completes, **Then** the manual-only item remains idle and is not started automatically.

---

### User Story 2 - Keep backlog progress moving when an automatic feature blocks or fails for non-budget reasons (Priority: P2)

An operator does not want the backlog to stop entirely when an automatic feature becomes blocked waiting for human approval or fails for a reason unrelated to budget or token exhaustion. The affected feature should remain in its blocked or failed state, and the system should move on to the next eligible automatic feature instead of waiting indefinitely.

**Why this priority**: Automatic execution only reduces operational overhead if it keeps making progress through the eligible backlog when a single feature stalls for a non-protective reason.

**Independent Test**: Prepare a backlog with an automatic feature that becomes blocked or fails for a non-budget reason, followed by another eligible automatic feature, and verify that the second feature starts while the first remains blocked or failed for later operator action.

**Acceptance Scenarios**:

1. **Given** an automatic feature enters a human-waiting blocked state and another automatic feature is already eligible, **When** the blocked state is recorded, **Then** the system leaves the blocked feature pending resolution and starts the next eligible automatic feature.
2. **Given** an automatic feature fails for a reason other than budget or token protection and another automatic feature is already eligible, **When** the failure is recorded, **Then** the system leaves the failed feature as failed and starts the next eligible automatic feature instead of halting the backlog.

---

### User Story 3 - Preserve manual control and budget safety boundaries (Priority: P3)

An operator mixes automatic and manual features in the same backlog and relies on budget protection to stop unsafe execution. They expect automatic execution to respect the explicit automatic flag, never start manual-only items on its own, and stop auto-dispatch when the system hits a budget or token protection condition that requires human intervention.

**Why this priority**: The feature must stay safe and predictable. If it ignores manual-only items or budget protections, the automation becomes untrustworthy.

**Independent Test**: Prepare a backlog with both automatic and manual-only features plus a scenario that triggers budget or token protection, and verify that only automatic features start by themselves while protective stop conditions prevent further automatic starts.

**Acceptance Scenarios**:

1. **Given** a manual-only feature is eligible but not marked for automatic execution, **When** the auto-pilot selects the next feature, **Then** that manual-only feature is skipped and remains available only for manual start.
2. **Given** an automatic feature reaches a budget or token protection condition that requires human intervention, **When** that protective state is recorded, **Then** the system does not auto-start another feature until the operator explicitly resolves the protective condition.

---

### Edge Cases

- What happens when an automatic feature finishes, blocks, or fails, but no other automatic feature is currently eligible? The system must remain idle rather than starting a manual-only or dependency-blocked feature.
- What happens when multiple automatic features are eligible at the same time? The system must choose the next feature using the same deterministic backlog ordering and dependency rules already used elsewhere, rather than inventing a second prioritization model.
- What happens when a feature becomes blocked waiting for approval and is later resumed manually? The resumed work must not create duplicate automatic starts for the same feature or interrupt a different feature that the auto-pilot already started in the meantime.
- What happens when a feature fails because of budget or token protection rather than an ordinary execution failure? The system must preserve the existing protective stop behavior and require human intervention before any further automatic execution.
- What happens when a skipped automatic feature and a newly completed automatic feature both make another downstream feature eligible? The system must still start that downstream feature only once.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow each backlog feature to declare whether it is eligible for automatic execution.
- **FR-002**: The system MUST treat the automatic-execution marker as opt-in; features without that marker MUST remain manual-start only.
- **FR-003**: When an automatic feature completes successfully, the system MUST select and start the next eligible automatic feature without requiring operator action.
- **FR-004**: A feature MUST be considered eligible for automatic start only when all of its declared dependencies are already satisfied and it is not already completed or actively running.
- **FR-005**: When an automatic feature enters a blocked state that represents waiting for human approval or input, the system MUST leave that feature blocked and continue automatic selection with the next eligible automatic feature, if one exists.
- **FR-006**: When an automatic feature fails for a reason other than budget or token protection, the system MUST leave that feature failed and continue automatic selection with the next eligible automatic feature, if one exists.
- **FR-007**: When a feature is stopped by budget or token protection, the system MUST preserve the existing protective stop behavior and MUST NOT auto-start another feature until the operator resolves that condition.
- **FR-008**: Automatic feature selection MUST reuse the existing dependency-respecting backlog order so that auto-pilot does not introduce a separate prioritization model.
- **FR-009**: When no automatic feature is eligible after a completion, block, or qualifying failure, the system MUST remain idle instead of starting a manual-only or dependency-blocked feature.
- **FR-010**: The system MUST react to execution-outcome state changes in the current run lifecycle so that automatic selection occurs immediately after a feature reaches a qualifying completed, blocked, or failed state rather than only on a fresh manual command.
- **FR-011**: A feature that was skipped because it blocked or failed MUST remain available for the existing manual recovery path, but the system MUST NOT duplicate its execution automatically while another active run already exists for that feature.
- **FR-012**: Automatic continuation MUST apply at the feature level only; it MUST NOT change the existing approval, pause, resume, abort, or staged-step behavior inside an individual feature run.

### Key Entities *(include if feature involves data)*

- **Automatic Feature**: A backlog feature explicitly marked as eligible for automatic execution after qualifying predecessor outcomes.
- **Eligible Feature**: A feature whose dependencies are already satisfied and which is available to start without conflicting with an existing active or completed run.
- **Protective Stop**: A budget- or token-related condition that intentionally prevents further automatic execution until a human resolves it.
- **Auto-Pilot Decision**: The system's determination of whether to start the next automatic feature, remain idle, or stop because a protective condition applies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In validation scenarios where automatic features complete successfully and another automatic feature is eligible, 100% of completions trigger the next eligible automatic feature without manual start input.
- **SC-002**: In validation scenarios where an automatic feature becomes blocked waiting for human action or fails for a non-budget reason, 100% of those outcomes leave the affected feature in its blocked or failed state and start the next eligible automatic feature if one exists.
- **SC-003**: In validation scenarios with mixed automatic and manual-only backlog items, 0% of manual-only features start automatically.
- **SC-004**: In validation scenarios involving budget or token protection, 100% of protective stops prevent further automatic starts until explicit human intervention occurs.
- **SC-005**: In validation scenarios with dependency chains and multiple eligible candidates, 100% of automatically started features have all declared dependencies satisfied at the moment they begin.

## Assumptions

- Existing manual start, retry, resume, abort, and gate-resolution flows remain available and continue to be the recovery path for blocked or failed features that auto-pilot skips.
- The backlog's current dependency-aware ordering remains the canonical way to choose among multiple eligible automatic features; this feature does not introduce a new priority system.
- Automatic execution is configured per feature, not per individual task or stage within a feature.
- Budget and token protection behavior defined by the existing cost-control feature remains authoritative and overrides auto-pilot continuation.
- Auto-pilot reuses the existing execution-capacity rules; it decides what to start next when capacity is available rather than changing the number of simultaneous features allowed.
