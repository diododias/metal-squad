# Feature Specification: Roteamento runtime multi-repo por `repo_id → cwd`

**Feature Branch**: `feat/prj15b-runtime-routing-multi-repo`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M3
**Depende de**: PRJ-14, PRJ-15

## Objetivo

Fazer cada operação de runtime (start, resume, config, histórico, Git, spec,
skills) executar no **repo correto do Work Item**, resolvido a partir do
`repo_id`, e não no `cwd` do daemon web. Filtrar o state por Project (PRJ-15) não
basta: sem um contexto operacional explícito por repo, um Work Item de outro repo
ainda spawnaria no diretório errado.

## Contexto de execução

O web server hoje opera com **um único `cwd`**, fixado na inicialização:
`const cwd = options.cwd ?? process.cwd()` (`src/web/server.ts:261`). Esse valor é
passado como `featureCwd` para `handleClientMessage`
(`src/web/server.ts:701-704`) e daí para praticamente tudo:

- **Start**: `startFeature(featureId, featureCwd)` (`src/web/server.ts:707-708`)
  resolve `resolveRepo(featureCwd)` (`:908`), carrega
  `loadBacklogFromCatalog(repo.repoId, featureCwd)` (`:909`), valida skills com
  `validateBacklogSkills(backlog, featureCwd)` (`:910`) e faz
  `spawn(..., { cwd: featureCwd })` (`:930-937`).
- **Resume**: `spawn(..., { cwd: pipeline.cwd })` (`src/web/server.ts:986-989`) —
  aqui o `pipeline.cwd` persistido já é a fonte correta (`:962` recusa pipeline
  sem cwd). Este contrato deve ser **preservado**.
- **Git/histórico**: `computeRunChanges(runId, cwd)` (`src/web/server.ts:150`) e
  `runGit(args, cwd)` (`:141-149`) rodam Git no cwd do servidor.
- **Config/skills**: `resolveRuntimeConfig(featureCwd)` (`:907`) e a descoberta de
  skills via `createSkillRegistry().discover(process.cwd())`
  (`src/web/state.ts:252`) — que lê `.msq/skills`, `.claude/skills`,
  `.agents/skills` e global relativos ao cwd (`src/core/skills/registry.ts:124-130`).

`resolveRepo` (`src/core/repo.ts:12-25`) hoje faz `resolve(cwd)` e
`sha1(origin||path)[:12]`, **sem `realpath`** e sem validar existência/permissão —
o endurecimento de path (canonicalizar, recusar ausente/não-permitido) nasce aqui.

A dependência cross-repo é recusada logicamente pelo grafo topológico
(`src/core/orchestrator/graph.ts:3-44`) e pelo scheduler
(`src/core/orchestrator/scheduler.ts:52-78`), mas hoje tudo assume um repo só; a
recusa explícita cross-repo antes de criar pipeline é requisito deste item
(complementa a validação de criação em PRJ-14).

## Contrato técnico

Novo resolvedor de contexto operacional por Work Item:

```ts
resolveWorkItemExecutionContext(workItemId): {
  repoId: string;
  cwd: string;          // path canonicalizado via realpath
  projectId: string;
  epicId: string;
  repoHealth: 'ok' | 'unavailable';
}
// durante a compatibilidade, pode delegar ao lookup persistido por feature_id
```

Resolução do path: buscar em `repos` pelo `repoId`, canonicalizar com `realpath`,
recusar path ausente/não-permitido/não-executável com erro **acionável** (nunca
criar run órfã). Toda operação de runtime passa a receber o `cwd` desse contexto
em vez do `featureCwd` global:

- `startFeature` e o `spawn` (`server.ts:930`) usam `context.cwd`.
- `computeRunChanges`/`runGit` (`server.ts:141-190`) recebem o `cwd` do Work Item
  do run.
- `resolveRuntimeConfig`, `validateBacklogSkills` e a descoberta de skills usam o
  `cwd` resolvido; caches são por `repoId`/revisão (padrão de PRJ-07), evitando
  vazamento entre repos.
- **Resume** continua autoritativo via `pipeline.cwd` (`server.ts:989`) — o
  checkpoint persistido vence.

## Requirements

- Criar `resolveWorkItemExecutionContext(workItemId)`; durante a compatibilidade ele pode delegar ao lookup persistido por `feature_id`. O resultado retorna `repoId`, `cwd`, Project/Epic e health do repo.
- Resolver o path a partir de `repos`, canonicalizar com `realpath` e recusar path ausente, não permitido ou não executável.
- Start, resume, update config/task, histórico, run changes, spec/context, defaults e skill discovery usam o contexto resolvido, nunca o cwd do daemon.
- `pipeline.cwd` continua sendo o checkpoint autoritativo para resume de pipeline existente (`server.ts:989`).
- Work Items de repos diferentes podem executar concorrentemente sem compartilhar cache de catálogo/config/skills incorreto (cache por `repoId`/revisão).
- Dependência para feature de outro repo é recusada antes de criar pipeline neste épico.
- Estado resumido de repos vem do DB; leituras pesadas de filesystem são lazy e cacheadas por repo/revision.

## Arquivos afetados

- `src/core/repo.ts` — `resolveRepo` (`:12`) ganha canonicalização `realpath` e
  validação de path; ou novo helper `resolveWorkItemExecutionContext`.
- `src/web/server.ts` — substituir uso do `featureCwd` global (`:261`, `:701-708`,
  `:908-937`, `:150`, `:141`) pelo contexto resolvido por Work Item; preservar
  `pipeline.cwd` no resume (`:989`).
- `src/web/state.ts` — descoberta de skills/config por `cwd` resolvido, cache por
  `repoId` (`collectSkillsCatalog` `:247`).
- `src/core/skills/registry.ts` — `discover(cwd)` (`:124`) chamado com o cwd do
  repo alvo, não `process.cwd()`.
- `src/core/orchestrator/graph.ts` / `scheduler.ts` — recusa explícita de
  dependência cross-repo antes de criar pipeline.
- `tests/web/*`, `tests/e2e/*` — E2E com dois repos Git temporários; contexto
  correto por run; recusa de repo inacessível.

## Success Criteria

- Teste E2E usa dois repos Git temporários com skills/defaults distintos.
- Cada run nasce com `repo_id` e `cwd` corretos e altera somente seu repo.
- Histórico e diff de um Work Item nunca usam o repo selecionado no cliente nem o cwd do servidor.
- Repo removido/inacessível produz erro acionável sem criar run órfã.
