# Feature Specification: `updateCatalogDefaults` (db)

**Feature Branch**: `feat/set14-update-catalog-defaults-db`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M4 (Projeto editável — defaults no DB)
**Origem no plano**: S13 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`updateCatalogDefaults(repoId, patch)` espelhando `updateCatalogFeature` — lê
> `defaults_json`/`budget_json`, merge, valida, grava `updated_at`; guarda `assertWritableDbPath()`."

Base de persistência do "Projeto editável" (design §3.2/§3.5): permitir gravar os defaults do
projeto no DB (`backlog_catalog_meta`), com patch parcial validado, espelhando o contrato já
usado para features.

## User Scenarios & Testing

### User Story 1 — Persistir defaults do projeto
Como camada de aplicação, quero uma função `updateCatalogDefaults(repoId, patch)` que aplique um
patch parcial aos defaults do projeto, valide e grave, para editar defaults sem reescrever tudo.

**Fluxo**: recebe `repoId` + patch → lê `defaults_json`/`budget_json` → faz merge → valida →
grava com `updated_at` atualizado, sob guarda de `assertWritableDbPath()`.

**Aceite**: patch parcial persiste sem apagar campos não tocados; patch inválido lança erro tipado.

### Edge Cases
- Banco read-only → `assertWritableDbPath()` lança erro acionável antes de escrever.
- Patch inválido (falha de schema) → erro tipado, sem escrita.
- `repoId` inexistente → comportamento definido (criar meta ou erro claro).

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir `updateCatalogDefaults(repoId, patch)` em `src/db/backlogCatalog.ts`.
- **FR-002**: A função DEVE ler `defaults_json`/`budget_json`, aplicar merge parcial, validar e
  gravar, atualizando `updated_at`.
- **FR-003**: Patch parcial NÃO DEVE apagar campos não tocados.
- **FR-004**: Patch inválido DEVE lançar erro tipado, sem escrever.
- **FR-005**: A escrita DEVE ser guardada por `assertWritableDbPath()`.

### Key Entities
- **backlog_catalog_meta**: tabela dos defaults/budget do projeto.
- **updateCatalogDefaults**: espelho de `updateCatalogFeature` para o nível de projeto.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Patch parcial persiste sem apagar campos não tocados (teste de repo).
- **SC-002**: Patch inválido lança erro tipado, sem escrita.
- **SC-003**: Banco read-only bloqueia a escrita com erro acionável.

## Dependencies & Open Decisions
- **Depende de**: —.
- **Habilita**: SET-15 (WS action), SET-16 (state), SET-17 (UI).

## Technical Notes (do plano)
- **Arquivos**: `src/db/backlogCatalog.ts`.
- **Validação**: `rtk npx vitest run tests/db/repo.test.ts` + novo teste.
