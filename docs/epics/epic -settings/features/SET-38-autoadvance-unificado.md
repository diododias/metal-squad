# Feature Specification: `autoAdvance` unificado

**Feature Branch**: `feat/set38-autoadvance-unificado`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S37 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Um único `autoAdvance` (default Projeto, override Feature); remover `workflow.autoAdvanceStages`
> global e `approvals.autoAdvance` duplicado. Resolução coerente; sem dois nomes." (Parte 2 §E)

Hoje há dois nomes para o mesmo conceito (`workflow.autoAdvanceStages` global e
`approvals.autoAdvance`). Esta feature unifica em um único `autoAdvance`, com default no Projeto e
override por Feature.

## User Scenarios & Testing

### User Story 1 — Um único autoAdvance
Como usuário, quero um único `autoAdvance` (default no Projeto, override na Feature), para não
lidar com dois campos que fazem a mesma coisa.

**Fluxo**: define `autoAdvance` no Projeto → a Feature herda ou sobrescreve → o runner resolve por
esse único campo.

**Aceite**: resolução coerente; sem dois nomes.

### Edge Cases
- Config legado com `autoAdvanceStages`/`approvals.autoAdvance` → migrado para `autoAdvance`.
- Override de Feature prevalece sobre o default de Projeto.

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir um único `autoAdvance` (default Projeto, override Feature).
- **FR-002**: `workflow.autoAdvanceStages` global e `approvals.autoAdvance` duplicado DEVEM ser removidos.
- **FR-003**: A resolução DEVE ser coerente (um único caminho), com override de Feature prevalecendo.
- **FR-004**: Config legado DEVE ser migrado para o campo unificado.

### Key Entities
- **autoAdvance**: campo unificado de avanço automático.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Runner resolve `autoAdvance` por um único campo (`tests/runner/execute.test.ts`).
- **SC-002**: Config legado migra sem duplicar o conceito.

## Dependencies & Open Decisions
- **Depende de**: M4.
- **Relaciona**: H20/H21 (histórico de bugs de autoAdvance no epico 1) — consolidar comportamento.

## Technical Notes (do plano)
- **Arquivos**: schema, runner, UI.
- **Validação**: `rtk npx vitest run tests/runner/execute.test.ts`.
