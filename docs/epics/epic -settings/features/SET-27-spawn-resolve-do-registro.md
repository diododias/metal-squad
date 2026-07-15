# Feature Specification: spawn resolve do registro

**Feature Branch**: `feat/set27-spawn-resolve-do-registro`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M7 (Registro de tools no App)
**Origem no plano**: S26 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Resolver `command`/`baseArgs`/`env`/`versionCheck` do registro em vez do nome fixo. Binário
> custom (ex.: `codex-canary`) é lançado do `command` do registro." (Parte 2 §A)

Com o registro definido (SET-26), o spawn deixa de assumir binários por nome fixo e passa a
resolver `command`, `baseArgs`, `env` e `versionCheck` da entrada de registro correspondente. É o
que permite apontar uma tool para um binário custom.

## User Scenarios & Testing

### User Story 1 — Lançar binário custom via registro
Como usuário, quero registrar uma tool apontando para um binário custom e ver o spawn usar esse
`command`, para testar builds alternativos sem alterar o código do adapter.

**Fluxo**: registra `codex-canary` com `command` custom → seleciona essa tool → o spawn lê
`command`/`baseArgs`/`env`/`versionCheck` do registro e lança o binário custom.

**Aceite**: binário custom (ex.: `codex-canary`) é lançado do `command` do registro.

### Edge Cases
- Tool sem `command` explícito usa o default do adapter.
- `env` do registro é mesclado ao ambiente de spawn sem vazar segredos.
- `versionCheck` do registro é usado no lugar do fixo.

## Requirements

### Functional Requirements
- **FR-001**: O spawn (`src/core/adapters/spawn.ts`) DEVE resolver `command`, `baseArgs`, `env` e
  `versionCheck` da entrada de registro, não de nome fixo.
- **FR-002**: Um `command` custom no registro DEVE ser efetivamente lançado.
- **FR-003**: O helper comum de spawn/heartbeat DEVE ser reaproveitado (sem reinventar processo por adapter).

### Key Entities
- **spawn**: resolve invocação a partir do registro.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Registro com `command` custom lança o binário custom (`tests/adapters/misc.test.ts`).
- **SC-002**: Tool sem `command` usa o default do adapter.

## Dependencies & Open Decisions
- **Depende de**: SET-26.
- **Relaciona**: SET-29 (capabilities/minTimeoutMs do registro).

## Technical Notes (do plano)
- **Arquivos**: `src/core/adapters/spawn.ts`, adapters.
- **Validação**: `rtk npx vitest run tests/adapters/misc.test.ts`.
