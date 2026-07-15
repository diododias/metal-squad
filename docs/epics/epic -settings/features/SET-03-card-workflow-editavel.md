# Feature Specification: Card "Workflow" editável

**Feature Branch**: `feat/set03-card-workflow-editavel`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M1 (Restaurar edição de Feature)
**Origem no plano**: S03 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`mode` (single/staged), `syncTasksToBacklog`, `approvals.channel`, `approvals.autoAdvance`
> editáveis no `FeatureConfigDetail.tsx`; patch de `workflow` valida contra `WorkflowSchema`."

Complementa SET-02: além dos parâmetros de execução, o card "Workflow" da feature volta a ser
editável, cobrindo o modo de execução, a sincronização de tasks e a política de aprovação. Toda
escrita precisa validar contra o `WorkflowSchema` existente, sem duplicar regra na UI.

## User Scenarios & Testing

### User Story 1 — Ajustar o workflow de uma feature
Como usuário, quero editar `mode`, `syncTasksToBacklog` e a política de `approvals` de uma
feature, para adequar o fluxo dela sem mexer no YAML.

**Fluxo**: abre o card "Workflow" → muda `mode` para `staged` e define `approvals.channel` →
salva → o patch de `workflow` é validado contra `WorkflowSchema` → persiste no catálogo.

**Aceite**: o patch de `workflow` persiste e valida contra `WorkflowSchema`; entrada inválida é
rejeitada com mensagem acionável, sem gravar.

### Edge Cases
- `approvals.channel` apontando para um canal inexistente (relaciona SET-40) deve avisar.
- `approvals.autoAdvance` será unificado em M9 (SET-38) — manter o campo, marcar como legado.
- Trocar `mode` single↔staged não pode corromper `stages` já definidas.

## Requirements

### Functional Requirements
- **FR-001**: O card "Workflow" DEVE editar `mode` (single/staged), `syncTasksToBacklog`,
  `approvals.channel` e `approvals.autoAdvance`.
- **FR-002**: O patch de `workflow` DEVE ser validado contra o `WorkflowSchema` existente, sem
  reimplementar a validação na UI.
- **FR-003**: Persistência via `updateCatalogFeature` com merge parcial (não apaga campos não tocados).
- **FR-004**: Entrada inválida (falha no schema) NÃO DEVE gravar e DEVE exibir erro acionável.
- **FR-005**: A UI DEVE reutilizar os primitivos de SET-01.

### Key Entities
- **WorkflowSchema**: fonte de validação (inclui `superRefine`).
- **Card Workflow**: seção do `FeatureConfigDetail` que edita a política de workflow.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Alterar `mode` e salvar persiste e passa pelo `WorkflowSchema` (teste de patch).
- **SC-002**: Um patch inválido é rejeitado sem escrita no DB.
- **SC-003**: Campos não tocados do `workflow` permanecem inalterados após o save.

## Dependencies & Open Decisions
- **Depende de**: SET-01.
- **Relaciona**: SET-38 (unificação de `autoAdvance`), SET-40 (canal de aprovação plugável).

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/FeatureConfigDetail.tsx`.
- **Validação**: UI focada + teste de patch de `workflow`.
