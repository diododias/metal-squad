# Feature Specification: adapter codex — effort nativo, thinking=false

**Feature Branch**: `feat/set23-adapter-codex-effort-nativo`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M6 (`model`/`effort`/`thinking` reais por adapter)
**Origem no plano**: S22 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Manter `-c model_reasoning_effort`; `capabilities.thinking=false`; extrair piso de timeout do
> número mágico (prep §I/M7). Effort nativo preservado; thinking ignorado-com-aviso." (Parte 2 §B)

O codex já tem effort nativo (`-c model_reasoning_effort`). Aqui o objetivo é declarar
`capabilities.thinking=false` (codex não suporta thinking) e preparar a extração do piso de
timeout mágico para config (consumido por M7/SET-29 e M9/SET-42).

## User Scenarios & Testing

### User Story 1 — codex mantém effort, ignora thinking com aviso
Como usuário do codex, quero que o effort nativo seja preservado e que `thinking` seja ignorado
com um aviso claro, para não ter falsa impressão de que thinking está ativo.

**Fluxo**: feature com `effort=high`, `thinking=on` no codex → o spawn usa
`-c model_reasoning_effort=high` e emite aviso de que thinking não é suportado.

**Aceite**: effort nativo preservado; thinking ignorado-com-aviso.

### Edge Cases
- `thinking=on` com `capabilities.thinking=false` → aviso, sem efeito.
- Piso de timeout extraído para constante nomeada/config, sem mudar o valor efetivo agora.

## Requirements

### Functional Requirements
- **FR-001**: O codex DEVE manter `-c model_reasoning_effort` (effort nativo).
- **FR-002**: `capabilities.thinking` DEVE ser `false` no codex.
- **FR-003**: `thinking` solicitado DEVE ser ignorado com aviso visível.
- **FR-004**: O piso de timeout mágico DEVE ser extraído para um ponto nomeado (prep p/ SET-29/SET-42).

### Key Entities
- **capabilities**: contrato de suporte por adapter (migra p/ registro em SET-29).

## Success Criteria

### Measurable Outcomes
- **SC-001**: Effort nativo preservado no spawn do codex (`tests/adapters/codex.test.ts`).
- **SC-002**: `thinking=on` emite aviso e não altera a invocação.

## Dependencies & Open Decisions
- **Depende de**: SET-21.
- **Relaciona**: SET-29 / SET-42 (piso de timeout e capabilities migram p/ registro/config).

## Technical Notes (do plano)
- **Arquivos**: `src/core/adapters/codex.ts`.
- **Validação**: `rtk npx vitest run tests/adapters/codex.test.ts`.
