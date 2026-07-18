# Feature Specification: adapter opencode — limpar hardcodes

**Feature Branch**: `feat/set24-adapter-opencode-hardcodes`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M6 (`model`/`effort`/`thinking` reais por adapter)
**Origem no plano**: S23 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Remover `--thinking` hardcoded e `_EFFORT_HINT` (morto); `capabilities = { model, effort:false,
> thinking:false }`; effort/thinking ignorados-com-aviso." (Parte 2 §B)

O adapter opencode carrega um `--thinking` hardcoded e um `_EFFORT_HINT` morto. Com o modelo de
capabilities, o opencode declara suporte só a `model` e ignora effort/thinking com aviso.

## User Scenarios & Testing

### User Story 1 — opencode sem flags hardcoded
Como usuário do opencode, quero que a invocação não force `--thinking` e que effort/thinking sejam
ignorados com aviso, para a chamada refletir o que a tool realmente suporta.

**Fluxo**: feature no opencode com `effort`/`thinking` → o spawn não envia `--thinking`; emite
aviso de parâmetros não suportados.

**Aceite**: invocação sem `--thinking`; avisos emitidos.

### Edge Cases
- `_EFFORT_HINT` morto removido sem efeito colateral.
- `model` continua suportado normalmente.

## Requirements

### Functional Requirements
- **FR-001**: DEVE remover o `--thinking` hardcoded e o `_EFFORT_HINT` morto.
- **FR-002**: `capabilities` DEVE ser `{ model, effort:false, thinking:false }`.
- **FR-003**: `effort`/`thinking` solicitados DEVEM ser ignorados com aviso visível.

### Key Entities
- **capabilities**: contrato de suporte do opencode.

## Success Criteria

### Measurable Outcomes
- **SC-001**: A invocação do opencode não contém `--thinking` (`tests/adapters/misc.test.ts`).
- **SC-002**: `effort`/`thinking` solicitados emitem aviso.

## Dependencies & Open Decisions
- **Depende de**: SET-21.

## Technical Notes (do plano)
- **Arquivos**: `src/core/adapters/opencode.ts`.
- **Validação**: `rtk npx vitest run tests/adapters/misc.test.ts`.
