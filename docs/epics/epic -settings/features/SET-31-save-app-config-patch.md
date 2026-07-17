# Feature Specification: `saveAppConfigPatch` + writability

**Feature Branch**: `feat/set31-save-app-config-patch`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M8 (App editável + segredos write-only)
**Origem no plano**: S30 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`saveAppConfigPatch(patch)` (loadConfig → merge por seção → `ConfigSchema.parse` → `saveConfig`);
> erro acionável se `config.json` não gravável; helper `configWritable`." (design §3.3–3.6)

Base do "App editável": uma função que aplica um patch parcial ao `config.json`, preservando
campos não tocados, validando contra o schema e gravando — com erro acionável quando o arquivo
não é gravável.

## User Scenarios & Testing

### User Story 1 — Salvar patch parcial do App
Como camada de aplicação, quero `saveAppConfigPatch(patch)` que faça merge por seção sobre o
config atual, valide e grave, para editar o App sem reescrever tudo nem perder campos.

**Fluxo**: `loadConfig()` → merge do patch por seção → `ConfigSchema.parse` → `saveConfig` → se
`config.json` não for gravável, erro acionável antes de escrever.

**Aceite**: patch parcial preserva campos não tocados; arquivo read-only retorna erro claro.

### Edge Cases
- `config.json` read-only → erro acionável, sem escrita parcial.
- Patch inválido → falha no `ConfigSchema.parse`, sem gravar.
- Merge por seção não pode sobrescrever seções não incluídas no patch.

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir `saveAppConfigPatch(patch)` (loadConfig → merge por seção →
  `ConfigSchema.parse` → `saveConfig`) em `src/config/index.ts`.
- **FR-002**: Patch parcial DEVE preservar campos/seções não tocados.
- **FR-003**: `config.json` não gravável DEVE retornar erro acionável, sem escrita.
- **FR-004**: DEVE existir um helper `configWritable`.

### Key Entities
- **saveAppConfigPatch**: escrita parcial e validada do App.
- **configWritable**: probe de writability do `config.json`.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Patch parcial preserva campos não tocados (`tests/config/index.test.ts`).
- **SC-002**: Arquivo read-only retorna erro claro sem escrever.

## Dependencies & Open Decisions
- **Depende de**: —.
- **Habilita**: SET-32, SET-33, SET-34, SET-35, SET-36.

## Technical Notes (do plano)
- **Arquivos**: `src/config/index.ts`.
- **Validação**: `rtk npx vitest run tests/config/index.test.ts`.
