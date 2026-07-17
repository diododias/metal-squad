# Feature Specification: schema — campo `thinking`

**Feature Branch**: `feat/set21-schema-campo-thinking`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M6 (`model`/`effort`/`thinking` reais por adapter)
**Origem no plano**: S20 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`thinking` (`on|off`) em Projeto/Feature; `model`/`effort` independentes. Schema aceita os três
> campos separados; defaults coerentes." (Parte 2 §B)

Ponto de partida do M6: hoje `model` e `effort` se atropelam em alguns adapters. Esta feature
adiciona `thinking` (`on|off`) e trata `model`/`effort`/`thinking` como três campos independentes
no schema, antes de os adapters passarem a respeitá-los (SET-22..SET-24).

## User Scenarios & Testing

### User Story 1 — Definir os três campos separados
Como usuário, quero definir `model`, `effort` e `thinking` de forma independente em Projeto e
Feature, para controlar cada eixo sem um sobrescrever o outro.

**Fluxo**: define `model=X`, `effort=high`, `thinking=on` numa feature → o schema valida os três
sem descartar nenhum.

**Aceite**: schema aceita os três campos separados; defaults coerentes.

### Edge Cases
- Ausência de `thinking` → default coerente (definir no schema).
- Combinações inválidas por tool são tratadas nos adapters (ignore-with-warning), não no schema.

## Requirements

### Functional Requirements
- **FR-001**: `thinking` (`on|off`) DEVE existir no schema de Projeto e de Feature
  (`src/core/backlog/schema.ts`, `src/config/index.ts`).
- **FR-002**: `model`, `effort` e `thinking` DEVEM ser campos independentes (um não descarta o outro).
- **FR-003**: DEVE haver defaults coerentes para os três.

### Key Entities
- **FeatureSchema / defaults de Projeto**: ganham `thinking` e tratam os três eixos separados.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Schema aceita `model` + `effort` + `thinking` juntos (teste de schema).
- **SC-002**: `rtk npm run typecheck` passa.

## Dependencies & Open Decisions
- **Depende de**: —.
- **Habilita**: SET-22, SET-23, SET-24, SET-25.

## Technical Notes (do plano)
- **Arquivos**: `src/core/backlog/schema.ts`, `src/config/index.ts`.
- **Validação**: `rtk npm run typecheck` + testes de schema.
