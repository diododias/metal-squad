# H02 — timeout do adapter `codex` precisa expor progresso e estado parcial

**Tipo**: Hotfix  
**Status**: Resolvido  
**Prioridade**: Alta  
**Descoberto em**: 2026-07-06  
**Comando observado**: `rtk ~/.nvm/versions/node/v24.16.0/bin/node /Users/luizdiodo/new_repos/metal-squad/dist/index.js run --feature feat-03`

## Resolucao

Verificado em 2026-07-06 no codigo e nos testes automatizados.

- `runCli()` passou a ser chamado com heartbeat periodico e callbacks de stdout/stderr para feedback incremental.
- O adapter `codex` agora registra a ultima mensagem do agente, resume saida parcial em timeout e detecta arquivos tocados no worktree.
- O fluxo de execucao persiste `failed` com resumo parcial recuperavel quando o adapter expira por timeout.

## Evidencia de implementacao

- `src/core/adapters/codex.ts`
- `tests/adapters/codex.test.ts`
- `tests/runner/execute.test.ts`
- validacao manual: `rtk npx vitest run tests/adapters/codex.test.ts tests/runner/execute.test.ts`

## Problema

Depois da correcao do hotfix H01, o `msq` passou a iniciar a execucao real da cadeia `feat-02 -> feat-03`. A run de `feat-02` foi criada, o agente alterou arquivos no worktree, mas o adapter `codex` encerrou por timeout de `600000ms` sem emitir feedback incremental no terminal.

No teste de 2026-07-06:
- a run `3` foi criada no SQLite com `feature_id = feat-02`
- o status final ficou `failed` com `ended_at = 2026-07-06 11:10:00`
- houve alteracoes reais no worktree, incluindo `.specify/feature.json`, `src/core/skills/registry.ts`, `tests/skills/registry.test.ts` e novos artefatos em `specs/002-skill-registry/`
- o terminal mostrou apenas o inicio `▶ feat-02 (codex)` e depois o erro `codex excedeu timeout (600000ms)`

## Impacto

- o operador nao consegue acompanhar se o agente esta progredindo ou travado
- trabalho parcial fica solto no worktree sem decisao automatizada de reaproveitamento, cleanup ou retry
- diagnostico do adapter fica caro, porque stdout so aparece no fim

## Causa tecnica provavel

- `runCli()` captura stdout/stderr apenas em buffer e o `codexAdapter` so produz resumo ao final
- o timeout atual mata o processo sem checkpoint intermediario
- nao existe streaming de output nem politica clara para run longa com trabalho parcial

## Criterios de aceite

- O adapter `codex` deve expor heartbeat ou streaming incremental suficiente para saber que a run continua viva.
- Ao atingir timeout, o `msq` deve registrar metadados de progresso parcial ou resumo recuperavel.
- O CLI deve mostrar claramente qual feature ficou em timeout e quais arquivos foram tocados, quando isso for detectavel.
- Deve existir teste cobrindo timeout do adapter com persistencia de status `failed` e evidencia parcial de execucao.
