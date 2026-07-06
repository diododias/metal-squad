# H06 — adapter `claude` usa `-p` com contrato incorreto e quebra prompts iniciados por front matter

**Tipo**: Hotfix  
**Status**: Resolvido  
**Prioridade**: Critica  
**Descoberto em**: 2026-07-06  
**Comando observado**: `MSQ_DB_PATH=$(pwd)/.metal-squad/app.db rtk node dist/index.js run --feature feat-25`

## Problema

Ao validar a `F25` via `msq-develop` com `tool: claude`, a run falhou antes de qualquer implementacao real da feature.

- a run `1` foi persistida no banco local com `feature = feat-25`, `tool = claude`, `status = failed`
- nao houve tokens registrados
- nao houve diff de implementacao da feature; apenas o backlog temporario do harness permaneceu alterado no checkout
- o stderr final foi:
  - `error: unknown option '--- name: "speckit-specify" ...'`

## Evidencia observada

- `src/core/adapters/claude.ts` monta o comando como:
  - `claude -p <prompt> --output-format json --dangerously-skip-permissions ...`
- `claude --help` no ambiente local informa:
  - `-p, --print` apenas habilita modo nao interativo
  - o prompt e um argumento posicional: `claude [options] [prompt]`
- o prompt efetivamente construido para `feat-25` com skills Speckit comeca com front matter:
  - `---`
  - `name: "speckit-specify"`
- como o adapter assume que `-p` consome um valor, o CLI passa a interpretar o inicio do prompt como argumento/opcao invalida.

## Impacto

- qualquer run via adapter `claude` pode falhar antes de spawnar trabalho real do agente
- prompts ricos baseados em skills ficam especialmente vulneraveis porque comecam com `---`
- o `msq-develop` produz falso negativo operacional sem sequer exercitar a feature alvo

## Causa tecnica provavel

- o contrato real do CLI `claude` mudou ou nunca foi refletido corretamente no adapter/tests
- `-p/--print` e flag booleana, nao um argumento com valor
- o prompt precisa ser passado como argumento posicional depois das opcoes, ou via stdin em formato suportado

## Lacuna de testes

- `rtk npx vitest run tests/adapters/misc.test.ts` passou, mas o teste atual valida exatamente a ordem/forma incorreta:
  - `['-p', 'PROMPT', '--output-format', 'json', ...]`
- portanto a suite atual reforca um contrato falso e nao detecta a regressao real contra o binario instalado.

## Criterios de aceite

- O adapter `claude` deve montar a invocacao no formato aceito pelo CLI atual.
- Deve existir teste cobrindo o contrato real de `--print` com prompt posicional ou stdin.
- Uma nova validacao do `msq-develop` para `feat-25` deve criar run real e nao falhar com `unknown option '---'`.

## Resolucao

- `src/core/adapters/claude.ts`: substituido `-p <prompt>` por `--print -- <prompt>` — `--print` e flag booleana, `--` separa opcoes do argumento posicional e protege prompts que comecam com `---`.
- `tests/adapters/misc.test.ts`: corrigida a assertiva do contrato e adicionado teste especifico para prompts com front matter.
