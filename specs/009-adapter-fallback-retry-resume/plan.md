# Implementation Plan: Adapter Fallback em Retry + Resume no Step que Falhou

**Branch**: `009-adapter-fallback-retry-resume` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-adapter-fallback-retry-resume/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Quando a ferramenta primaria de uma feature esgota `retry.maxAttempts`, o `msq` deve tentar automaticamente ferramentas alternativas configuradas (`fallback`) antes de aplicar `onFail` (stop/continue/gate) — e o operador deve poder retomar uma pipeline pausada/em gate trocando `tool`/`model`/`effort` apenas para essa retomada, sem alterar `backlog.yaml`, reexecutando somente o step pendente/falho e preservando o uso total acumulado (incluindo tentativas falhas) na consulta de status.

Abordagem tecnica: estender `RetrySchema` com uma lista ordenada `fallback: FallbackAlternativeSchema[]` (tool + model/effort/maxAttempts opcionais); fazer `runWithRetry` em `src/core/runner/execute.ts` iterar sobre `[primaria, ...fallback]` em vez de repetir sempre o mesmo adapter, registrando `tool`/`model` usados em cada tentativa via extensao de `retry_history`; expor `msq resume <target> --tool --model --effort` que passa um override pontual (nao persistido) apenas para o run que estava ativo/pausado/em gate daquele pipeline; agregar `token_usage` por `run_id` (ja soma todas as tentativas de um mesmo run) e expor tool/model por tentativa nas queries de `status`.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js >= 20.17.0 (ESM, `type: module`)

**Primary Dependencies**: `commander` (CLI), `zod` (schema/validacao de backlog), `better-sqlite3` (persistencia sincrona), `ink`/`react` (TUI), `yaml`

**Storage**: SQLite via `better-sqlite3`, arquivo unico gerenciado por `src/db/index.ts` (migracoes idempotentes com `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` condicional)

**Testing**: `vitest` (`rtk npm test`), suites focadas por area em `tests/` (`tests/runner/execute.test.ts`, `tests/adapters/*.test.ts`, `tests/db/*.test.ts`, `tests/commands/commands.test.ts`)

**Target Platform**: CLI Node.js local (macOS/Linux dev machines), sem servidor

**Project Type**: CLI single-project (nao ha frontend/backend separados; TUI Ink roda no mesmo processo)

**Performance Goals**: Sem meta de throughput; fallback e resume sao operacoes pontuais (poucas por hora) — a restricao real e nao perder rastreio de tokens/estado ja acumulado, nao velocidade

**Constraints**: Nao alterar contrato de `backlog.yaml` de forma que quebre backlogs existentes sem `fallback` configurado (retrocompatibilidade); nao criar nova run/pipeline ao retomar (mesmo `pipeline_id`/`run_id` semantico); nao consumir uso ao rejeitar ferramenta indisponivel no resume

**Scale/Scope**: Escopo interno de uma unica instalacao do `msq` por operador/projeto; volume de runs e o mesmo de hoje (dezenas por pipeline)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` neste repo ainda e o template placeholder do spec-kit (nao ratificado — ver `docs/hotfixes`/`repo-context.md`: apenas `docs/ARCHITECTURE.md` e explicitamente marcado como placeholder, mas `constitution.md` tambem nunca foi preenchido). Na ausencia de uma constituicao ratificada, este plano usa `.claude/rules/architecture.md` como gate de arquitetura efetivo do repo:

- **Ownership por pasta**: mudancas ficam contidas em `src/core/backlog/` (schema), `src/core/runner/` (retry/fallback), `src/db/` (schema/queries de attempts), `src/commands/` (flags de resume), `src/core/adapters/` (nenhuma mudanca de contrato do `ToolAdapter`, so como e chamado). PASS.
- **Sem SQL inline em commands/UI**: novas colunas/queries de `retry_history` ficam em `src/db/repo.ts`/`src/db/index.ts`; `src/commands/resume.ts` so passa flags adiante. PASS.
- **Reuso de erros tipados / mecanismo de gate existente**: FR-008 exige reaproveitar o mesmo mecanismo de troca tool/model tanto no fallback automatico quanto na resolucao de budget gate — isso e um requisito explicito de nao duplicar logica, alinhado ao antipadrao "duplicar regras... em mais de um modulo". PASS, e checagem ativa durante Phase 1.
- **Contrato de backlog**: qualquer mudanca de contrato do backlog exige ajustar schema, loader e prompt builder juntos — `fallback` e um campo novo opcional em `RetrySchema`, nao deve exigir mudanca em `prompt.ts` (nao afeta o prompt enviado ao adapter). PASS.

Nenhuma violacao identificada. Nao ha necessidade de preencher Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/009-adapter-fallback-retry-resume/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── backlog-fallback-schema.md
│   └── cli-resume-override.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── resume.ts            # + flags --tool/--model/--effort (override pontual de resume)
├── core/
│   ├── backlog/
│   │   └── schema.ts         # + FallbackAlternativeSchema, RetrySchema.fallback
│   ├── runner/
│   │   └── execute.ts        # runWithRetry itera [primaria, ...fallback]; resume override plumbing
│   ├── adapters/
│   │   ├── index.ts          # getAdapter(tool) já cobre troca de adapter por tentativa
│   │   └── types.ts          # RunFeatureOptions ganha override opcional de model/effort
│   └── events/                # eventos existentes (run:start/done/failed) passam tool/model usados
├── db/
│   ├── index.ts               # migração: retry_history.tool/model; runs.resumed_with_tool/model (nullable)
│   └── repo.ts                # createRetryRecord(tool, model), queries de status por tentativa
└── ui/
    └── (consumo read-only das novas colunas em telas de status, se aplicável)

tests/
├── runner/execute.test.ts     # fallback avança lista, onFail preservado ao esgotar fallback
├── adapters/*.test.ts         # RunFeatureOptions com override de model/effort
├── db/repo.test.ts            # retry_history com tool/model, soma de token_usage por run
└── commands/commands.test.ts  # msq resume --tool/--model/--effort
```

**Structure Decision**: Projeto CLI single-project existente (`src/`, `tests/`) — a feature nao introduz novo projeto/pacote nem estrutura frontend/backend; e uma extensao vertical de tres camadas ja existentes (`backlog` → `runner` → `db`) mais um novo par de flags em `commands/resume.ts`, seguindo o ownership por pasta ja documentado em `.claude/rules/architecture.md`.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Nenhuma violacao — secao nao aplicavel.
