# H03 — `msq run` precisa diagnosticar e contornar melhor banco global em modo somente leitura

**Tipo**: Hotfix  
**Status**: Resolvido  
**Prioridade**: Alta  
**Descoberto em**: 2026-07-06  
**Comando observado**: `rtk node dist/index.js run --feature feat-15`

## Resolucao

Verificado em 2026-07-06 no codigo e nos testes automatizados.

- `assertWritableDbPath()` agora faz preflight explicito de diretório e arquivo antes de abrir o SQLite.
- `DbAccessError` passou a incluir o caminho do banco, causa acionavel e exemplo de override com `MSQ_DB_PATH`.
- O comando `run` falha antes de carregar backlog ou spawnar adapter quando a persistencia nao e gravavel.
- O override suportado por `MSQ_DB_PATH` esta coberto em teste de configuracao.

## Evidencia de implementacao

- `src/db/index.ts`
- `src/commands/run.ts`
- `src/config/index.ts`
- `tests/db/index.test.ts`
- `tests/commands/commands.test.ts`
- `tests/config/index.test.ts`
- validacao manual: `rtk npx vitest run tests/db/index.test.ts tests/config/index.test.ts tests/commands/commands.test.ts`
- validacao manual: `rtk npx tsc --noEmit`

## Problema

Ao validar o fluxo `msq-develop` para a proxima feature elegivel (`F15`), a execucao falhou imediatamente antes de spawnar o agente:

- `rtk npm install --silent` terminou com sucesso
- `rtk npm run build` terminou com sucesso
- `rtk node dist/index.js run --feature feat-15` retornou erro `attempt to write a readonly database`
- `rtk node dist/index.js status --limit 1` continuou funcionando e exibiu apenas a run antiga `feat-03`
- nenhuma nova run para `feat-15` foi persistida
- nenhum arquivo da feature alvo foi alterado; o unico diff local durante o teste foi o `backlog.yaml` temporario do harness

## Impacto

- o fluxo principal de execucao nao funciona em ambientes onde `~/.local/share/metal-squad/app.db` existe mas nao e gravavel
- o operador recebe apenas o erro do SQLite, sem contexto acionavel sobre qual caminho falhou nem como contornar
- validacoes automatizadas do `msq` em sandboxes ou ambientes restritos falham antes de exercitar o adapter real

## Causa tecnica provavel

- `src/config/index.ts` fixa `DB_PATH` em `~/.local/share/metal-squad/app.db`
- `src/db/index.ts` sempre chama `ensureDataDir()`, abre o banco global e executa `PRAGMA journal_mode = WAL` e migracoes antes de qualquer run
- nao existe preflight explicito para gravabilidade do banco nem override para um caminho local/temporario durante testes do harness

## Evidencia de codigo

- `src/config/index.ts`
- `src/db/index.ts`
- `src/db/repo.ts`

## Criterios de aceite

- `msq run` deve falhar cedo com mensagem acionavel informando o caminho do banco quando o arquivo ou diretorio nao forem gravaveis.
- Deve existir um mecanismo suportado para override do banco global em execucoes locais de teste ou ambientes restritos.
- O fluxo deve ter teste automatizado cobrindo banco/read-only ou data dir sem permissao de escrita.
- Quando a persistencia falhar antes da primeira run, o CLI deve deixar claro que nenhum adapter chegou a ser executado.
