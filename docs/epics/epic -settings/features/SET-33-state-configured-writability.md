# Feature Specification: state — `configured` + `writability`

**Feature Branch**: `feat/set33-state-configured-writability`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M8 (App editável + segredos write-only)
**Origem no plano**: S32 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`WebRuntimeConfig` ganha `configured` por canal (sem valor); `writability { dbWritable,
> configWritable }`; invalidar `runtimeConfigCache` pós-escrita." (design §3.3–3.6)

Para a UI saber o que pode editar e o que já tem credencial, o state expõe `configured` por canal
(sem o valor) e `writability` (db/config). Escritas invalidam o cache de runtime config.

## User Scenarios & Testing

### User Story 1 — UI sabe writability e o que está configurado
Como UI de settings, quero saber quais canais têm credencial (`configured`) e o que é gravável
(`writability`), para habilitar/desabilitar controles sem ver valores de segredo.

**Fluxo**: o state expõe `configured` por canal e `writability { dbWritable, configWritable }` →
após escrita, `runtimeConfigCache` é invalidado → o próximo state reflete.

**Aceite**: UI sabe o que é gravável e quais canais têm credencial, sem ver o valor.

### Edge Cases
- Cache não invalidado levaria a writability obsoleta — invalidar pós-escrita.
- Canal sem credencial → `configured=false`, nunca o valor.

## Requirements

### Functional Requirements
- **FR-001**: `WebRuntimeConfig` DEVE ganhar `configured` por canal (sem valor).
- **FR-002**: O state DEVE expor `writability { dbWritable, configWritable }`.
- **FR-003**: Escritas DEVEM invalidar `runtimeConfigCache`.
- **FR-004**: Nenhum valor de segredo DEVE cruzar o state — só `configured`.

### Key Entities
- **WebRuntimeConfig**: config de runtime exposta ao cliente, agora com `configured`/`writability`.

## Success Criteria

### Measurable Outcomes
- **SC-001**: `configured` e `writability` aparecem no state, sem valores de segredo (unit do state).
- **SC-002**: Após escrita, o cache é invalidado e o novo estado aparece.

## Dependencies & Open Decisions
- **Depende de**: SET-31.
- **Relaciona**: SET-12/SET-13 (writability também no diagnóstico).

## Technical Notes (do plano)
- **Arquivos**: `src/web/state.ts`, `src/web/types.ts`.
- **Validação**: unit do state.
