# Feature Specification: adapter claude — coexistir model+effort+thinking

**Feature Branch**: `feat/set22-adapter-claude-coexistir`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M6 (`model`/`effort`/`thinking` reais por adapter)
**Origem no plano**: S21 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Remover `EFFORT_MODEL` e o descarte de effort quando `model` setado; `thinking=off →
> MAX_THINKING_TOKENS=0`; `thinking=on → MAX_THINKING_TOKENS = thinkingBudget[effort]`." (Parte 2 §B)

Hoje o adapter claude descarta `effort` quando `model` está setado (via `EFFORT_MODEL`). Com os
três eixos independentes (SET-21), o claude passa a honrar `model`, `effort` e `thinking` juntos,
mapeando `thinking` para `MAX_THINKING_TOKENS`.

## User Scenarios & Testing

### User Story 1 — claude honra os três eixos
Como usuário do adapter claude, quero que `--model` coexista com `effort` e `thinking`, para não
perder o effort só por ter fixado um modelo.

**Fluxo**: feature com `model=X`, `effort=high`, `thinking=on` → o spawn envia `--model X` e
`MAX_THINKING_TOKENS = thinkingBudget[high]`; com `thinking=off`, `MAX_THINKING_TOKENS=0`.

**Aceite**: `--model` coexiste com effort/thinking; env correto no spawn.

### Edge Cases
- `thinking=off` → `MAX_THINKING_TOKENS=0` (sem thinking).
- `thinking=on` sem `effort` explícito → usa `thinkingBudget[default effort]`.
- Remoção de `EFFORT_MODEL` não pode quebrar chamadas legadas sem `model`.

## Requirements

### Functional Requirements
- **FR-001**: DEVE remover `EFFORT_MODEL` e o descarte de `effort` quando `model` está setado.
- **FR-002**: `thinking=off` DEVE resultar em `MAX_THINKING_TOKENS=0`.
- **FR-003**: `thinking=on` DEVE resultar em `MAX_THINKING_TOKENS = thinkingBudget[effort]`.
- **FR-004**: `--model` DEVE coexistir com `effort` e `thinking` no spawn.

### Key Entities
- **thinkingBudget**: mapa effort→orçamento de thinking tokens (migra p/ registro em SET-29).

## Success Criteria

### Measurable Outcomes
- **SC-001**: Spawn com `model`+`effort`+`thinking=on` envia `--model` e `MAX_THINKING_TOKENS` correto
  (`tests/adapters/misc.test.ts` + teste claude).
- **SC-002**: `thinking=off` zera `MAX_THINKING_TOKENS`.

## Dependencies & Open Decisions
- **Depende de**: SET-21.
- **Relaciona**: SET-29 (thinkingBudget migra p/ registro).

## Technical Notes (do plano)
- **Arquivos**: `src/core/adapters/claude.ts`.
- **Validação**: `rtk npx vitest run tests/adapters/misc.test.ts` (+ teste claude).
