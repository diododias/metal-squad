# Feature Specification: App enxuto + migração

**Feature Branch**: `feat/set39-app-enxuto-migracao`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S38 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Remover do App `stageSkills` (→Projeto), `theme` (TUI aposentada), `telegramChatId` avulso
> (→`notifications.channels`), `workflow` global; migrar configs legadas. Config antigo é
> normalizado sem quebrar; campos removidos migram." (Parte 2 §F)

Enxuga o App movendo cada config para o seu dono correto e migrando configs legadas via
`normalizeLegacyConfig`: `stageSkills` vai para Projeto, `theme` some (TUI aposentada),
`telegramChatId` avulso vira `notifications.channels`, e o `workflow` global sai.

## User Scenarios & Testing

### User Story 1 — App enxuto sem quebrar config antigo
Como usuário com config legado, quero que o App remova os campos que mudaram de dono e migre os
valores automaticamente, para atualizar sem editar o config à mão.

**Fluxo**: carrega um `config.json` legado → `normalizeLegacyConfig` migra `stageSkills`→Projeto,
`telegramChatId`→`notifications.channels`, remove `theme` e `workflow` global → o App opera enxuto.

**Aceite**: config antigo é normalizado sem quebrar; campos removidos migram.

### Edge Cases
- `theme` legado é descartado (TUI aposentada) sem erro.
- `telegramChatId` avulso vira um canal em `notifications.channels`.
- `stageSkills` do App migra para o Projeto (DB).

## Requirements

### Functional Requirements
- **FR-001**: DEVEM ser removidos do App: `stageSkills` (→Projeto), `theme`, `telegramChatId`
  avulso (→`notifications.channels`) e `workflow` global.
- **FR-002**: `normalizeLegacyConfig` DEVE migrar os campos legados para seus novos donos.
- **FR-003**: Config antigo DEVE ser normalizado sem quebrar.

### Key Entities
- **normalizeLegacyConfig**: migração de config legado.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Config legado é normalizado, com campos removidos migrados (`tests/config/index.test.ts`).
- **SC-002**: `theme` legado é descartado sem erro.

## Dependencies & Open Decisions
- **Depende de**: M8.
- **Relaciona**: SET-37 (`stageSkills` no Projeto), SET-35 (`notifications.channels`).

## Technical Notes (do plano)
- **Arquivos**: `src/config/index.ts` (`normalizeLegacyConfig`).
- **Validação**: `rtk npx vitest run tests/config/index.test.ts`.
