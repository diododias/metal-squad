# Feature Specification: Docs/README alinhados ao schema

**Feature Branch**: `docs/set43-docs-readme-alinhados`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S42 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Corrigir `budget.*` inexistentes, `validate → review` (não `reviewr`), documentar os 3 níveis e
> o registro de tools. README coerente com o schema atual." (Parte 2 §J)

Depois do refactor (SET-37..SET-42), os docs precisam refletir o schema real: corrigir referências
a `budget.*` inexistentes, o typo `reviewr`, e documentar os três níveis (App/Projeto/Feature) e o
registro de tools.

## User Scenarios & Testing

### User Story 1 — Docs batem com o schema atual
Como usuário lendo o README, quero que os exemplos e nomes de campo correspondam ao schema real,
para não configurar com base em campos inexistentes.

**Fluxo**: revisa `README.md` e `docs/features`/`docs/hotfixes` → corrige `budget.*` inexistentes,
`validate → review`, documenta os 3 níveis e o registro de tools.

**Aceite**: README coerente com o schema atual.

### Edge Cases
- Referências cruzadas em `docs/features`/`docs/hotfixes` também corrigidas.
- Sem instruções contraditórias entre `.claude` e `.agents`.

## Requirements

### Functional Requirements
- **FR-001**: Referências a `budget.*` inexistentes DEVEM ser corrigidas.
- **FR-002**: O typo `validate → review` (não `reviewr`) DEVE ser corrigido.
- **FR-003**: Os três níveis (App/Projeto/Feature) e o registro de tools DEVEM ser documentados.
- **FR-004**: `README.md` DEVE ficar coerente com o schema atual.

### Key Entities
- **README.md / docs/**: documentação alinhada ao schema pós-refactor.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Nenhuma referência a campo inexistente permanece (revisão de referências).
- **SC-002**: Os três níveis e o registro de tools estão documentados.

## Dependencies & Open Decisions
- **Depende de**: SET-37–SET-42.
- **Nota**: só docs — sem obrigação de suite completa.

## Technical Notes (do plano)
- **Arquivos**: `README.md`, `docs/features/`, `docs/hotfixes/`.
- **Validação**: revisão de referências (sem obrigação de suite completa — só docs).
