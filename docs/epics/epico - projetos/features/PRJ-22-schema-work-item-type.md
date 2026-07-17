# Feature Specification: Work Item type `feature|bug`

**Feature Branch**: `feat/prj22-work-item-type`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M5
**Depende de**: PRJ-14

## Objetivo

Introduzir o atributo **`type` (`feature|bug`)** no Work Item — o que substitui a
antiga ideia `Bug > Hotfix` (SPEC §11) por um modelo simples: bug usa a mesma
tabela/formato da feature, e a diferença é o template de workflow (PRJ-23/24). Esta
feature entrega apenas o **campo tipado e sua persistência**; a resolução de
template por tipo é PRJ-23 e o snapshot na criação é PRJ-24.

## Contexto de execução

O modelo atual não tem tipo. `FeatureSchema` (`src/core/backlog/schema.ts:144-161`)
tem `id`, `title`, `spec`, `tool`, `effort`, `dependsOn`, `workflow`, etc. — **sem**
`type`. A persistência real é `backlog_features` (`src/db/index.ts:328`,
colunas normalizadas + `data_json`), com queries `WHERE repo_id = ?`
(`src/db/backlogCatalog.ts:128-186`).

Padrão de coluna nova: `ensure*Column` via `PRAGMA table_info` + `ALTER TABLE ADD
COLUMN` (mesmo padrão descrito em PRJ-01, `src/db/index.ts:433-539`). O `type`
entra como `type TEXT NOT NULL DEFAULT 'feature'` — aditivo, para não quebrar
linhas legadas. O `CHECK (type IN ('feature','bug'))` só é aplicável no **schema
final reconstruído** (SQLite não adiciona CHECK via `ALTER`; a reconstrução
create-copy-drop-rename é a mesma técnica de PRJ-02 para `backlog_epics`).

Enums Zod já seguem um padrão claro no arquivo: `AdapterSchema = z.enum([...])`
(`schema.ts:5`), `EffortSchema` (`:28`), `WorkflowModeSchema` (`:30`). O
`WorkItemTypeSchema = z.enum(['feature','bug'])` segue esse formato. A disciplina
"coluna normalizada + `data_json` na mesma transação, revalidados por Zod" já
existe em `updateCatalogFeature` (`src/db/backlogCatalog.ts`, ver PRJ-01/PRJ-03).

Compatibilidade de nomes (ROADMAP §Compatibilidade): domínio novo usa
`WorkItem*`/`workItemId`; `FeatureSchema` e `feature_id` permanecem como alias de
persistência legada. Inputs YAML v2/v3 e registros sem `type` resolvem para
`feature`.

Imutabilidade: uma vez que o Work Item tem run, o `type` é imutável (mudar
recalcularia o workflow de um item com histórico). Antes da primeira run pode
mudar, mas o recálculo/aplicação do novo template é responsabilidade de PRJ-24
(com preview e confirmação).

## Modelo técnico

```ts
export const WorkItemTypeSchema = z.enum(['feature', 'bug']); // segue AdapterSchema (:5)
// WorkItemSchema encapsula FeatureSchema + type; FeatureSchema vira alias
```

```sql
-- passo aditivo (idempotente)
ALTER TABLE backlog_features ADD COLUMN type TEXT NOT NULL DEFAULT 'feature';
-- schema final reconstruído: CHECK (type IN ('feature','bug'))
```

## Requirements

- A tabela legada `backlog_features` recebe `type TEXT NOT NULL DEFAULT 'feature'`, com validação `feature|bug` na aplicação e `CHECK (type IN ('feature','bug'))` no schema final reconstruído.
- Criar `WorkItemTypeSchema` e adotar `WorkItemSchema` no domínio. `FeatureSchema` permanece somente como alias de compatibilidade durante a migração.
- Inputs YAML v2/v3 e registros legados assumem `feature` quando `type` estiver ausente.
- Persistência normalizada e `data_json` são atualizadas e validadas na mesma transação.
- Catálogo, filtros, export, contratos públicos e audit events expõem o tipo do Work Item.
- O tipo é imutável após a primeira run. Antes disso pode mudar, mas PRJ-24 recalcula e aplica o novo template somente mediante preview e confirmação.
- Tipos adicionais exigem migração e specification futura; não são aceitos como string livre.

## Arquivos afetados

- `src/core/backlog/schema.ts` — `WorkItemTypeSchema` (`:5` como referência de
  padrão); `WorkItemSchema` encapsulando `FeatureSchema` (`:144`) + `type`.
- `src/db/index.ts` — `migrate()`: `ALTER TABLE backlog_features ADD COLUMN type`
  (padrão `ensure*Column` `:433-539`); reconstrução com CHECK no schema final.
- `src/db/backlogCatalog.ts` — projetar `type` no catálogo; `data_json` coerente.
- `src/core/backlog/load.ts` — default `feature` para YAML/legado sem `type`.
- `tests/db/index.test.ts`, `tests/backlog/*` — DB, Zod, catálogo, YAML v2/v3.

## Success Criteria

- Work Item legado é lido como `feature` sem rewrite destrutivo.
- Valor inválido falha antes do DB.
- Mudança de tipo com histórico é recusada; Work Item pristine exige novo snapshot coerente.
- Contract tests cobrem DB, Zod, catálogo e YAML v2/v3.
- Novos contratos não introduzem símbolos `Demand*` ou `BacklogItem*`.
