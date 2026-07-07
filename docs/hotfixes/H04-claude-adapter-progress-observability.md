# H04 — adapter `claude` precisa expor heartbeat e progresso incremental

**Tipo**: Hotfix  
**Status**: Resolvido  
**Prioridade**: Alta  
**Descoberto em**: 2026-07-06  
**Comando observado**: `rtk node dist/index.js run --feature feat-03`

## Resolucao

Verificado em 2026-07-06 no codigo e nos testes automatizados.

- O adapter `claude` agora usa `runCli()` com `heartbeatMs`, `logLabel`, `heartbeatSuffix` e callbacks de `stdout`/`stderr`.
- O `msq` passou a registrar snippets incrementais do agente e de `stderr` durante a execucao do `claude`.
- Em timeout, o adapter agora devolve resumo parcial com ultima mensagem util, uso de tokens e arquivos tocados no worktree.
- Em falha com exit code diferente de zero, o resumo tambem passou a priorizar contexto parcial recuperavel em vez de so truncar `stderr`.

## Evidencia de implementacao

- `src/core/adapters/claude.ts`
- `tests/adapters/misc.test.ts`
- validacao manual: `rtk npx vitest run tests/adapters/misc.test.ts tests/adapters/codex.test.ts`
- validacao manual: `rtk npx tsc --noEmit`

## Problema

Ao validar o fluxo `msq-develop` para a proxima feature elegivel (`F03`), o `msq` executou a cadeia real `feat-02 -> feat-03` com sucesso, mas o adapter `claude` ficou praticamente sem observabilidade durante a maior parte da run:

- o terminal mostrou `▶ feat-02 (claude)`, depois a conclusao de `feat-02`, e em seguida `▶ feat-03 (claude)`
- durante varios ciclos consecutivos de monitoramento de 30s e 60s, nao houve nenhuma linha adicional de progresso para `feat-03`
- `rtk node dist/index.js status --limit 5` mostrava a run `7` como `running` para `feat-03`, sem `summary`
- o worktree mudou durante a execucao, o que confirma trabalho real do agente mesmo sem feedback no terminal
- apenas no final a run retornou resumo de sucesso: `F03 entregue em 5 commits atômicos...`

Arquivos observados como tocados enquanto a run ainda aparecia como `running`:
- `src/core/adapters/types.ts`
- `tests/adapters/codex.test.ts`
- `tests/adapters/misc.test.ts`

## Impacto

- o operador nao consegue distinguir run viva de run travada enquanto o `claude` trabalha
- alteracoes reais no worktree podem acontecer por varios minutos sem qualquer indicacao do que esta sendo feito
- diagnosticar timeout, loop ou regressao do adapter `claude` fica pior do que no adapter `codex`, que ja recebeu heartbeat e resumo parcial no H02

## Causa tecnica provavel

- `src/core/adapters/claude.ts` chama `runCli('claude', args, { cwd })` sem `heartbeatMs`, `logLabel`, `onStdoutLine` ou `onStderrLine`
- `src/core/adapters/spawn.ts` ja suporta heartbeat periodico e callbacks de linha, mas o adapter `claude` nao usa esses recursos
- o `msq` so recebe um resumo util quando o processo encerra e o JSON final e parseado

## Evidencia de codigo

- `src/core/adapters/claude.ts`
- `src/core/adapters/spawn.ts`
- `src/commands/run.ts`

## Criterios de aceite

- o adapter `claude` deve emitir heartbeat periodico suficiente para mostrar que a run continua viva
- quando houver stdout/stderr relevante, o `msq` deve registrar pelo menos o ultimo resumo do agente ou sinal equivalente de progresso
- em falha ou timeout, o CLI deve devolver contexto parcial acionavel semelhante ao adapter `codex`
- deve existir teste automatizado cobrindo observabilidade do adapter `claude` em run longa
