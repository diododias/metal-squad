# Feature Specification: state expõe `projectDefaults` editável

**Feature Branch**: `feat/set16-state-project-defaults`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M4 (Projeto editável — defaults no DB)
**Origem no plano**: S15 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Expor `projectDefaults` (defaults crus editáveis) separado de `resolvedDefaults` (merge
> read-only); invalidar caches pós-escrita."

Para editar defaults na UI, o state precisa distinguir os defaults **crus** do projeto (o que se
edita) do resultado **resolvido** (merge read-only usado na execução). Editar deve refletir no
próximo `state:full` sem restart, o que exige invalidar caches após escrita.

## User Scenarios & Testing

### User Story 1 — Editar defaults crus e ver refletir
Como UI de edição, quero um `projectDefaults` editável separado do `resolvedDefaults`, para
mostrar e editar os valores crus sem confundir com o merge final.

**Fluxo**: state expõe `projectDefaults` (cru) e `resolvedDefaults` (merge) → após uma escrita
(SET-15), os caches são invalidados → o próximo `state:full` reflete o novo valor.

**Aceite**: editar reflete no próximo `state:full` sem restart.

### Edge Cases
- Cache não invalidado levaria a valor obsoleto — deve invalidar pós-escrita.
- `projectDefaults` ausente (projeto novo) → default coerente.

## Requirements

### Functional Requirements
- **FR-001**: O state DEVE expor `projectDefaults` (defaults crus editáveis) separado de
  `resolvedDefaults` (merge read-only).
- **FR-002**: Após escrita de defaults, os caches relevantes DEVEM ser invalidados.
- **FR-003**: O próximo `state:full` DEVE refletir a edição sem restart.

### Key Entities
- **projectDefaults**: defaults crus, editáveis.
- **resolvedDefaults**: resultado do merge, read-only (usado na resolução de features).

## Success Criteria

### Measurable Outcomes
- **SC-001**: `projectDefaults` e `resolvedDefaults` aparecem separados no state (unit do state).
- **SC-002**: Após escrita, o cache é invalidado e o novo valor aparece no `state:full`.

## Dependencies & Open Decisions
- **Depende de**: SET-14.
- **Relaciona**: SET-41 (herança única Feature→Projeto) consome `resolvedDefaults`.

## Technical Notes (do plano)
- **Arquivos**: `src/web/state.ts`, `src/web/types.ts`, `src/ui/catalog.ts`.
- **Validação**: unit do state; checar invalidação de cache.
