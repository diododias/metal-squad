# Feature Specification: Defaults no Projeto; YAML como asset

**Feature Branch**: `feat/set37-defaults-no-projeto-yaml-asset`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S36 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Remover bloco `defaults` do `backlog.yaml`; `.msq/config.yaml` deixa de ser verdade (no máximo
> export/import); defaults só no Projeto (DB). `backlog load` carrega só `epics`/`features`;
> resolução de defaults vem do DB." (Parte 2 §C/§D)

Consolida a fonte de verdade dos defaults: depois de M4 tornar os defaults editáveis no DB, o
bloco `defaults` sai do `backlog.yaml` e o `.msq/config.yaml` deixa de ser fonte de verdade
(vira, no máximo, export/import). O `backlog load` passa a carregar só `epics`/`features`.

## User Scenarios & Testing

### User Story 1 — Defaults só no Projeto (DB)
Como usuário, quero que os defaults venham do Projeto (DB) e o `backlog.yaml` carregue só
epics/features, para ter uma fonte única de defaults sem duplicação no YAML.

**Fluxo**: remove o bloco `defaults` do YAML → `msq backlog load` carrega só epics/features → a
resolução de defaults vem do DB (M4).

**Aceite**: `backlog load` carrega só `epics`/`features`; resolução de defaults vem do DB.

### Edge Cases
- Backlog legado com bloco `defaults` → migração/ignorar com aviso, sem quebrar o load.
- `.msq/config.yaml` só é aceito como export/import, não como fonte de verdade.

## Requirements

### Functional Requirements
- **FR-001**: O bloco `defaults` DEVE ser removido do `backlog.yaml` como fonte de verdade.
- **FR-002**: `.msq/config.yaml` NÃO DEVE mais ser fonte de verdade (no máximo export/import).
- **FR-003**: `msq backlog load` DEVE carregar apenas `epics`/`features`.
- **FR-004**: A resolução de defaults DEVE vir do DB (Projeto).

### Key Entities
- **Projeto (DB)**: fonte única de defaults.
- **backlog.yaml**: asset de import de epics/features.

## Success Criteria

### Measurable Outcomes
- **SC-001**: `backlog load` carrega só epics/features; defaults vêm do DB
  (`tests/backlog/load-prompt.test.ts` + `tests/config/index.test.ts`).
- **SC-002**: Backlog legado com `defaults` carrega sem quebrar (migração/aviso).

## Dependencies & Open Decisions
- **Depende de**: M4 (defaults editáveis no DB).
- **Relaciona**: SET-41 (herança única), SET-43 (docs).

## Technical Notes (do plano)
- **Arquivos**: `src/core/backlog/schema.ts`, `src/ui/catalog.ts`, `src/config/index.ts`.
- **Validação**: `rtk npx vitest run tests/backlog/load-prompt.test.ts tests/config/index.test.ts`.
