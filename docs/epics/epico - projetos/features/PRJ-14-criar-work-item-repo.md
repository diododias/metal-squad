# Feature Specification: Criar Work Item com Repository alvo

**Feature Branch**: `feat/prj14-create-work-item-repository`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M3
**Depende de**: PRJ-04, PRJ-06, PRJ-11

## Objetivo

Permitir criar um **Work Item** já vinculado a um **Repository alvo** dentro do
Project do Epic, pela WS e pela CLI, com identidade única reservada em transação e
defaults/workflow materializados no ato da criação. Este item entrega a
**escrita** do Work Item; a execução correta no repo certo depende de PRJ-15B, e o
atributo `type` (feature|bug) chega em PRJ-22/24.

## Contexto de execução

Hoje **não existe** ação de criar demanda pela web. O union de ações
(`src/web/types.ts:210-248`) só tem `startFeature`, edições de config e controle
de pipeline — a criação de features acontece via `backlog.yaml` + import. O ponto
onde novas ações entram é o `switch (message.type)` de `handleClientMessage`
(`src/web/server.ts:701-799`), que recebe `featureCwd` como terceiro argumento
(`:702-704`).

Geração de identidade já é robusta e deve ser reusada, não reinventada:

- `allocateFeatureId(reserved, nextRandomIndex)` (`src/core/backlog/featureId.ts:57`)
  gera ID canônico com retry de colisão limitado.
- `listOccupiedFeatureIds()` (`src/db/backlogCatalog.ts:67`) retorna **todos** os
  IDs, inclusive arquivados, porque IDs nunca são reusados.
- `getFeatureIdOwner(featureId)` (`src/db/backlogCatalog.ts:75`) identifica o repo
  dono de um ID. `registerBacklogFeatures` (`src/core/backlog/featureId.ts:77`)
  mostra o padrão de reservar contra um `Set` de ocupados.

Persistência: a tabela real é `backlog_features`, com queries todas chaveadas por
`repo_id` (`src/db/backlogCatalog.ts:128,141,163,284,308,320`). O insert de linha
segue o shape de `INSERT INTO backlog_features (feature_id, epic_id, repo_id, ...)`
(`src/db/backlogCatalog.ts:320`). O adapter de compatibilidade deste item persiste
aí, mantendo `data_json` e colunas normalizadas consistentes na mesma transação
(mesma disciplina de `upsertBacklogCatalog`, `src/db/backlogCatalog.ts:389`).

Validações de vínculo e transferência já vivem em PRJ-03 (services de Project:
`linkRepo`/`moveRepo`/`unlinkRepo`, checagem de "repo em uso" via
`backlog_features.repo_id`). Este item **consome** essas queries: validar que o
`repoId` pertence ao Project do Epic e está healthy antes do insert.

Dependências e ciclo: o backlog resolve ordem topológica por `dependsOn` em
`src/core/orchestrator/graph.ts:3-44` (detecta ciclo) e o scheduler filtra por
`dependsOn` (`src/core/orchestrator/scheduler.ts:52-78`). A regra nova é recusar
`dependsOn` que aponte para outro repo (cross-repo fora de escopo neste épico).

Escrita transacional: `withTransaction` (`src/db/index.ts:104`), com audit event
na mesma transação (requisito transversal do ROADMAP; helper de PRJ-03).

## Contrato técnico

Ação WS e comando CLI equivalentes:

```
action:createWorkItem { requestId, epicId, repoId, title, description?, dependsOn? }
  → resposta tipada { workItem, revision } + reemissão de state
msq work-items create --epic <epicId> --repo <repoId> --title <...> [--depends-on ...]
```

Contratos públicos e eventos usam `WorkItem`/`workItemId`. Um **adapter de
compatibilidade** traduz para a persistência legada (`backlog_features`,
`feature_id`) sem expor esses nomes como domínio novo. `type` assume `'feature'`
até PRJ-22/24.

Fluxo do handler (server-side, em `withTransaction`):

1. resolver Epic → Project; validar `repoId ∈ project_repos(Project)`.
2. validar `dependsOn`: cada dep existe, é do **mesmo** repo, não cria ciclo.
3. reservar `workItemId` via `allocateFeatureId` contra `listOccupiedFeatureIds`.
4. materializar Repository defaults + workflow atual (snapshot) no item.
5. inserir linha (colunas normalizadas + `data_json` coerentes) + audit event.
6. responder com a entidade + revision; reemitir `state:full`.

## Requirements

- Ação canônica `action:createWorkItem {requestId, epicId, repoId, title, description?, dependsOn?}` e comando equivalente `msq work-items create`; `type` entra em PRJ-22/24 e, até lá, assume `feature`.
- Contratos públicos e eventos usam `WorkItem` e `workItemId`. Um adapter de compatibilidade pode persistir temporariamente na tabela legada `backlog_features` e em sua coluna `feature_id`, sem expor esses nomes como domínio novo.
- Validar que o Repository pertence ao Project do Epic e está healthy/executável para criação destinada a run.
- Gerar identificador único usando reserva/transação (`allocateFeatureId` + `listOccupiedFeatureIds`). Enquanto a persistência legada existir, a reserva usa `feature_id`; retry de colisão é limitado e testado.
- Dependências devem existir, pertencer ao mesmo Repository e não criar ciclo (reusar `graph.ts`). Cross-repository é recusado neste épico.
- Materializar Repository defaults e workflow atual no Work Item, mantendo colunas normalizadas e `data_json` consistentes na mesma transação.
- Responder com a entidade criada e sua revision, e então reemitir state.
- A criação não afirma que o runner está inalterado; execução correta depende de PRJ-15B.

## Arquivos afetados

- `src/web/types.ts` — adicionar `action:createWorkItem` ao union
  (`:210-248`) e o tipo de resposta.
- `src/web/server.ts` — novo `case` em `handleClientMessage` (`:701`); validação
  de domínio + resposta tipada.
- `src/db/repo.ts` / `src/db/backlogCatalog.ts` — service `createWorkItem`
  transacional reusando `allocateFeatureId`/`listOccupiedFeatureIds` e insert em
  `backlog_features` (`:320`); adapter de compatibilidade de nomes.
- `src/core/backlog/featureId.ts` — reuso de `allocateFeatureId` (`:57`); nenhum
  contrato novo, apenas consumo.
- `src/commands/` — comando `work-items create`.
- `tests/db/repo.test.ts`, `tests/web/*` — corridas de geração, recusa cross-repo,
  contract test de `createWorkItem`/`workItemId`.

## Success Criteria

- Work Item criado no Repository A nunca é carregado ou spawnado no Repository B.
- Repository fora do Project, dependência cross-repository e ciclo são recusados antes do insert.
- Corrida de geração nunca cria IDs duplicados.
- Falha após reservar ID não deixa Work Item parcial nem libera identificador já tombstonado.
- Contract tests asseguram que `createWorkItem` e `workItemId` são os nomes públicos, mesmo sob persistência legada.
