# Feature Specification: Canal de aprovação plugável

**Feature Branch**: `feat/set40-canal-aprovacao-plugavel`
**Created**: 2026-07-14
**Status**: Implemented
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S39 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`approvals.channel` referencia um canal de `notifications` (App) — destrava
> slack/discord/webhook/desktop. Aprovação por canal não-telegram funciona." (Parte 2 §G)

Hoje a aprovação está atada ao telegram. Esta feature faz `approvals.channel` referenciar um canal
declarado em `notifications` (App), destravando aprovação por slack/discord/webhook/desktop.

## User Scenarios & Testing

### User Story 1 — Aprovar por um canal não-telegram
Como usuário, quero apontar `approvals.channel` para um canal de `notifications` (ex.: slack),
para receber e responder aprovações fora do telegram.

**Fluxo**: define um canal slack em `notifications` (SET-35) → aponta `approvals.channel` para ele
→ o gate de aprovação usa esse canal.

**Aceite**: aprovação por canal não-telegram funciona.

### Edge Cases
- `approvals.channel` apontando para canal inexistente → erro/validação (relaciona SET-03).
- Canal sem credencial (`configured=false`) → feedback antes de tentar enviar.

## Requirements

### Functional Requirements
- **FR-001**: `approvals.channel` (`WorkflowApprovalChannelSchema`) DEVE referenciar um canal de
  `notifications` (App).
- **FR-002**: A aprovação DEVE funcionar por canais slack/discord/webhook/desktop, não só telegram.
- **FR-003**: `approvals.channel` inexistente/sem credencial DEVE ser validado com feedback.

### Key Entities
- **WorkflowApprovalChannelSchema**: passa a referenciar canais de `notifications`.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Aprovação por um canal não-telegram funciona (testes de notify + schema).
- **SC-002**: Canal inexistente é rejeitado com feedback.

## Dependencies & Open Decisions
- **Depende de**: M8 (canais de `notifications` editáveis).
- **Relaciona**: SET-35 (NotificationsTab), SET-03 (`approvals.channel` na Feature).

## Technical Notes (do plano)
- **Arquivos**: `src/core/backlog/schema.ts` (`WorkflowApprovalChannelSchema`), notify.
- **Validação**: testes de notify + schema.
