# Feature Specification: Steps — remover step com limpeza

**Feature Branch**: `feat/set05-steps-remover-step`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M1 (Restaurar edição de Feature)
**Origem no plano**: S05 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Botão 'x' por step → remove de `stages` **e** limpa `stepGuidance[step]` e refs em
> `alwaysIsolatedStages`. Save não é rejeitado pelo `superRefine` (sem stepGuidance/alwaysIsolated órfão)."

Remover um step não pode deixar referências órfãs. O `WorkflowSchema.superRefine` rejeita
`stepGuidance` ou `alwaysIsolatedStages` apontando para um step que não existe mais. A remoção
precisa limpar essas referências na mesma operação.

## User Scenarios & Testing

### User Story 1 — Remover um step sem deixar refs órfãs
Como usuário, quero remover um step do workflow clicando "x", e que o sistema limpe
automaticamente a orientação e as flags ligadas àquele step, para o save não ser barrado.

**Fluxo**: clica "x" no step → o step sai de `stages` → `stepGuidance[step]` e a referência em
`alwaysIsolatedStages` são removidas → salva sem erro do `superRefine`.

**Aceite**: o save não é rejeitado pelo `superRefine`; não sobra `stepGuidance` nem
`alwaysIsolatedStages` órfão.

### Edge Cases
- Remover o último step deve ser barrado (stages não pode ficar vazio).
- Remover um step atualmente em execução (relaciona FR-011 do plano/M-editar) — mudança se aplica
  à próxima execução, não corrompe a run corrente.
- Step sem `stepGuidance`/`alwaysIsolated` associado remove-se sem efeito colateral.

## Requirements

### Functional Requirements
- **FR-001**: Cada step DEVE ter um botão "x" que o remove de `workflow.stages`.
- **FR-002**: A remoção DEVE limpar `stepGuidance[step]` e as referências ao step em
  `alwaysIsolatedStages` na mesma operação.
- **FR-003**: O save resultante NÃO DEVE ser rejeitado pelo `WorkflowSchema.superRefine`.
- **FR-004**: Remover o único step restante DEVE ser bloqueado (stages não vazio).
- **FR-005**: A limpeza DEVE reutilizar/instituir um util em `src/core/backlog/` se a lógica for
  compartilhável, evitando duplicação na UI.

### Key Entities
- **alwaysIsolatedStages**: lista de steps que rodam isolados; não pode referenciar step removido.
- **stepGuidance**: mapa step→orientação; entrada órfã quebra o `superRefine`.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Remover um step com `stepGuidance` e flag isolada salva sem erro de schema.
- **SC-002**: Após remoção, `stepGuidance` e `alwaysIsolatedStages` não referenciam o step.
- **SC-003**: `rtk npm run typecheck` passa.

## Dependencies & Open Decisions
- **Depende de**: SET-04.
- **Decisão aberta**: colocar o util de limpeza na UI ou em `src/core/backlog/` (preferir core se reutilizável).

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/FeatureConfigDetail.tsx`, (helper) `src/core/backlog/` se precisar util de limpeza.
- **Validação**: teste cobrindo remoção com limpeza; `rtk npm run typecheck`.
