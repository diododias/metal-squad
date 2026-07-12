# F36 — Web Feature/Task Config Persistence

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F35 (backlog catalog import — DB como fonte de verdade em runtime)

## Problema

A web UI permite editar e persistir a configuracao de cada feature (tool/model/
effort/workflow/retry/skills/maxTokens) diretamente no formulario do
`FeaturePreview.js`, gravando no catalogo do banco via `updateCatalogFeature`.
Editar `workflow.stages`, `retry`, `skills` ou o budget por feature antes
exigia editar `backlog.yaml` manualmente e rodar `msq backlog load` de novo, e o
detalhamento de tasks (`FeaturePreview`'s tab "Tasks") era somente leitura.

## Solucao

### Novo campo: `maxTokens` por feature

`FeatureSchema` ganha `maxTokens?: number` (inteiro positivo). Quando
definido, sobrescreve `budget.perFeatureMaxTokens` (global) apenas para
aquela feature; quando ausente, o valor global continua valendo como
default. `createBudgetTracker` (`src/core/budget/tracker.ts`) recebe um
terceiro parametro opcional `featureMaxTokens: Map<string, number>`,
resolvido em `executeBacklog` a partir de `feature.maxTokens` de cada
feature do backlog carregado. A checagem de violacao por feature passa a
usar `featureMaxTokens.get(featureId) ?? limits.perFeatureMaxTokens`.

### Timeout: fora de escopo

Sem campo de schema, sem wiring de adapter — decisao explicita para manter o
escopo desta feature contido.

### Persistencia real via DB (`src/db/backlogCatalog.ts`)

Duas novas funcoes de escrita, ambas validando via Zod antes de gravar (nunca
persistindo um blob nao validado) e ambas dentro de `db.transaction()`:

- **`updateCatalogFeature(repoId, featureId, patch: FeaturePatch): Feature`**
  — le a linha atual de `backlog_features` (erro tipado
  `BacklogCatalogNotFoundError` se ausente/arquivada), faz merge do patch
  (`workflow`/`retry` com deep-merge para nao apagar sub-campos irmaos como
  `workflow.approvals` ao patchear so `workflow.stages`), reparsa via
  `FeatureSchema.parse`, e grava `data_json` + as colunas denormalizadas
  (`title`, `depends_on`, `spec_file`), igual ao que `upsertFeature` ja
  escreve hoje.
- **`updateCatalogTask(featureId, taskId, patch: Partial<Task>): Task`** —
  mesmo formato contra `backlog_tasks` (PK `(task_id, feature_id)`), reparsa
  via `TaskSchema`, mantem `title`/`status` denormalizados em sincronia.

Nenhuma coluna nova, nenhuma migration — tudo vive dentro de `data_json`,
seguindo a convencao ja estabelecida por F35.

### Web server (`src/web/types.ts` + `src/web/server.ts`)

Duas novas mensagens de cliente via WebSocket:

```ts
| { type: 'action:updateFeatureConfig'; featureId: string; patch: FeatureConfigPatch }
| { type: 'action:updateTaskConfig'; featureId: string; taskId: string; patch: TaskConfigPatch }
```

`FeatureConfigPatch`/`TaskConfigPatch` sao interfaces explicitas e estreitas
(so os campos editaveis), nao `Partial<Feature>`/`Partial<Task>` crus — o
contrato de rede nao pode contrabandear reshaping de `id`/`tasks` vindo de um
cliente nao confiavel.

`handleClientMessage` ganha dois casos, modelados igual a `startFeature`
existente: `assertWritableDbPath()` -> `resolveRepo(cwd)` ->
`updateCatalogFeature`/`updateCatalogTask`. Erro emite `ui:notice` (mesma UX
de `startFeature`). Sucesso chama `refreshState()` e faz `broadcast` de
`state:full` para todos os clientes conectados, mais um toast `ui:info`.

Apos a F37, as flags `--tool/--model/--effort` do CLI (`src/commands/run.ts`)
foram removidas. A unica forma de customizar parametros de feature e via
"Save Config" na web UI, que persiste no catalogo do banco.

### Frontend (`src/web/static/components/FeaturePreview.js`, `app.js`)

- O bloco de override pontual (tool/model/effort) foi removido pela F37.
  A unica forma de customizar parametros e via "Save Config" acima.
- `FeatureConfigSection` (somente leitura) virou `FeatureConfigForm`
  (editavel): tool, model, effort, `workflow.mode`, `workflow.stages`,
  `workflow.syncTasksToBacklog`, `approvals.autoAdvance`,
  `retry.maxAttempts/backoffMs/onFail`, `skills`, `maxTokens`. Um botao
  "save config" no rodape do form diffa so os campos alterados (mesma
   disciplina do diff de patch) e chama `onSaveConfig(patch)`
  — nao fecha o preview; o proximo `state:full` broadcastado atualiza
  `state.featureCatalog[id]` e o form resincroniza com os valores
  persistidos.
- `workflow.stages` e `skills` (e `dependsOn` nas tasks) usam um
  `ChipListEditor` reutilizavel (adicionar com enter, remover clicando no
  chip) em vez de um input de texto separado por virgulas.
- A aba "Tasks" ganhou edicao inline completa por task via `TaskEditRow`:
  status, skills (chip editor), title, dependsOn (chip editor com sugestoes
  das outras tasks da mesma feature), com um botao "save task" por linha
  chamando `onSaveTaskConfig(taskId, patch)`.
- `app.js` conecta `onSaveConfig` -> `send({ type:
  'action:updateFeatureConfig', ... })` e `onSaveTaskConfig` -> `send({
  type: 'action:updateTaskConfig', ... })`.

`src/web/static/*.js` nao tem harness de teste proprio (as suites Ink/vitest
so cobrem `src/ui/`) — gap preexistente; a logica de merge/diff de patch e
coberta via testes de DB e server, a UI foi validada manualmente.

## Criterios de aceite

- [x] `FeatureSchema.maxTokens` opcional, inteiro positivo; quando ausente
      `budget.perFeatureMaxTokens` global continua valendo
- [x] `createBudgetTracker` resolve limite por feature via
      `featureMaxTokens.get(featureId) ?? limits.perFeatureMaxTokens`
- [x] `updateCatalogFeature`/`updateCatalogTask` validam via Zod antes de
      escrever, fazem deep-merge de `workflow`/`retry`, e lancam erro tipado
      para feature/task ausente ou arquivada
- [x] `action:updateFeatureConfig`/`action:updateTaskConfig` persistem no
      banco e disparam `state:full` para todos os clientes conectados
- [x] Editar `stages`/`maxTokens`/`effort` na web e reabrir a mesma feature
      depois de reiniciar o servidor mostra os valores persistidos
- [x] `msq run --feature X` honra o `data_json` patchado (stages/budget)
- [x] Edicoes na web nunca tocam `backlog.yaml` em disco
