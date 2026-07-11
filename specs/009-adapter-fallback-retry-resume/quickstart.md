# Quickstart: Validar Adapter Fallback + Resume no Step que Falhou

Guia de validacao ponta-a-ponta desta feature, apos a implementacao. Segue `.claude/rules/harness.md` (banco global, sem `MSQ_DB_PATH` salvo se o global falhar) e `.claude/rules/testing.md`.

## Pre-requisitos

- Build atualizado: `rtk npm run build`
- Pelo menos duas ferramentas de adapter disponiveis no ambiente para o teste de fallback real (ex.: `claude` e `codex` configurados); se so uma estiver disponivel, use o teste unitario/simulado (secao 3) em vez do live.

## 1. Suites automatizadas (obrigatorio antes de qualquer validacao live)

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

Suites focadas relevantes a esta feature:

```bash
rtk npx vitest run tests/backlog/load-prompt.test.ts tests/runner/execute.test.ts tests/adapters/codex.test.ts tests/adapters/misc.test.ts tests/db/repo.test.ts tests/commands/commands.test.ts
```

## 2. Cenario 1 — Fallback automatico apos esgotar tentativas (US1)

1. Criar/editar uma feature de teste no backlog com:
   ```yaml
   retry:
     maxAttempts: 2
     onFail: stop
     fallback:
       - tool: <ferramenta alternativa disponivel>
         maxAttempts: 1
   ```
2. Forcar falha da ferramenta primaria (ex.: apontar `model` invalido, ou usar um adapter mock/fixture ja usado em `tests/adapters/` para simular erro determinístico).
3. Rodar `msq run --feature <feature-id>` no banco global (sem `MSQ_DB_PATH`), a menos que o global esteja indisponivel.
4. Verificar (minimo 2 evidencias, idealmente 3, por `.claude/rules/harness.md`):
   - `msq status --limit 5` mostra a run concluida (ou bloqueada, se o fallback tambem falhar) e, na consulta de tentativas, a ferramenta alternativa aparece registrada em pelo menos uma tentativa.
   - Consulta direta a `retry_history` (via suite `tests/db/repo.test.ts` ou inspecao pontual) mostra `tool`/`model` preenchidos por tentativa.
   - Se a alternativa teve sucesso, a run final nao aplica `onFail: stop` (feature nao fica `failed`).

## 3. Cenario 2 — Resume com override pontual (US2)

1. Pausar uma pipeline (via gate `onFail: gate` ou budget) numa feature com multiplas stages, tendo pelo menos uma stage ja `done`.
2. Rodar:
   ```bash
   msq resume <feature-id> --tool <ferramenta alternativa> --model <modelo-alternativo>
   ```
3. Verificar:
   - A mensagem de resume lista `done=[...]` preservando as stages ja concluidas (nao reexecutadas).
   - `msq status` mostra a **mesma** run/pipeline id continuando (nao uma nova pipeline).
   - Apos o resume terminar (sucesso ou nao), o `backlog.yaml`/catalogo do projeto continuam com o `tool`/`model` originais (override nao foi persistido) — conferir com `git diff` (se `backlog.yaml` estiver versionado) ou reconsultando o catalogo.

## 4. Cenario 3 — Uso total acumulado (US3)

1. Reaproveitar a run do Cenario 1 (que teve pelo menos uma tentativa falha antes de suceder via fallback).
2. Consultar o total de uso dessa run (status/painel ou query direta a `token_usage`/`runs`).
3. Verificar que o total exibido e a soma de todas as tentativas (falha + sucesso), nao so da tentativa final — comparar com a soma manual das linhas de `token_usage` para aquele `run_id`.

## 5. Edge cases minimos a exercitar

- `retry.fallback` ausente/vazio ⇒ comportamento identico ao atual (sem regressao) — coberto pela suite automatizada, nao precisa de validacao live dedicada.
- `msq resume <feature-id> --tool <ferramenta-nao-instalada>` ⇒ deve rejeitar antes de criar run, pipeline continua pausada.
- `msq resume <feature-id>` numa pipeline ja `done` ⇒ deve informar que nao ha nada pendente, sem duplicar trabalho.

## Criterio de sucesso da validacao

Todos os itens das secoes 2-5 observados com evidencia concreta (run persistida, output/summary, diff/consulta de DB) — nao considerar a feature validada so porque `msq run`/`msq resume` saiu com exit code 0.
