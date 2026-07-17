# Feature Specification: schema `tools[]` no App

**Feature Branch**: `feat/set26-schema-tools-no-app`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M7 (Registro de tools no App)
**Origem no plano**: S25 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Bloco `tools` no `ConfigSchema` (id, adapter, command, baseArgs, env, versionCheck,
> capabilities, thinkingBudget, minTimeoutMs) com defaults para claude/codex/opencode. Config sem
> `tools` gera o registro default; parse valida." (Parte 2 §A)

Introduz um registro de tools no App: cada entrada é um `id` que aponta para um adapter e carrega
os parâmetros de invocação (command, baseArgs, env, versionCheck) e de comportamento
(capabilities, thinkingBudget, minTimeoutMs). É a base para `tool` virar referência (SET-28) e o
spawn resolver do registro (SET-27).

## User Scenarios & Testing

### User Story 1 — Registro default sem configurar nada
Como usuário existente, quero que um config sem `tools` continue funcionando gerando o registro
default (claude/codex/opencode), para não quebrar setups atuais.

**Fluxo**: carrega um config sem `tools` → o `ConfigSchema` injeta o registro default → o produto
opera como antes.

**Aceite**: config sem `tools` gera o registro default; parse valida.

### Edge Cases
- Entrada de tool malformada → erro de parse acionável.
- IDs duplicados no registro → rejeitados.
- Múltiplos ids apontando para o mesmo adapter são permitidos (habilita SET-28).

## Requirements

### Functional Requirements
- **FR-001**: O `ConfigSchema` DEVE ganhar um bloco `tools` com entradas `{ id, adapter, command,
  baseArgs, env, versionCheck, capabilities, thinkingBudget, minTimeoutMs }`.
- **FR-002**: DEVE haver defaults para `claude`, `codex` e `opencode`.
- **FR-003**: Config sem `tools` DEVE gerar o registro default.
- **FR-004**: O parse DEVE validar as entradas (formato, ids únicos).

### Key Entities
- **Tool Registry entry**: `id` + adapter + parâmetros de invocação e comportamento.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Config sem `tools` produz o registro default (`tests/config/index.test.ts`).
- **SC-002**: Entrada malformada falha no parse com erro acionável.

## Dependencies & Open Decisions
- **Depende de**: M6 (capabilities/thinking já modelados).
- **Habilita**: SET-27, SET-28, SET-29, SET-30.

## Technical Notes (do plano)
- **Arquivos**: `src/config/index.ts`.
- **Validação**: `rtk npx vitest run tests/config/index.test.ts`.
