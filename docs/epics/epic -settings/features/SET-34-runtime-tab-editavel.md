# Feature Specification: RuntimeTab editável (App)

**Feature Branch**: `feat/set34-runtime-tab-editavel`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M8 (App editável + segredos write-only)
**Origem no plano**: S33 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`concurrency`, `toolTimeoutMs`, `heartbeatMs`, `staleRunThresholdMinutes`,
> `promptContextCharLimit`, `web.host/port/auth` editáveis; remover linha `workflow.*` global.
> Salvar persiste em `config.json`; writability desabilita quando não gravável." (design §3.3–3.6)

Torna o `RuntimeTab` editável para os parâmetros de App, persistindo em `config.json` (SET-31/32)
e respeitando writability (SET-33). Remove a linha de `workflow.*` global (que migra para
Projeto/Feature).

## User Scenarios & Testing

### User Story 1 — Editar runtime do App pela UI
Como usuário, quero editar `concurrency`, timeouts, heartbeat e `web.host/port/auth` numa aba,
para ajustar o App sem editar o `config.json` à mão.

**Fluxo**: abre Settings → Runtime → edita `concurrency` e a porta do web → salva → persiste em
`config.json`; se não gravável, os campos ficam desabilitados.

**Aceite**: salvar persiste em `config.json`; writability desabilita quando não gravável.

### Edge Cases
- `config.json` não gravável → controles desabilitados com feedback.
- `web.auth/host/port` exige sessão autenticada (SET-32).
- Linha `workflow.*` global removida sem quebrar layout.

## Requirements

### Functional Requirements
- **FR-001**: O `RuntimeTab` DEVE editar `concurrency`, `toolTimeoutMs`, `heartbeatMs`,
  `staleRunThresholdMinutes`, `promptContextCharLimit` e `web.host/port/auth`.
- **FR-002**: Salvar DEVE persistir em `config.json` (via SET-31/32).
- **FR-003**: Writability DEVE desabilitar os controles quando `config.json` não é gravável.
- **FR-004**: A linha `workflow.*` global DEVE ser removida do RuntimeTab.

### Key Entities
- **RuntimeTab**: aba de runtime do App, agora editável.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Editar `concurrency` e a porta e salvar atualiza `config.json` (UI focada).
- **SC-002**: Com `config.json` read-only, os controles ficam desabilitados.

## Dependencies & Open Decisions
- **Depende de**: SET-01, SET-32, SET-33.

## Technical Notes (do plano)
- **Arquivos**: `ConfigPage.tsx` (`RuntimeTab`).
- **Validação**: UI focada.
