# Feature Specification: Saneamento de telemetria de tokens

**Feature Branch**: `feat/ana01-token-telemetry-sanitization`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M1  
**Depende de**: ANA-00

## Objetivo

Garantir que tokens gravados em runs e task runs sejam numericamente coerentes,
auditáveis e seguros para agregação. Analytics não deve precisar compensar dados
inválidos no front.

## Contexto de execução

O DB atual já guarda `runs.input_tokens`, `runs.cached_input_tokens`,
`runs.output_tokens`, `runs.total_tokens`, `task_runs.*_tokens` e `token_usage`.
Durante inspeção foram vistos `input_tokens` negativos em runs antigas, com
`cached_input_tokens` alto. Isso provavelmente vem de diferença entre total de
input bruto e cache, ou de delta aplicado em shape diferente por adapter.

### Estado atual no código (verificado 2026-07-23)

- Divergência de nomes a tratar: `runs` usa `input_tokens/cached_input_tokens/
  output_tokens/total_tokens`; `token_usage` usa `input/cached_input/output/
  total`; `task_runs` usa `*_tokens`. A normalização precisa cobrir os três shapes.
- `listRunsForStats` faz `COALESCE(runs.*, token_usage.*)` pegando o snapshot de
  `MAX(id)` por `run_id`. Um componente negativo em qualquer dos dois vaza para o
  agregado — a validação precisa acontecer na escrita e ser auditável na leitura.
- `runs.total_tokens`, `input_tokens` etc. são `INTEGER` nullable (sem `CHECK`);
  `token_usage`/`task_runs` têm `NOT NULL DEFAULT 0`. Isso já cria ambiguidade
  entre "sem telemetria" (null) e "zero real" que a spec deve preservar.
- A semântica canônica (relação total×breakdown, `cache_ratio`) vem de
  [[ANA-00]]; esta feature implementa e valida, não redecide.

## Requirements

- Normalizar a semântica de token: componentes individuais nunca negativos.
- Separar claramente input bruto, cached input e billable/uncached input se o
  adapter fornecer essas categorias.
- Preservar o payload bruto de usage em evento/snapshot auditável quando houver
  transformação.
- Validar invariantes antes de persistir: `total >= 0`, componentes `>= 0` e
  relação documentada entre total e breakdown.
- Criar verificador de qualidade para histórico: conta rows negativos, nulos,
  total menor que componentes e runs sem usage.
- Expor `dataQuality` para Analytics: `valid`, `corrected`, `invalid`, `unknown`.
- Backfill não-destrutivo: nunca reescrever histórico sem backup; preferir
  nova coluna/flag de qualidade ou relatório migratório.

## Arquivos afetados

- `src/db/repo.ts` — persistência de usage e leitura de stats.
- `src/core/runner/execute.ts` — normalização do usage recebido do adapter.
- `src/core/adapters/*` — contrato de usage por tool, se necessário.
- `src/core/stats.ts` — agregação (`computeStats`, `aggregateTokens`) deve
  respeitar qualidade de dados.
- `tests/db/repo.test.ts` e/ou `tests/runner/execute.test.ts` — invariantes.
- `docs/adr/ADR-002-metricas-tokens-analytics.md` — link para decisões (ver [[ANA-00]]).

## Fora de escopo

- Reescrever histórico existente (backfill é não-destrutivo; usar flag/coluna de
  qualidade ou relatório, nunca `UPDATE` destrutivo — ROADMAP "Fora de escopo").
- Snapshot de modelo/effort (é [[ANA-02]]).

## Success Criteria

- Nova run com cache alto não gera componente negativo.
- Fixture com payloads de Claude/Codex/OpenCode prova a normalização nos três
  shapes (`runs`, `token_usage`, `task_runs`).
- `null` (sem telemetria) e `0` (zero medido) permanecem distinguíveis após
  normalização.
- Histórico inválido aparece como data quality issue, não como gráfico silencioso.
- Teste cobre regressão de delta/snapshot em `token_usage` e `task_runs`.

## Validação

Mudança em `src/` + DB (ver `testing.md`/`harness.md`):

```bash
rtk npm run build && rtk npm test && rtk npm run typecheck && rtk npm run lint
rtk npx vitest run tests/db/repo.test.ts tests/runner/execute.test.ts
```

Migração/backfill é operação real explícita (`npm run migrate:db`), nunca no
`build`; validar sob banco sandbox (`scripts/with-sandbox-db.mjs`).
