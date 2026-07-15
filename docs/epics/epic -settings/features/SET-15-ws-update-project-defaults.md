# Feature Specification: WS `action:updateProjectDefaults`

**Feature Branch**: `feat/set15-ws-update-project-defaults`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M4 (Projeto editável — defaults no DB)
**Origem no plano**: S14 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`ProjectDefaultsPatch` (narrow) + case no `handleClientMessage` → `updateCatalogDefaults` →
> `reconcileWebState` + `ui:info/notice`."

Expõe a persistência de SET-14 pelo WebSocket: uma action que recebe um patch estreito de
defaults de projeto, aplica via `updateCatalogDefaults` e reconcilia o state, com feedback ao
cliente.

## User Scenarios & Testing

### User Story 1 — Gravar defaults do projeto pela web
Como cliente web, quero enviar `action:updateProjectDefaults` com um patch, para persistir os
defaults do projeto e ver o state reconciliar.

**Fluxo**: cliente envia a action com `ProjectDefaultsPatch` → `handleClientMessage` chama
`updateCatalogDefaults` → `reconcileWebState` → devolve `ui:info` (sucesso) ou `ui:notice` (erro).

**Aceite**: mensagem WS válida grava; inválida retorna `ui:notice` sem gravar.

### Edge Cases
- Patch fora do `ProjectDefaultsPatch` (campos não permitidos) → rejeitado.
- Falha de escrita (read-only) → `ui:notice` acionável, sem state inconsistente.

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir o tipo `ProjectDefaultsPatch` (narrow) em `src/web/types.ts`.
- **FR-002**: `handleClientMessage` DEVE tratar `action:updateProjectDefaults` chamando
  `updateCatalogDefaults` e depois `reconcileWebState`.
- **FR-003**: Sucesso DEVE emitir `ui:info`; falha/validação, `ui:notice`, sem gravar.
- **FR-004**: A action NÃO DEVE aceitar campos fora do patch narrow.

### Key Entities
- **ProjectDefaultsPatch**: contrato estreito da action.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Mensagem válida grava e reconcilia o state (unit do handler).
- **SC-002**: Mensagem inválida retorna `ui:notice` sem escrita.

## Dependencies & Open Decisions
- **Depende de**: SET-14.

## Technical Notes (do plano)
- **Arquivos**: `src/web/types.ts`, `src/web/server.ts`.
- **Validação**: unit do handler.
