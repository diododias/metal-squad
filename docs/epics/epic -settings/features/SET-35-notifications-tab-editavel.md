# Feature Specification: NotificationsTab editável (App)

**Feature Branch**: `feat/set35-notifications-tab-editavel`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M8 (App editável + segredos write-only)
**Origem no plano**: S34 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Add/remove/editar `channels[]` por tipo, toggles de `events[]`; credenciais (chatId, webhook
> URL, token) write-only mostrando `configured`." (design §3.3–3.6)

Torna a gestão de notificações editável: canais por tipo (add/remove/editar) e toggles de
eventos, com credenciais tratadas write-only (mostram apenas `configured`).

## User Scenarios & Testing

### User Story 1 — Configurar canais e eventos de notificação
Como usuário, quero adicionar/editar canais de notificação e escolher os eventos, com credenciais
que não vazam na leitura, para configurar alertas com segurança.

**Fluxo**: abre Settings → Notifications → adiciona um canal (ex.: webhook) com a URL/token →
salva → a credencial vai para o keychain/config write-only → a leitura mostra `configured`.

**Aceite**: editar canais persiste; credenciais vão p/ keychain/config sem vazar na leitura.

### Edge Cases
- Editar um canal sem retocar a credencial mantém a credencial existente.
- Remover um canal limpa também sua credencial.
- Toggle de evento não afeta credenciais.

## Requirements

### Functional Requirements
- **FR-001**: O `NotificationsTab` DEVE permitir add/remove/editar `channels[]` por tipo e toggles
  de `events[]`.
- **FR-002**: Credenciais (chatId, webhook URL, token) DEVEM ser write-only, exibindo `configured`.
- **FR-003**: Editar canais DEVE persistir; credenciais NÃO DEVEM vazar na leitura.

### Key Entities
- **NotificationsTab**: aba de notificações, agora editável.
- **channels[] / events[]**: canais e eventos configuráveis.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Cadastrar um webhook persiste e a leitura devolve só `configured` (UI focada).
- **SC-002**: Toggle de evento persiste sem afetar credenciais.

## Dependencies & Open Decisions
- **Depende de**: SET-32, SET-33.
- **Relaciona**: SET-40 (canal de aprovação plugável consome esses canais).

## Technical Notes (do plano)
- **Arquivos**: `ConfigPage.tsx` (`NotificationsTab`).
- **Validação**: UI focada.
