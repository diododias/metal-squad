# H29 — Gate de publicação reprova PR real por causa da base declarada no MSQ_DONE

## Sintoma

`F-4HGA24AJ` (PRJ-25, branch `feat/prj25-work-item-type-ui`) terminou a run com
`MSQ_DONE` e publicou de verdade o PR #221, aberto e com `state=OPEN` contra
`develop` (confirmado via `gh pr view 221`). Ainda assim a run foi marcada como
falha pelo gate de publicação, mesmo com evidência real de push + PR aberto.

## Causa raiz

O agente declarou na linha de publicação do `MSQ_DONE`:

```
pr_url=https://github.com/diododias/metal-squad/pull/221 pr_number=221 base=feat/prj24-work-item-templates-ws head=feat/prj25-work-item-type-ui
```

`base=feat/prj24-work-item-templates-ws` é a branch de dependência do backlog
(PRJ-24), não a base real usada pelo `gh pr create` — o PR de fato foi aberto
contra `develop`.

`verifyPublishContract` (`src/core/git/publish.ts`) já resolve corretamente o
`effectiveBase` como `develop`, porque `develop` está em `allowedBaseBranches`,
e considera a verificação válida (`ok: true`). O problema estava em
`applyPublishGate` (`src/core/runner/execute.ts`): a checagem `matchesDeclaration`
exigia `observed.baseBranch === declared.baseBranch` byte a byte. Como o valor
declarado pelo agente divergia do valor observado — mesmo os dois sendo bases
legítimas — `diverged` ficava `true` e `ok` era forçado para `false`, com o
resumo `"declared publication does not match verified publication"`.

Ou seja: o gate existe para pegar PR fabricado/mentiroso, mas também derrubava
publicações genuínas sempre que o agente escrevia, na linha de `MSQ_DONE`, uma
base diferente da que o `gh pr create` de fato usou (por exemplo, confundindo a
branch de dependência do backlog com a base real do PR).

## Correção

`applyPublishGate` (`src/core/runner/execute.ts`) não compara mais `baseBranch`
entre o que foi declarado e o que foi observado. A verificação de legitimidade
da base já acontece dentro de `verifyPublishContract` (só é aceita se estiver em
`allowedBaseBranches`); duplicar essa checagem contra o texto livre do
`MSQ_DONE` só produzia falso negativo. `branch` (head), `prNumber` e `prUrl`
continuam comparados normalmente — essas são as evidências que realmente
protegem contra um agente inventando um PR ou apontando para a branch errada.
`publishEvidence.baseBranch` passou a refletir o valor observado (verificado),
não o declarado, já que agora podem divergir por design.

## Validação

- `rtk npx vitest run tests/harness/portability.test.ts`
- baseline: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, `rtk npm run lint`

Casos novos cobertos em `tests/harness/portability.test.ts`: base declarada
diferente da base verificada, com PR real e válido, não falha mais a run;
`pr_number`/`pr_url` divergentes continuam falhando a run como antes.
