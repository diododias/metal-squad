# Feature Specification: Regressão end-to-end dos settings

**Feature Branch**: `test/set44-regressao-e2e-settings`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M9 (Consolidação, limpeza e docs)
**Origem no plano**: S43 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Teste cobrindo App→Projeto→Feature (herança única, thinking, tool via registro, autoAdvance
> unificado). Resolução final bate com o modelo-alvo." (Parte 2)

Fecha o épico com um teste de integração que exercita a resolução final do modelo-alvo: herança
única Feature→Projeto, `thinking` real por adapter, `tool` via registro e `autoAdvance` unificado.

## User Scenarios & Testing

### User Story 1 — Resolução final coerente
Como mantenedor, quero um teste e2e que confirme a resolução App→Projeto→Feature no modelo-alvo,
para travar regressões nos settings.

**Fluxo**: o teste monta App/Projeto/Feature representativos → resolve → verifica herança única,
thinking, tool via registro e autoAdvance unificado.

**Aceite**: resolução final bate com o modelo-alvo.

### Edge Cases
- Feature com e sem override exercitadas.
- Tool via id de registro (incluindo id custom sobre adapter existente).
- `thinking` on/off por adapter conforme capabilities.

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir um teste de integração de resolução cobrindo App→Projeto→Feature.
- **FR-002**: O teste DEVE cobrir herança única, `thinking`, `tool` via registro e `autoAdvance`
  unificado.
- **FR-003**: A resolução final DEVE bater com o modelo-alvo (`metal-squad-novos-settings.md`).

### Key Entities
- **Teste de resolução e2e**: guarda de regressão dos settings.

## Success Criteria

### Measurable Outcomes
- **SC-001**: O teste passa cobrindo os quatro eixos (herança, thinking, registro, autoAdvance)
  (`rtk npm test`).
- **SC-002**: `msq config show --feature <id> --json` mostra resolução final coerente (um dono por
  config, herança única, YAML só import).

## Dependencies & Open Decisions
- **Depende de**: M1–M9 (fecha o épico).

## Technical Notes (do plano)
- **Arquivos**: `tests/` (novo teste de integração de resolução).
- **Validação**: `rtk npm test`.
