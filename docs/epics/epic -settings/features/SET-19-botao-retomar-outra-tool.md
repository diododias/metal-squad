# Feature Specification: Botão "retomar com outra tool" (RunDetail)

**Feature Branch**: `feat/set19-botao-retomar-outra-tool`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M5 (Resume com troca de tool no web)
**Origem no plano**: S18 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Para pipeline pausada/abortada, dropdown de tool + model/effort opcionais →
> `action:resumeWithOverride`. Botão só aparece quando há pipeline retomável."

UI para a action de SET-18: no detalhe da run, quando a pipeline está pausada ou abortada, o
usuário escolhe outra tool (e opcionalmente model/effort) e retoma.

## User Scenarios & Testing

### User Story 1 — Retomar do RunDetail com outra tool
Como usuário, quero, numa pipeline pausada/abortada, escolher outra tool e retomar, para desviar
de uma tool problemática sem editar o backlog.

**Fluxo**: abre o RunDetail de uma pipeline retomável → seleciona tool no dropdown (e model/effort
se quiser) → clica retomar → dispara `action:resumeWithOverride`.

**Aceite**: o botão só aparece quando há pipeline retomável; dispara a retomada.

### Edge Cases
- Pipeline não retomável → botão oculto.
- Tool indisponível → feedback via `ui:notice` (vindo de SET-18).

## Requirements

### Functional Requirements
- **FR-001**: O RunDetail DEVE oferecer, para pipeline pausada/abortada, um dropdown de tool +
  campos opcionais model/effort.
- **FR-002**: A ação DEVE disparar `action:resumeWithOverride`.
- **FR-003**: O controle SÓ DEVE aparecer quando houver pipeline retomável.

### Key Entities
- **RunDetailPage**: tela de detalhe da run.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Em pipeline retomável, o dropdown aparece e dispara a action (UI focada).
- **SC-002**: Em pipeline não retomável, o controle não aparece.

## Dependencies & Open Decisions
- **Depende de**: SET-18.

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/pages/RunDetailPage.tsx`.
- **Validação**: UI focada.
