# Feature Specification: "Aprovar e continuar com tool X" (ApprovalBanner)

**Feature Branch**: `feat/set20-aprovar-continuar-tool`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M5 (Resume com troca de tool no web)
**Origem no plano**: S19 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "No gate/approval de stage, opção de aprovar e continuar trocando a tool (cenário 'depois do
> plan'). Aprovar com override retoma com a nova tool sem alterar o backlog."

Segundo ponto de entrada para a troca de tool no web: no banner de aprovação de um gate/stage,
permitir aprovar e já seguir com outra tool — útil no cenário clássico de "depois do plan, trocar
o executor".

## User Scenarios & Testing

### User Story 1 — Aprovar um gate e seguir com outra tool
Como usuário, quero, ao aprovar um gate de stage, escolher continuar com outra tool, para trocar
o executor no ponto de aprovação sem editar o backlog.

**Fluxo**: no `ApprovalBanner` do gate → escolhe "aprovar e continuar com tool X" → aprova com
override → a pipeline retoma com a nova tool.

**Aceite**: aprovar com override retoma com a nova tool sem alterar o backlog.

### Edge Cases
- Aprovar sem override segue com a tool original (comportamento atual preservado).
- Tool indisponível → feedback via `ui:notice` (SET-18).

## Requirements

### Functional Requirements
- **FR-001**: O `ApprovalBanner` DEVE oferecer, no gate/approval de stage, aprovar e continuar
  trocando a tool.
- **FR-002**: Aprovar com override DEVE retomar via `action:resumeWithOverride`, sem alterar o backlog.
- **FR-003**: Aprovar sem override DEVE preservar o comportamento atual (tool original).

### Key Entities
- **ApprovalBanner**: banner de aprovação de gate/stage.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Aprovar com override retoma com a nova tool (UI focada).
- **SC-002**: Backlog permanece inalterado.

## Dependencies & Open Decisions
- **Depende de**: SET-18.

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/feedback/ApprovalBanner.tsx`.
- **Validação**: UI focada.
