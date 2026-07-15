# Feature Specification: `tool` = referência a id

**Feature Branch**: `feat/set28-tool-referencia-a-id`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M7 (Registro de tools no App)
**Origem no plano**: S27 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`tool` validado contra os `id` do registro (múltiplos ids p/ mesmo adapter permitidos); fim do
> enum fixo. `tool` inexistente é rejeitado com erro acionável." (Parte 2 §A)

Fecha a virada conceitual do M7: `tool` deixa de ser um enum fixo (claude|codex|opencode) e passa
a ser uma referência a um `id` do registro, permitindo múltiplos ids sobre o mesmo adapter (ex.:
`codex` e `codex-canary`).

## User Scenarios & Testing

### User Story 1 — `tool` referencia um id do registro
Como usuário, quero que `tool` aceite qualquer `id` registrado (inclusive vários sobre o mesmo
adapter), para selecionar variantes de tool sem mudar o enum no código.

**Fluxo**: define `tool: codex-canary` numa feature → a validação confere contra os ids do
registro → aceita se existir, rejeita com erro acionável se não.

**Aceite**: `tool` inexistente é rejeitado com erro acionável.

### Edge Cases
- `tool` legado (claude/codex/opencode) continua válido (são ids default).
- Vários ids sobre o mesmo adapter coexistem.

## Requirements

### Functional Requirements
- **FR-001**: `tool` DEVE ser validado contra os `id` do registro (em `src/core/adapters/index.ts`
  e `src/core/backlog/schema.ts`), não contra enum fixo.
- **FR-002**: Múltiplos ids apontando para o mesmo adapter DEVEM ser permitidos.
- **FR-003**: `tool` inexistente DEVE ser rejeitado com erro acionável.
- **FR-004**: Os ids default (claude/codex/opencode) DEVEM continuar aceitos.

### Key Entities
- **tool (referência)**: id do registro em vez de enum.

## Success Criteria

### Measurable Outcomes
- **SC-001**: `tool` com id registrado é aceito; id inexistente é rejeitado (testes de schema/adapters).
- **SC-002**: Dois ids sobre o mesmo adapter coexistem sem conflito.

## Dependencies & Open Decisions
- **Depende de**: SET-26.

## Technical Notes (do plano)
- **Arquivos**: `src/core/adapters/index.ts`, `src/core/backlog/schema.ts`.
- **Validação**: testes de schema/adapters.
