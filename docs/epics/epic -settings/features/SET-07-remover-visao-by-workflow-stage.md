# Feature Specification: Remover visão "by workflow stage"

**Feature Branch**: `feat/set07-remover-visao-by-stage`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M2 (Board por workflow de feature + limpeza do Config)
**Origem no plano**: S07 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Remover `viewMode`, o toggle, o branch `else` e a constante hardcoded `WORKFLOW_STAGES` do
> `BoardPage.tsx`. Board só por status." (design §3.12, ponto 1 §3.5)

O board tinha duas visões: por status e por "workflow stage" (com `WORKFLOW_STAGES` hardcoded).
Com stages passando a ser por feature (SET-08/SET-09), a visão global por stage deixa de fazer
sentido e é removida — o board fica só por status.

## User Scenarios & Testing

### User Story 1 — Board apenas por status
Como usuário, quero um board único por status (TODO/IN PROGRESS/DONE/FALHA), sem toggle de visão,
para não depender de uma lista global de stages que não representa mais features heterogêneas.

**Fluxo**: abre o board → vê colunas por status, sem toggle de visão.

**Aceite**: board renderiza colunas por status; não há `viewMode`, toggle nem `WORKFLOW_STAGES`.

### Edge Cases
- Remoção não pode quebrar a montagem dos cards (steps virão via SET-08/SET-09).
- Nenhuma referência órfã a `viewMode`/`WORKFLOW_STAGES` no restante do código.

## Requirements

### Functional Requirements
- **FR-001**: `viewMode`, o toggle de visão, o branch `else` da visão por stage e a constante
  `WORKFLOW_STAGES` DEVEM ser removidos de `BoardPage.tsx`.
- **FR-002**: O board DEVE renderizar apenas colunas por status: TODO, IN PROGRESS, DONE, FALHA.
- **FR-003**: Não DEVE restar referência órfã a `viewMode` ou `WORKFLOW_STAGES`.

### Key Entities
- **BoardPage**: página do board, agora só por status.

## Success Criteria

### Measurable Outcomes
- **SC-001**: O board renderiza colunas por status sem toggle (teste de UI do board).
- **SC-002**: `rtk npm run typecheck` passa sem referência a símbolos removidos.

## Dependencies & Open Decisions
- **Depende de**: — (pode andar em paralelo com SET-08).
- **Habilita**: SET-09 (passar stages por feature).

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/pages/BoardPage.tsx`.
- **Validação**: `rtk npx vitest run tests/ui/...` (board).
