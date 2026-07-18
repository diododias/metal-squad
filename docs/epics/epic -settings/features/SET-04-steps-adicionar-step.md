# Feature Specification: Steps — adicionar step + skill guia

**Feature Branch**: `feat/set04-steps-adicionar-step`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M1 (Restaurar edição de Feature)
**Origem no plano**: S04 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Input nome + botão → push em `workflow.stages`; skill guia entra em
> `stepGuidance[novoStep].skills`. Novo step aparece na sequência e executa como genérico."

Restaura a capacidade de compor o workflow de uma feature adicionando um step novo pela UI. O
step entra em `workflow.stages` e, opcionalmente, uma skill guia é associada em
`stepGuidance[novoStep].skills`, para que o step execute com orientação e não como caixa-preta.

## User Scenarios & Testing

### User Story 1 — Adicionar um step ao workflow da feature
Como usuário, quero adicionar um step nomeado ao workflow de uma feature e opcionalmente associar
uma skill guia, para estender o fluxo sem editar o YAML.

**Fluxo**: digita o nome do step → clica "adicionar" → o step é inserido em `workflow.stages` e,
se informada, a skill vai para `stepGuidance[step].skills` → salva via `onSaveConfig({ workflow })`.

**Aceite**: o novo step aparece na sequência e executa como genérico; o save persiste `stages` e
`stepGuidance` juntos.

### Edge Cases
- Nome de step duplicado deve ser rejeitado (stages são identificadores).
- Step sem skill guia executa como genérico (sem `stepGuidance` obrigatório).
- Nome vazio/whitespace é bloqueado.

## Requirements

### Functional Requirements
- **FR-001**: A UI DEVE permitir adicionar um step nomeado a `workflow.stages` via input + botão.
- **FR-002**: Uma skill guia opcional DEVE ser gravada em `stepGuidance[novoStep].skills`.
- **FR-003**: O save DEVE persistir `stages` e `stepGuidance` na mesma escrita
  (`onSaveConfig({ workflow: { stages, stepGuidance } })`).
- **FR-004**: Nome duplicado ou vazio DEVE ser rejeitado com feedback.
- **FR-005**: Um step sem skill guia DEVE executar como genérico, sem quebrar o prompt builder.

### Key Entities
- **workflow.stages**: sequência ordenada de steps (ordem = execução).
- **stepGuidance[step]**: orientação/skills por step.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Adicionar um step e salvar persiste o step em `stages` (teste de load/prompt).
- **SC-002**: O novo step compõe o prompt sem erro quando sem skill guia.
- **SC-003**: Nome duplicado não é aceito.

## Dependencies & Open Decisions
- **Depende de**: SET-01.
- **Habilita**: SET-05 (remoção com limpeza), SET-06 (reordenação).

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/FeatureConfigDetail.tsx`.
- **Validação**: UI focada + `rtk npx vitest run tests/backlog/load-prompt.test.ts`.
