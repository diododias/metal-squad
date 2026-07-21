# H34 — Publicação verificada bloqueada pela base "errada" e status mascarado por retry

## Sintoma

`F-Q369N72H` (PRJ-17, branch `feat/prj17-lifecycle-policy`) teve duas runs:

- Run 385: crashou por limite de sessão da conta Claude (`session limit reached`),
  ainda na fase de exploração, sem nenhum `control` signal.
- Run 386 (retry): terminou com `MSQ_DONE`, publicou de verdade o PR #230
  (aberto, `state=OPEN`, verificado via `gh pr view`), e mesmo assim a run foi
  marcada `blocked`. Na tela web, a run 386 aparecia como **failed**, embora o
  banco tivesse `status='blocked'`, `publish_verified=1` e um resumo confirmando
  `"publish verified on feat/prj17-lifecycle-policy (...)".`

Dois bugs distintos, no mesmo par de runs.

## Causa raiz 1 — `applyBaseReconciliation` bloqueava um PR já verificado

`verifyPublishContract` (`src/core/git/publish.ts`) já tinha confirmado a
publicação: PR real, aberta, com commits à frente da base que ela mesma
declara no GitHub. Depois disso, `applyBaseReconciliation`
(`src/core/runner/execute.ts`) rodava um segundo check local e redundante —
`git merge-base --is-ancestor <base> HEAD` — contra a branch de **dependência
declarada no backlog** (`feat/prj15b-runtime-routing-multi-repo`), não contra
a base real observada na PR. Essa branch de dependência provavelmente já
tinha sido mergeada/apagada, então o `merge-base` deu inconclusivo
(`"could not verify whether HEAD descends..."`) e o check derrubava `res.ok`
mesmo com evidência real de push + PR aberto — o mesmo padrão de falso
negativo já corrigido uma vez em H29, mas numa camada diferente.

## Causa raiz 2 — `verifyPublishContract` também policiava para onde a PR mirava

Separado do problema acima: `verifyPublishContract` recusava (`status: failed`)
qualquer PR cuja `baseRefName` não estivesse na lista `allowedBaseBranches`
(base configurada + branches de dependência). Isso significa que uma PR real,
aberta e válida, mas mirando uma branch fora dessa lista, era tratada como
inválida — mesmo o destino da PR sendo uma decisão legítima de quem pediu a
run, não algo que o `msq` deveria policiar.

## Causa raiz 3 — status da run mascarado pelo pipeline de uma tentativa anterior

`listRunsForTui` e `listRunHistoryForFeature` (`src/db/repo.ts`) derivam o
status exibido com um `CASE` que prioriza o status do **pipeline** sobre o da
run mais recente: `WHEN p.status = 'failed' THEN 'failed'`. Quando a run 385
crashou, o scheduler propagou a exceção e chamou
`finishPipeline(pipelineId, 'failed')`, travando o pipeline 278 em
`status='failed'`. A run 386 (retry, mesmo `pipeline_id`) terminou com seu
próprio status real (`blocked`), mas o `CASE` ignorava isso e forçava
`'failed'` na tela só porque o pipeline pai nunca saiu do estado travado pela
tentativa anterior.

## Correção

1. **`src/core/git/publish.ts`** — `verifyPublishContract` não exige mais que
   `pr.baseRefName` esteja em `allowedBaseBranches`. `effectiveBase` passa a
   ser sempre a base real declarada na PR (`pr.baseRefName`), com fallback
   para a base primária apenas quando ainda não há PR pra ler. O destino da
   PR deixa de ser policiado — só interessa que a PR seja real, aberta e com
   commits genuínos à frente da base que ela mesma declara.
2. **`src/core/runner/execute.ts`** — `applyBaseReconciliation` não reverte
   mais `res.ok`/`publishVerificationStatus` quando o `merge-base` é
   inconclusivo ou negativo. Vira uma nota informacional (`RunResult.publishNote`)
   anexada ao summary e persistida em `publish_error` mesmo com
   `publish_verified=1` — uma PR real e verificada nunca é bloqueada por esse
   check local redundante.
3. **`src/db/repo.ts`** — o `CASE` de derivação de status em
   `listRunsForTui`/`listRunHistoryForFeature` só deixa o `'failed'` do
   pipeline pai substituir o status da run quando essa run ainda está
   `'running'` (mesmo padrão já usado pelo branch `running`/`done` logo
   abaixo). Uma run que já chegou ao próprio estado terminal (`done`,
   `blocked`, `failed`) não é mais mascarada pelo estado de uma tentativa
   anterior no mesmo pipeline.
4. **`src/web/client/pages/RunDetailPage.tsx`** — o quadrante de publish
   passa a rotular `run.publishError` como "Publish warning" (cor de aviso)
   quando `run.publishVerified` é `true`, e "Publish check" (cor de erro)
   quando não é — hoje essa combinação (erro presente + verificado) só é
   possível graças ao item 2 acima.

## Validação

- `rtk npx vitest run tests/core/publish.test.ts tests/runner/execute.test.ts tests/web/run-detail-page.test.tsx`
- baseline: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, `rtk npm run lint`
- Reprodução manual: `CASE` do `listRunsForTui` testado com uma cópia do banco
  contra o par de runs real (385/386, `pipeline_id=278`) — confirma que a run
  386 passa a derivar `blocked` em vez de `failed`.

Casos novos cobertos em `tests/core/publish.test.ts`: PR aberta contra uma
base fora da lista permitida (configurada ou de dependência) passa a ser
aceita. Em `tests/runner/execute.test.ts`: uma publicação já verificada
permanece `done` quando `merge-base --is-ancestor` é negativo ou inconclusivo,
carregando a nota em `publish_error`. Em `tests/web/run-detail-page.test.tsx`:
o rótulo do quadrante de publish diferencia aviso (verificado) de falha real
(não verificado).
