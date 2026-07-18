# Feature Specification: Coletor de ambiente no backend/state

**Feature Branch**: `feat/set12-coletor-ambiente-state`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M3 ("Resolved sources" enriquecido)
**Origem no plano**: S11 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Estender `ResolvedConfigSources` (ou novo `EnvironmentInfo`) com `databasePath`,
> `databaseSource` (`default|override`), `dbWritable`, `dataDir`, `configDir`, `configWritable`,
> `repoPath`, `repoId`, `version`; preencher em `buildMsqWebState`."

O diagnóstico "resolved sources" (design §3.13) precisa de dados reais de ambiente para a UI
mostrar de onde vem cada coisa. Esta feature coleta esses dados no backend/state — sem UI ainda
(a UI é SET-13). Read-only.

## User Scenarios & Testing

### User Story 1 — State carrega o ambiente resolvido
Como a UI de diagnóstico, quero que o state exponha caminho do banco, se é override, se é
gravável, data dir, config dir, repo/repoId e versão, para renderizar sem recalcular no cliente.

**Fluxo**: `buildMsqWebState` coleta os campos de `src/config` e do repo → popula
`EnvironmentInfo`/`ResolvedConfigSources` → o `state:full` carrega os valores.

**Aceite**: o state carrega os campos corretos usando `DB_PATH`/`DEFAULT_DB_PATH`/`MSQ_DB_PATH`,
`DATA_DIR`, dir de `CONFIG_PATH`, `resolveRepo()`, `package.json` e writability via
`assertWritableDbPath`.

### Edge Cases
- `MSQ_DB_PATH` setado → `databaseSource = override`; ausente → `default`.
- Banco/pasta não gravável → `dbWritable`/`configWritable = false` sem lançar erro (só diagnóstico).
- Repo não resolvível → campos de repo degradam sem quebrar o state.

## Requirements

### Functional Requirements
- **FR-001**: O state DEVE expor `databasePath`, `databaseSource` (`default|override`),
  `dbWritable`, `dataDir`, `configDir`, `configWritable`, `repoPath`, `repoId` e `version`.
- **FR-002**: `databaseSource` DEVE refletir a presença de `MSQ_DB_PATH` (override) vs. o default.
- **FR-003**: `dbWritable`/`configWritable` DEVEM ser detectados sem lançar (probe de writability).
- **FR-004**: Os campos DEVEM ser preenchidos em `buildMsqWebState`, a partir de `src/config`,
  `resolveRepo()` e `package.json`.
- **FR-005**: A coleta é read-only — não escreve nem no DB nem no config.

### Key Entities
- **EnvironmentInfo / ResolvedConfigSources**: estrutura de diagnóstico exposta no state.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Unit do coletor valida paths, detecção de override e writability.
- **SC-002**: Com `MSQ_DB_PATH` setado, `databaseSource = override`; sem ele, `default`.
- **SC-003**: Banco read-only resulta em `dbWritable = false` sem exceção.

## Dependencies & Open Decisions
- **Depende de**: —.
- **Habilita**: SET-13 (render).
- **Decisão aberta**: estender `ResolvedConfigSources` ou criar `EnvironmentInfo` novo.

## Technical Notes (do plano)
- **Arquivos**: `src/config/index.ts`, `src/ui/catalog.ts`, `src/web/state.ts`, `src/web/types.ts`.
- **Validação**: unit do coletor (paths, detecção de override, writable).
