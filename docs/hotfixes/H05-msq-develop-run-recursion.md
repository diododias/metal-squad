# H05 — prompt do `msq-develop` pode induzir recursao de `msq run` dentro da propria run

**Tipo**: Hotfix  
**Status**: Aberto  
**Prioridade**: Alta  
**Descoberto em**: 2026-07-06  
**Comando observado**: `MSQ_DB_PATH=$(pwd)/.metal-squad/app.db rtk node dist/index.js run --feature feat-15`

## Problema

Ao validar a `F15` com a skill `msq-develop`, o executor `claude` nao implementou a feature. Em vez disso, ele passou a disparar novas execucoes do proprio `msq` para a mesma feature, criando recursao de runs no mesmo checkout.

## Evidencia observada

- a run principal iniciou com `▶ feat-15 (claude)`
- por 180s o adapter exibiu apenas heartbeat, sempre com `stdout=0B stderr=0B`
- o status persistido no SQLite mostrou tres runs para a mesma feature, todas sem tokens e sem summary:
  - run `1` iniciada em `2026-07-06 15:40:55`
  - run `2` iniciada em `2026-07-06 15:41:58`
  - run `3` iniciada em `2026-07-06 15:42:42`
- a arvore de processos confirmou recursao real:
  - `rtk node dist/index.js run --feature feat-15` (`pid 15660`)
  - `claude -p ...` (`pid 15667`)
  - `/bin/zsh -c ...`
  - `node dist/index.js run --feature feat-15` (`pid 16570`)
  - `claude -p ...` (`pid 16584`)
  - `/bin/zsh -c ...`
  - `node dist/index.js run --feature feat-15` (`pid 17386`)
  - `claude -p ...` (`pid 17391`)
- o worktree nao mostrou alteracoes da feature; o unico diff local permaneceu `backlog.yaml`, alterado manualmente pelo harness
- a execucao precisou ser encerrada manualmente com `pkill`, apos o que as runs ficaram `failed`

## Impacto

- o fluxo `msq-develop` produz falso trabalho: ha runs persistidas, mas nenhuma implementacao real
- o consumo de recursos cresce a cada nivel da recursao
- a validacao da feature nao chega a exercitar o executor sobre o codigo-alvo

## Causa tecnica provavel

- o prompt temporario do harness instrui que a implementacao deve acontecer "exclusivamente por meio do executor disparado pelo msq"
- um agente filho pode interpretar essa regra como ordem para invocar `msq run` novamente, em vez de editar o codigo diretamente dentro da sessao ja aberta pelo adapter
- como nao ha guarda explicita contra nested `msq run`, a recursao persiste e registra novas runs no mesmo banco

## Criterios de aceite

- o prompt/harness do `msq-develop` deve proibir explicitamente invocar `msq`, `node dist/index.js run` ou qualquer nested runner de dentro do agente filho
- a documentacao/skill deve deixar claro que "implementado pelo msq" significa "implementado pelo agente ja spawnado pelo msq", nao uma nova chamada do CLI
- uma nova validacao da `feat-15` deve gerar no maximo uma cadeia de run esperada, sem recursao e com evidencias reais de diff/commits/artefatos
