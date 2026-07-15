# Feature Specification: Steps — reordenar (desejável)

**Feature Branch**: `feat/set06-steps-reordenar`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M1 (Restaurar edição de Feature)
**Origem no plano**: S06 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Setas/drag alterando a ordem de `stages` (ordem = ordem de execução); reordenar persiste e o
> runner respeita a nova ordem." (item desejável do M1)

Como a ordem de `workflow.stages` é a ordem de execução, permitir reordenar os steps pela UI dá
controle direto sobre o fluxo. Item marcado como desejável — entra se o custo for baixo depois de
SET-04/SET-05.

## User Scenarios & Testing

### User Story 1 — Reordenar steps do workflow
Como usuário, quero reordenar os steps de uma feature (setas ou drag), para mudar a ordem de
execução sem recriar o workflow.

**Fluxo**: arrasta (ou usa setas) o step para nova posição → `workflow.stages` é reordenado →
salva → o runner executa na nova ordem.

**Aceite**: reordenar persiste e o runner respeita a nova ordem.

### Edge Cases
- Reordenar não pode duplicar nem perder step.
- `stepGuidance` e `alwaysIsolatedStages` seguem os mesmos steps (só a ordem muda).
- Reordenar durante run ativa aplica-se à próxima execução.

## Requirements

### Functional Requirements
- **FR-001**: A UI DEVE permitir reordenar `workflow.stages` via setas e/ou drag-and-drop.
- **FR-002**: A nova ordem DEVE persistir via `onSaveConfig({ workflow: { stages } })`.
- **FR-003**: O runner DEVE respeitar a nova ordem na próxima execução.
- **FR-004**: A reordenação NÃO DEVE alterar `stepGuidance` nem `alwaysIsolatedStages` além da ordem.

### Key Entities
- **workflow.stages**: sequência ordenada; a posição é semanticamente a ordem de execução.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Reordenar dois steps e salvar produz a nova ordem em `stages` (teste de UI/estado).
- **SC-002**: Nenhum step é perdido ou duplicado após reordenar.

## Dependencies & Open Decisions
- **Depende de**: SET-04.
- **Prioridade**: desejável — pode ser adiado sem bloquear a validação do M1.

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/FeatureConfigDetail.tsx`.
- **Validação**: UI focada.
