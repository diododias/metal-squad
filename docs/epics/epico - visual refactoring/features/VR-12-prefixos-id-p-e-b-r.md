# Feature Specification: Prefixos de ID `P/E/B/R` (+ `F` atual) consistentes

**Feature Branch**: `feat/vr12-prefixos-id-p-e-b-r`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M3 (Tema C)
**Depende de**: —

## Objetivo

Padronizar os prefixos de id exibidos por entidade, conforme o `plan.md`:
Project `P…`, Epic `E…`, Work Item/Feature `F…` (atual), Bug `B…`, Repository
`R…`. Baixo custo, alto impacto de percepção de produto acabado.

## Contexto de execução

- O padrão de id curto já existe para Work Item: `toShortFeatureId(featureId)`
  gera `F-XXXXXXXX` (hash FNV determinístico) em `components/data/KanbanCard.tsx:11`,
  usado quando não há `persistedId`. `FeatureIdentity` (`components/data/`)
  renderiza título + id.
- Não há prefixo distinto para Project/Epic/Bug/Repository — hoje aparecem sem
  id curto ou com o id cru.
- O tipo `feature|bug` (`MsqWorkItemType`) já distingue Work Item de Bug no dado
  (`feature.workItemType`), então o prefixo do Bug (`B…`) pode ser derivado do
  tipo, não de nova coluna.

O que **falta**: um helper único de "short id" por família de entidade, e sua
aplicação nas superfícies (listas, cards, detalhe, breadcrumb).

## Modelo técnico

- `lib/entityId.ts` (novo): `shortId(kind, id, workItemType?)` reusando o hash
  de `toShortFeatureId`, com prefixo por família — `P/E/F/B/R`. Bug → `B…`
  quando `workItemType === 'bug'`; feature → `F…`.
- Migrar `toShortFeatureId` para dentro (ou reexport) para não duplicar hash.
- Aplicar em `FeatureIdentity`, `KanbanCard`, `ProjectDetailPage`,
  `EpicDetailPage`, `RepositoriesSection`, breadcrumbs.

## Requirements

- Cada família de entidade exibe seu prefixo (`P/E/F/B/R`); o mesmo id gera
  sempre o mesmo short id (determinístico).
- Bug usa `B…` derivado de `workItemType`, sem nova persistência.
- Nenhuma duplicação do algoritmo de hash entre módulos.

## Arquivos afetados

- `src/web/client/lib/entityId.ts` (novo); `components/data/KanbanCard.tsx`
  (reexport/uso), `components/data/FeatureIdentity.tsx`,
  `pages/ProjectDetailPage.tsx`, `pages/EpicDetailPage.tsx`,
  `components/project/RepositoriesSection.tsx`.
- `tests/web/entity-id.test.ts` (novo).

## Success Criteria

- **SC-001**: Project mostra `P…`, Epic `E…`, Repository `R…`, feature `F…`,
  bug `B…`.
- **SC-002**: o short id é determinístico e coberto por teste.
- **SC-003**: nenhuma superfície duplica o algoritmo de hash.
