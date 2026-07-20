# H27 — Dependência com PR mergeado bloqueia a run para sempre

## Sintoma

`F-4HGA24AJ` (PRJ-25) nunca iniciava. Nove runs consecutivas (357→365) nasciam e
morriam com status `blocked` no mesmo segundo, sem `stage` e sem spawn de
adapter:

```
MSQ_BLOCKED: dependency_unavailable
Could not fetch dependency F-TCMVTEDA with git fetch origin feat/prj16-project-scope-web.
```

Cada retry recriava o mesmo gate (gate 17), sem nenhuma chance de sucesso.

## Causa raiz

`F-TCMVTEDA` publicou o PR #204, que foi **mergeado** em `develop`. O GitHub
apagou a head branch no merge, então `git fetch origin feat/prj16-project-scope-web`
passou a falhar permanentemente:

```
fatal: couldn't find remote ref feat/prj16-project-scope-web
```

`fetchDependencyBranches` (`src/core/git/dependencies.ts`) resolvia a dependência
puramente pelo nome da branch e tratava qualquer falha de fetch como
`dependency_unavailable`. Não havia tratamento para o caso normal e esperado de
PR já mergeado com branch deletada — que é justamente o estado final saudável de
uma dependência.

O bloqueio era auto-perpetuante: a branch nunca mais voltaria a existir, então
nenhum retry ou resolução de gate poderia destravar a feature.

## Correção

1. **Fallback para a base branch quando o PR está mergeado**
   (`src/core/git/dependencies.ts`). Quando o fetch da ref da dependência falha,
   o forge é consultado pelo número do PR. Se o estado for `MERGED`, o trabalho
   já está na base branch, então a publicação é reescrita para apontar para
   `origin/<base>` e a run segue normalmente. Se o PR não estiver mergeado — ou
   se a própria base não for fetchável — o bloqueio é mantido, porque aí a
   dependência é genuinamente indisponível.

2. **`viewPullRequestByNumber` no `ForgeAdapter`**
   (`src/core/git/forge/types.ts`, `github.ts`). `gh pr view <n>` continua
   legível depois que a head branch é apagada, ao contrário do `gh pr view` sem
   argumento, que depende da branch atual.

3. **Publicação verificada tem precedência**
   (`src/db/repo.ts`, `getLatestPublishedRunForFeature`). A ordenação passou a
   priorizar `publish_verified` antes de `started_at`, para que uma run que
   expirou antes de verificar a publicação não vire base de stacking só por ser
   mais recente que uma run verificada.

## Nota sobre o registro da run 336

Durante a investigação, a run 336 (`F-TCMVTEDA`) apareceu com
`status = done` e `publish_verified = 1`, porém com `commit_sha` e
`remote_branch` nulos. Os `run_events` dessa run mostram `status:timed_out`
seguido de `blocked` — ou seja, ela **não** concluiu pelo fluxo normal.

Isso **não** é um bug de escrita do produto. `updateRunPublishState` só é
chamado em dois pontos (`src/core/runner/execute.ts`), e `verifyPublishContract`
retorna `blocked` quando não há upstream remoto, de modo que nenhum caminho de
código consegue gravar `verified=1` sem `remote_branch`. A tabela
`audit_events` está vazia. A linha foi editada manualmente no banco.

O item 3 acima é a proteção de leitura correspondente: mesmo com uma linha
inconsistente no banco, uma publicação verificada passa a ser preferida.

## Validação

- `rtk npx vitest run tests/core/dependencies.test.ts tests/runner/execute.test.ts`
- baseline: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, `rtk npm run lint`

Casos cobertos em `tests/core/dependencies.test.ts`: PR mergeado destrava via
base branch; PR fechado sem merge continua bloqueando; base branch não fetchável
continua bloqueando.
