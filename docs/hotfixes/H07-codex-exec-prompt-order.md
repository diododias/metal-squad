# H07 — adapter `codex` passa o prompt antes das opcoes de `exec` e a CLI aborta o parse

**Tipo**: Hotfix  
**Status**: Resolvido  
**Prioridade**: Critica  
**Descoberto em**: 2026-07-06  
**Comando observado**: `MSQ_DB_PATH=$(pwd)/.metal-squad/app.db rtk node dist/index.js run --feature feat-25`

## Problema

Depois da falha do adapter `claude`, o harness trocou temporariamente `feat-25` para `tool: codex` e repetiu a validacao. A segunda run tambem falhou antes de qualquer implementacao real da feature.

- a run `2` foi persistida no banco local com `feature = feat-25`, `tool = codex`, `status = failed`
- nao houve tokens registrados
- nao houve diff de implementacao da feature; apenas o backlog temporario do harness ficou alterado
- o stderr final mostrou o proprio uso do CLI:
  - `Usage: codex exec [OPTIONS] [PROMPT]`
  - `unexpected argument '--- name: "speckit-specify" ...'`

## Evidencia observada

- `src/core/adapters/codex.ts` monta o comando como:
  - `codex exec <prompt> --json --skip-git-repo-check --full-auto ...`
- `codex exec --help` no ambiente local informa:
  - `Usage: codex exec [OPTIONS] [PROMPT]`
- o prompt construido para `feat-25` com skills Speckit comeca com:
  - `---`
  - `name: "speckit-specify"`
- com o prompt vindo antes das opcoes, a CLI tenta continuar parseando e aborta com argumento inesperado.

## Impacto

- o adapter `codex` pode falhar imediatamente em qualquer run cujo prompt rico seja passado antes das opcoes
- o fallback de adapter dentro do `msq-develop` nao consegue salvar a validacao
- o produto aparenta suportar `codex exec`, mas nao chega a exercitar o agente real

## Causa tecnica provavel

- o adapter assume uma ordem de argumentos diferente da exigida pelo CLI atual
- as opcoes (`--json`, `--skip-git-repo-check`, `--full-auto`, `-m`, `-c`) precisam vir antes do prompt posicional

## Lacuna de testes

- `rtk npx vitest run tests/adapters/misc.test.ts` passou, mas nao valida o contrato real do binario `codex`
- falta teste de integracao ou pelo menos teste de montagem de args compativel com `codex exec --help`

## Criterios de aceite

- O adapter `codex` deve montar `codex exec` com opcoes antes do prompt posicional, ou usar stdin conforme contrato suportado.
- Deve existir teste cobrindo a ordem correta de argumentos para `codex exec`.
- Uma nova validacao do `msq-develop` para `feat-25` deve iniciar execucao real do agente sem `unexpected argument '---'`.

## Resolucao

- `src/core/adapters/codex.ts`: movido o prompt de segunda posicao para apos todas as opcoes, com separador `--` antes do argumento posicional.
- `tests/adapters/misc.test.ts`: adicionado bloco `describe('codex adapter')` com testes de ordem de args e de effort flag.
