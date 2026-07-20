# H28 — Build de `develop` quebrado por exports ausentes de Workflow Templates no web

## Sintoma

`npm run build` (tsc) falhava direto na `develop`, sem nenhuma mudança local:

```
src/web/client/pages/ProjectDetailPage.tsx(11,28): error TS2305: Module '"../../types.js"' has no exported member 'MsqWorkItemType'.
src/web/server.ts(81,3): error TS2305: Module '"./types.js"' has no exported member 'MsqWorkItemType'.
src/web/state.ts(21,33): error TS2305: Module '"../db/workflowTemplates.js"' has no exported member 'listProjectTemplateMappings'.
src/web/state.ts(293,14): error TS2304: Cannot find name 'WorkflowTemplateSummary'.
... (mais 8 erros do mesmo tipo em src/web/state.ts e src/web/types.ts)
```

## Causa raiz

O commit `7439199` — "feat(prj24): WS/state de templates e snapshot na criação
do Work Item (#215)" — adicionou consumidores de quatro símbolos que nunca
foram exportados em nenhum commit:

- `listProjectTemplateMappings` (esperado em `src/db/workflowTemplates.ts`)
- `MsqWorkItemType`, `WorkflowTemplateSummary`, `WorkflowTemplateMappings`
  (esperados em `src/web/types.ts`)

`src/web/state.ts` já continha uma função `collectWorkflowTemplates()`
completa — cache, chamada a `listWorkflowTemplates`/`listProjectTemplateMappings`,
projeção para `WorkflowTemplateSummary[]`/`WorkflowTemplateMappings` — mas essa
função nunca era chamada dentro de `buildMsqWebState()`, e `MsqWebState` não
tinha os campos correspondentes. `git log -p --follow -- src/db/workflowTemplates.ts`
confirma que `listProjectTemplateMappings` nunca existiu no arquivo produtor —
só em mocks de teste (`tests/web/state.test.ts`, `tests/web/server.test.ts`,
`tests/db/workItemSnapshot.test.ts`). O PR #215 aparentemente foi mergeado com
metade da mudança (consumidores + testes) e sem a outra metade (produtor:
função de DB + tipos web + wiring em `buildMsqWebState`).

## Correção

1. **`src/db/workflowTemplates.ts`** — adicionada `listProjectTemplateMappings(projectId?: string)`
   logo após `mapProjectWorkItemTemplate`, no mesmo padrão de `listWorkflowTemplates`
   (`hasDbFile()` guard, `getDb('readonly')`, query em `project_work_item_templates`).
   Shape validado contra `tests/db/workItemSnapshot.test.ts`
   ("exposes project/type mappings for the web state projection").

2. **`src/web/types.ts`** — adicionado `import type { WorkItemType } from '../db/workflowTemplates.js'`
   e:
   - `export type MsqWorkItemType = WorkItemType`
   - `export interface WorkflowTemplateSummary` (mesmo shape já montado em
     `collectWorkflowTemplates()` e em `templateActionOk()` no server)
   - `export type WorkflowTemplateMappings = Record<string, Partial<Record<MsqWorkItemType, string>>>`
   - campos `workflowTemplates: WorkflowTemplateSummary[]` e
     `workflowTemplateMappings: WorkflowTemplateMappings` em `MsqWebState`.

3. **`src/web/state.ts`** — `buildMsqWebState()` passou a chamar a
   `collectWorkflowTemplates()` já existente e a incluir `workflowTemplates`/
   `workflowTemplateMappings` no snapshot retornado.

Nenhuma lógica nova foi inventada: os três pontos fecham exatamente o contrato
que os consumidores, os testes e a função de coleta já esperavam.

## Validação

- `rtk npm run build` — verde
- `rtk npm run typecheck` — verde
- `rtk npm run lint` — verde
- `rtk npm test` — 112 arquivos, 1515 testes, todos passando (incluindo os
  testes que já mockavam `listProjectTemplateMappings` e verificavam
  `state.workflowTemplates`/`state.workflowTemplateMappings`, que antes não
  tinham como compilar)
