# Feature Specification: Snapshots de modelo, effort e perfil de custo na run

**Feature Branch**: `feat/ana02-run-model-cost-snapshots`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M1  
**Depende de**: ANA-00, ANA-01

## Objetivo

Registrar na própria run os metadados usados na execução para permitir gráficos
confiáveis por modelo, effort, thinking e perfil de custo, mesmo se a configuração
da feature ou do tool mudar depois.

## Contexto de execução

`runs` registra `tool`, mas não registra `model`/`effort` por run. Há referência
no código indicando que histórico por modelo não é exato hoje. O épico de
Settings também evolui registry de tools e defaults; Analytics precisa consumir
o snapshot efetivo, não o valor atual do backlog.

### Estado atual no código (verificado 2026-07-23)

- `INSERT INTO runs (...)` grava só `repo_id, project_id, feature_id, tool,
  pipeline_id, stage` — sem `model`/`effort`/`thinking`/`pricing`.
- `retry_history` **já** recebeu colunas `tool` e `model` por migração
  (`ensureRetryHistoryColumn`), então é a fonte primária de backfill `derived`
  para o executor real de tentativas, junto de `backlog_features.data_json`.
- `backlog_epics` e `backlog_features` têm `project_id`/`epic_id`; a run só tem
  `feature_id` + `project_id`. O snapshot de modelo deve morar na `runs` (ou tabela
  1:1) para não depender de join com backlog que pode ter mudado depois.
- `StatsRunRow` (`src/db/repo.ts`) hoje não expõe modelo; o campo novo precisa
  entrar aqui e no shape de leitura para chegar ao Analytics.

## Requirements

- Adicionar snapshot por run: `model`, `effort`, `thinking`, `tool_name` opcional,
  `tool_version` opcional, `pricing_profile_id` opcional e `metrics_confidence`.
- Persistir o snapshot no momento de criação da run, após resolução de overrides
  e fallback de tool/model.
- Atualizar retry/fallback para gravar o executor real vencedor, preservando o
  histórico de tentativas.
- Backfill histórico best-effort a partir de `backlog_features.data_json`,
  `retry_history`, run events ou defaults, sempre marcando `derived`.
- Expor `unknown` quando não houver evidência suficiente.
- Não depender do estado atual da feature para classificar run antiga.

## Arquivos afetados

- `src/db/index.ts` — migração de schema e índices.
- `src/db/repo.ts` — criação/listagem de runs e stats.
- `src/core/runner/execute.ts` — resolução efetiva de tool/model/effort.
- `src/core/notify/resume-override.ts` e `src/commands/resume.ts` — overrides.
- `tests/runner/execute.test.ts` — snapshot com override/fallback.
- `tests/db/repo.test.ts` e `tests/db/index-migrate.test.ts` — migração e backfill.
- `src/db/backfill.ts` — reaproveitar o módulo de backfill existente para o
  derive histórico (não criar caminho paralelo).

## Fora de escopo

- Cobrança monetária real por modelo (opcional em [[ANA-10]]).
- Rename das tabelas legadas `backlog_features`/`feature_id` (ROADMAP fora de escopo).

## Success Criteria

- Run nova mostra modelo real usado sem consultar backlog atual.
- Resume com `--tool/--model/--effort` grava override efetivo.
- Fallback registra a tentativa vencedora (via `retry_history`) e não perde o
  histórico original das tentativas.
- Run antiga sem evidência em `retry_history`/`data_json` fica `unknown`, não é
  classificada pelo estado atual da feature.
- Analytics consegue agrupar por modelo com `exact|derived|unknown`.

## Validação

Mudança em `src/` + migração (ver `testing.md`/`harness.md`):

```bash
rtk npm run build && rtk npm test && rtk npm run typecheck && rtk npm run lint
rtk npx vitest run tests/runner/execute.test.ts tests/db/repo.test.ts tests/db/index-migrate.test.ts
rtk npx vitest run tests/core/notify-resume-override.test.ts
```
