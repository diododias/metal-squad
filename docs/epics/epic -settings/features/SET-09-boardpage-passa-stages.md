# Feature Specification: BoardPage passa `stages` aos cards

**Feature Branch**: `feat/set09-boardpage-passa-stages`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M2 (Board por workflow de feature + limpeza do Config)
**Origem no plano**: S09 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Ao montar cada `KanbanCard` (runs e TODO), passar `stages` de
> `state.featureCatalog[id].workflow.stages`."

Fecha a tríade do board por feature: com SET-07 (só status) e SET-08 (card exibe steps), a
`BoardPage` precisa alimentar cada card com as `stages` da sua feature, lidas do
`featureCatalog`. Assim features com workflows diferentes exibem seus próprios steps no mesmo
board por status.

## User Scenarios & Testing

### User Story 1 — Cada card mostra o workflow da sua feature
Como usuário, quero que cada card do board mostre os steps da feature que ele representa, para
comparar no mesmo board features com fluxos diferentes.

**Fluxo**: a `BoardPage` monta cada `KanbanCard` (runs e TODO) → passa
`state.featureCatalog[id].workflow.stages` como `stages` → o card renderiza (SET-08).

**Aceite**: cards de features com workflows diferentes exibem seus próprios steps no mesmo board
por status.

### Edge Cases
- Feature ausente no `featureCatalog` deve passar `stages` indefinido (SET-08 degrada).
- Runs e itens TODO DEVEM ambos receber `stages`.

## Requirements

### Functional Requirements
- **FR-001**: Ao montar cada `KanbanCard` (runs e TODO), a `BoardPage` DEVE passar `stages` de
  `state.featureCatalog[id].workflow.stages`.
- **FR-002**: Features sem entrada no catálogo DEVEM resultar em `stages` indefinido, sem crash.

### Key Entities
- **featureCatalog**: fonte das `stages` por feature no state.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Duas features com workflows distintos exibem steps distintos no mesmo board (UI focada).
- **SC-002**: Itens TODO também recebem e exibem suas `stages`.

## Dependencies & Open Decisions
- **Depende de**: SET-07, SET-08.

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/pages/BoardPage.tsx`.
- **Validação**: UI focada.
