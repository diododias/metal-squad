# Feature Specification: capabilities/thinkingBudget/minTimeoutMs migram p/ registro

**Feature Branch**: `feat/set29-capabilities-migram-registro`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M7 (Registro de tools no App)
**Origem no plano**: S28 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Mover das constantes de adapter para o registro (fim dos números mágicos, ex.: piso codex).
> Timeouts/capabilities lidos do registro; comportamento preservado." (Parte 2 §A)

Consolida no registro os valores que hoje vivem como constantes espalhadas nos adapters:
`capabilities`, `thinkingBudget` e `minTimeoutMs` (incluindo o piso de timeout do codex extraído
em SET-23). Comportamento preservado — muda a origem do valor, não o valor.

## User Scenarios & Testing

### User Story 1 — Capabilities e timeouts vêm do registro
Como mantenedor, quero que capabilities, thinkingBudget e minTimeoutMs sejam lidos do registro,
para configurar por tool sem editar constantes no adapter.

**Fluxo**: o adapter/spawn lê `capabilities`/`thinkingBudget`/`minTimeoutMs` da entrada de registro
→ o comportamento observável é idêntico ao anterior, mas os valores são configuráveis.

**Aceite**: timeouts/capabilities lidos do registro; comportamento preservado.

### Edge Cases
- Registro sem um desses campos usa o default do adapter (sem regressão).
- O piso de timeout do codex (SET-23) passa a `minTimeoutMs` do registro.

## Requirements

### Functional Requirements
- **FR-001**: `capabilities`, `thinkingBudget` e `minTimeoutMs` DEVEM migrar das constantes de
  adapter para o registro.
- **FR-002**: Spawn/adapters DEVEM ler esses valores do registro.
- **FR-003**: O comportamento observável DEVE ser preservado (mesmos defaults efetivos).
- **FR-004**: Nenhum número mágico correspondente DEVE permanecer no adapter.

### Key Entities
- **Tool Registry entry**: agora fonte de capabilities/thinkingBudget/minTimeoutMs.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Timeouts e capabilities lidos do registro, com comportamento preservado
  (`tests/adapters/codex.test.ts` + `tests/adapters/misc.test.ts`).
- **SC-002**: Piso de timeout do codex vem de `minTimeoutMs` do registro.

## Dependencies & Open Decisions
- **Depende de**: SET-27, SET-28.
- **Relaciona**: SET-42 (hardcodes → config, no M9).

## Technical Notes (do plano)
- **Arquivos**: adapters, `spawn.ts`.
- **Validação**: `rtk npx vitest run tests/adapters/codex.test.ts tests/adapters/misc.test.ts`.
