# Feature Specification: Configurar, transferir e diagnosticar Repositories

**Feature Branch**: `feat/prj09-project-repositories-ui`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M4
**Depende de**: PRJ-06, PRJ-08, PRJ-15B

## Objetivo

Entregar a seção de **Repositories** dentro do detalhe do Project: vincular repos
registrados, registrar path novo (canonicalizado e sob allowlist), transferir um
repo vazio entre Projects e diagnosticar a saúde de cada repo — tudo sem expor
segredos nem paths não autorizados. É a UI sobre os services de vínculo (PRJ-06) e
o contexto de execução por repo (PRJ-15B).

## Contexto de execução

Os services de vínculo já são domínio de M2 (PRJ-06): as ações WS
`action:linkRepo` / `action:moveRepo` / `action:unlinkRepo` chamam
`linkRepo`/`moveRepo`/`unlinkRepo` (PRJ-03, `src/db/repo.ts`), que codificam os
erros `REPO_ALREADY_LINKED`, `REPO_IN_USE`, `REVISION_CONFLICT`. Esta feature é a
**camada de UI** que dispara essas ações e apresenta os erros no formulário
originador.

Segurança de path: hoje `resolveRepo` (`src/core/repo.ts:12-25`) só faz
`resolve(cwd)` + `sha1`, **sem** `realpath` nem allowlist. O endurecimento
(canonicalizar, allowlist configurável, recusar path ausente/não-executável)
nasce em PRJ-15B (`resolveWorkItemExecutionContext`); esta tela **consome** o
resultado: só oferece como utilizável um repo cujo path passou na validação e
mostra diagnóstico quando não passou.

Health do repo vem do DB via PRJ-07 (`RepositorySummary`: `health`,
`lastCheckedAt`, `label`; `path` completo só em contexto autorizado). Os detalhes
pesados (Git, tool/defaults, catálogo, skills) são lazy/cacheados por
repo/revisão — a UI não deve forçar varredura a cada render. A descoberta de
skills usa `createSkillRegistry().discover(cwd)`
(`src/core/skills/registry.ts:124`, hoje chamado com o cwd do servidor em
`src/web/state.ts:252`; passa a usar o cwd do repo alvo em PRJ-15B).

Transferência: `moveRepo` é atômico e só permitido para repo **sem Work Item**
vinculado ao Project atual (senão `REPO_IN_USE`); nunca unlink+link parcial
(ROADMAP §Project × Repo). O runner preserva `project_id` snapshot em runs
históricas, então transferir não reclassifica histórico.

Primitivos: reuso do padrão de formulário/edição já usado em Settings
(`EditableTextField`/`EditableSelectField` em
`src/web/client/components/core/`) e do `send` do `useWebSocket`
(`src/web/client/App.tsx:100`) com `requestId`/`expectedRevision`.

## Modelo técnico

- Seção `RepositoriesSection` no detalhe do Project (PRJ-12), consumindo
  `RepositorySummary[]` do state e `listProjectRepos` projetado.
- Ações: `action:linkRepo {projectId, repoId|path}`, `action:moveRepo
  {repoId, toProjectId}`, `action:unlinkRepo {repoId}` — todas com `requestId`.
- Registro de path novo: input → canonicalização/allowlist server-side (PRJ-15B)
  → confirmação explícita antes de tornar executável.
- Painel de health: path autorizado, Git, tool/defaults, catálogo, skills;
  read-only, sem segredos.

## Requirements

- Seção Repositories no detalhe do Project com label, repoId, path autorizado, health e contagens.
- Vincular repo registrado, registrar path novo após canonicalização/allowlist e transferir repo vazio de outro Project.
- Mostrar preview/confirmar transferência e explicar bloqueio `REPO_IN_USE`.
- Unlink do último repo é permitido; Project sem repo mostra estado não executável.
- Health detalha path, Git, tool/defaults, catálogo e skills sem expor segredos.
- Ações usam requestId/revision e apresentam erro no formulário originador.

## Arquivos afetados

- `src/web/client/pages/ProjectDetailPage.tsx` / novo `RepositoriesSection.tsx` —
  UI de link/move/unlink + health.
- `src/web/client/components/core/*` — reuso de campos editáveis e `Button`.
- `src/web/types.ts` — ações `linkRepo`/`moveRepo`/`unlinkRepo` (PRJ-06).
- `src/web/state.ts` — `RepositorySummary` (PRJ-07) com health/lastChecked.
- `tests/web/*` — componente + integração WS: link/move/unlink e segurança de path.

## Success Criteria

- Path inválido ou não autorizado não aparece como repo utilizável.
- Transferência bem-sucedida atualiza ambos os Projects de forma atômica.
- Repo unhealthy permanece administrável, mas Start fica bloqueado com diagnóstico.
- Testes de componente e integração WS cobrem link/move/unlink e segurança de path.
