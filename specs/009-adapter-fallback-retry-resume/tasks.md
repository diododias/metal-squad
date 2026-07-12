---

description: "Task list for feature implementation"
---

# Tasks: Adapter Fallback em Retry + Resume no Step que Falhou

**Input**: Design documents from `/specs/009-adapter-fallback-retry-resume/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/backlog-fallback-schema.md, contracts/cli-resume-override.md, quickstart.md

**Tests**: Included — este repo trata `rtk npm test` como parte da baseline obrigatoria de qualquer mudanca em `src/`/`tests/` (`.claude/rules/testing.md`), e `quickstart.md` desta feature lista suites focadas especificas por user story.

**Organization**: Tasks agrupadas por user story (spec.md) para permitir implementacao e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependencia)
- **[Story]**: US1, US2 ou US3 (mapeia para spec.md)
- Caminhos de arquivo exatos em cada descricao

## Path Conventions

Projeto CLI single-project existente: `src/`, `tests/` na raiz do repo (ver plan.md → Project Structure).

---

## Phase 1: Setup

**Purpose**: Garantir baseline verde antes de tocar `src/`/`tests/` (`.claude/rules/testing.md`)

- [X] T001 Rodar `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, `rtk npm run lint` na base atual (`develop`) e confirmar verde antes de iniciar qualquer alteracao

**Checkpoint**: Baseline confirmada — pode iniciar Foundational

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infra compartilhada por US1 (fallback) e US3 (visibilidade por tentativa) — o loop de retry precisa suportar multiplos candidatos e persistir `tool`/`model` por tentativa antes que qualquer user story possa ser implementada de forma independente

**⚠️ CRITICAL**: Nenhuma user story pode comecar antes desta fase estar completa

- [X] T002 [P] Migracao condicional `ALTER TABLE retry_history ADD COLUMN tool TEXT` / `ADD COLUMN model TEXT` (nullable) em `src/db/index.ts`, seguindo o idioma `PRAGMA table_info` + `ALTER TABLE` ja usado em `migrate()` (ver `runs`/`token_usage`/`task_runs` no mesmo arquivo)
- [X] T003 Estender `createRetryRecord(runId, attempt, error?, waitMs?, tool?, model?)` em `src/db/repo.ts` para persistir as novas colunas de T002 no `INSERT INTO retry_history`
- [X] T004 Refatorar `runWithRetry` em `src/core/runner/execute.ts` (linhas ~456-493) para iterar sobre uma lista interna de "candidatos" `[{ tool, model, effort, maxAttempts }]`, comecando com um unico candidato derivado de `feature.tool`/`feature.model`/`feature.effort`/`feature.retry.maxAttempts` — refactor estrutural puro (D2 de research.md), preservando exatamente o comportamento atual coberto por `tests/runner/execute.test.ts`; contador de `attempt` permanece global e crescente entre candidatos (nao reinicia por candidato)
- [X] T005 Atualizar a chamada a `createRetryRecord` dentro do loop de `runWithRetry` para passar `tool`/`model` do candidato corrente (depende de T003, T004)

**Checkpoint**: Foundation pronta — US1 e US2 podem comecar em paralelo; US3 depende de T002-T005 para ter dado a exibir

---

## Phase 3: User Story 1 - Fallback automatico de ferramenta apos esgotar tentativas (Priority: P1) 🎯 MVP

**Goal**: Quando a ferramenta primaria de uma feature esgota `retry.maxAttempts`, o runner tenta automaticamente as alternativas de `retry.fallback`, na ordem configurada, antes de aplicar `onFail`.

**Independent Test**: Configurar uma feature com `retry.fallback`, forcar falha da ferramenta primaria ate esgotar tentativas, verificar que a proxima ferramenta da lista assume automaticamente sem intervencao manual (spec.md linha 19).

### Tests for User Story 1

- [X] T006 [P] [US1] Testes em `tests/runner/execute.test.ts`: primaria esgota → tenta 1º fallback → esgota → tenta 2º fallback → sucesso; todos os fallbacks esgotam → aplica `onFail` (stop/continue/gate) igual ao comportamento sem fallback; `retry.fallback` ausente/vazio → comportamento identico ao atual (regressao zero, edge case spec.md linha 63)
- [X] T007 [P] [US1] Testes em `tests/backlog/schema.test.ts`: `FallbackAlternativeSchema`/`RetrySchema.fallback` — default `[]`, `maxAttempts` no range 1-10, `model`/`effort` opcionais, valido tanto em `BacklogV1Schema` quanto `BacklogV2Schema`

### Implementation for User Story 1

- [X] T008 [US1] Adicionar `FallbackAlternativeSchema = z.object({ tool: ToolSchema, model: z.string().optional(), effort: EffortSchema.optional(), maxAttempts: z.number().int().min(1).max(10).default(1) })` e `RetrySchema.fallback: z.array(FallbackAlternativeSchema).default([])` em `src/core/backlog/schema.ts`; exportar `type FallbackAlternative`
- [X] T009 [US1] Em `runWithRetry` (`src/core/runner/execute.ts`), apos o candidato primario esgotar, anexar cada entrada de `feature.retry.fallback` como candidato adicional — `tool` obrigatorio, `model ?? feature.model`, `effort ?? feature.effort`, `maxAttempts ?? 1` — construindo uma `Feature` efetiva por candidato sem mutar `feature` original nem `backlog.yaml`/catalogo (depende de T004, T008)
- [X] T010 [US1] Garantir que `getOnFailPolicy`/`createGate` em `runWithRetry` só disparam depois que **todos** os candidatos (primaria + fallbacks) esgotarem, nao apos o primeiro (depende de T009)
- [X] T011 [US1] Quando o candidato vencedor (ou o ultimo, se todos falharem) usa `tool` diferente de `feature.tool`, atualizar a coluna `runs.tool` dessa run — nova funcao em `src/db/repo.ts` (ex.: `updateRunTool(runId, tool)`), chamada a partir de `src/core/runner/execute.ts` (depende de T009)
- [X] T012 [P] [US1] Testes em `tests/db/repo.test.ts` para `createRetryRecord` persistindo `tool`/`model` e para `updateRunTool` atualizando `runs.tool` quando o candidato vencedor difere do original

**Checkpoint**: US1 completa e testavel de forma independente — fallback automatico funcionando fim a fim

---

## Phase 4: User Story 2 - Retomar a mesma execucao trocando ferramenta pontualmente (Priority: P1)

**Goal**: `msq resume <target> --tool/--model/--effort` retoma a mesma pipeline/run trocando ferramenta/modelo apenas para aquela retomada, sem alterar `backlog.yaml`/catalogo e sem repetir etapas ja concluidas.

**Independent Test**: Retomar uma execucao pausada informando ferramenta/modelo diferentes, verificar que a mesma execucao (mesmo id) continua usando a alternativa, sem reiniciar partes ja concluidas (spec.md linha 35).

### Tests for User Story 2

- [X] T013 [P] [US2] Testes em `tests/commands/commands.test.ts`: `msq resume --tool/--model/--effort` com override valido (mensagem de override exibida, `backlog.yaml`/catalogo inalterados); `--tool` fora do enum `Tool` rejeitado antes de tocar DB; `--tool` valido mas indisponivel no ambiente rejeitado com mensagem clara, run nao criada, pipeline permanece pausada; resume sobre pipeline ja `done` imprime "nada para retomar" sem chamar `executeBacklog`
- [X] T014 [P] [US2] Testes em `tests/runner/execute.test.ts`: `ExecuteOptions.resumeOverride` aplicado apenas ao candidato inicial da `featureId` alvo, outras features `pending` no mesmo pipeline continuam usando a config persistida do backlog (FR-007)

### Implementation for User Story 2

- [X] T015 [P] [US2] Adicionar `isAvailable?(): boolean` opcional a `ToolAdapter` em `src/core/adapters/types.ts`; implementar em `src/core/adapters/claude.ts`, `src/core/adapters/codex.ts`, `src/core/adapters/opencode.ts` (checagem de binario disponivel no ambiente, ex.: reaproveitando `runCli`/spawn ja existente em `src/core/adapters/spawn.ts` para uma verificacao rapida e sincrona/rejeitavel)
- [X] T016 [US2] Adicionar `resumeOverride?: { featureId: string; tool?: Tool; model?: string; effort?: Effort }` a `ExecuteOptions` em `src/core/runner/execute.ts`; aplicar como override do candidato inicial de `runWithRetry` somente quando `feature.id === resumeOverride.featureId` (depende de T004, T015)
- [X] T017 [US2] Adicionar opcoes `--tool <claude|codex|opencode>`, `--model <string>`, `--effort <low|medium|high>` a `msq resume` em `src/commands/resume.ts`; antes de chamar `executeBacklog`, validar `--tool` (se informado) via `getAdapter(tool)` + `isAvailable()` — se invalido/indisponivel, abortar com mensagem clara sem tocar `pausePipeline`/`resumePipeline`/criar run (FR-012, depende de T015)
- [X] T018 [US2] Em `src/commands/resume.ts`, quando `snapshot.pending`+`snapshot.active`+`snapshot.aborted` estiverem vazios, imprimir `Pipeline N já concluída — nada para retomar.` e nao chamar `executeBacklog` (FR-013)
- [X] T019 [US2] Passar as novas flags de `src/commands/resume.ts` para `executeBacklog(backlog, { ..., resumeOverride: { featureId, tool, model, effort } })`, resolvendo `featureId` como a feature `active`/bloqueada/em gate do snapshot; imprimir linha de override ativo (`Override pontual: tool=X (persistido continua Y).`) quando presente (depende de T016, T017)

**Checkpoint**: US1 e US2 completas e testaveis de forma independente

---

## Phase 5: User Story 3 - Visibilidade do custo real acumulado da execucao (Priority: P2)

**Goal**: O operador consegue ver, por consulta de status, qual ferramenta/modelo foi usado em cada tentativa e o total de uso acumulado real de uma execucao (incluindo tentativas falhas).

**Independent Test**: Executar uma feature que falha uma vez e conclui via fallback, verificar que o total de uso exibido soma o consumo de ambas as tentativas (spec.md linha 51).

### Tests for User Story 3

- [X] T020 [P] [US3] Testes em `tests/db/repo.test.ts` para a nova query de historico por tentativa (T021): retorna `tool`/`model` por linha, linhas legadas com `tool`/`model` `NULL` sao distinguiveis ("nao registrado") de "nao aplicavel"; soma de `token_usage.total` por `run_id` reflete todas as tentativas (falhas + sucesso)
- [X] T021 [P] [US3] Testes em `tests/commands/commands.test.ts` para `msq status` exibindo ferramenta/modelo por tentativa e total acumulado por run

### Implementation for User Story 3

- [X] T022 [US3] Adicionar `listRetryHistory(runId: number): RetryHistoryRow[]` a `src/db/repo.ts` (colunas `attempt`, `error`, `retried_at`, `tool`, `model`; `tool`/`model` `null` para linhas legadas) — usa as colunas de T002
- [X] T023 [US3] Estender `msq status` (`src/commands/status.ts`) para imprimir, por run com tentativas, uma tabela de tentativas (`attempt`, `tool`, `model`, `error`) usando T022, exibindo `nao registrado` quando `tool`/`model` forem `NULL` (depende de T022)
- [X] T024 [US3] Confirmar/expor no output de `msq status` o total acumulado de uso por run (`runs.total_tokens`, ja somado via `recordUsage`/`token_usage` em todas as tentativas do mesmo `run_id`) ao lado da tabela de tentativas de T023 (depende de T023)

**Checkpoint**: US1, US2 e US3 completas e testaveis de forma independente

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validacao final e consistencia de documentacao

- [X] T025 [P] Rodar suites focadas de `quickstart.md` secao 1: `rtk npx vitest run tests/backlog/load-prompt.test.ts tests/runner/execute.test.ts tests/adapters/codex.test.ts tests/adapters/misc.test.ts tests/db/repo.test.ts tests/commands/commands.test.ts`
- [X] T026 [P] Executar cenarios 1-3 e edge cases de `specs/009-adapter-fallback-retry-resume/quickstart.md` (validacao live/simulada, `.claude/rules/harness.md`) e registrar evidencias (run persistida, output/summary, diff)
- [X] T027 Confirmar `docs/features/F39-adapter-fallback-resume.md` continua consistente com o comportamento implementado (`.claude/rules/repo-context.md` — codigo e docs de feature no mesmo branch)
- [X] T028 Rodar baseline completa: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`, `rtk npm run lint`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependencias — pode comecar imediatamente
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA US1 e US3 (T004 é pre-requisito estrutural do candidato-loop usado tanto pelo fallback de US1 quanto pelo override de US2)
- **User Stories (Phase 3-5)**: todas dependem do Foundational completo
  - US1 (T006-T012) e US2 (T013-T019) podem rodar em paralelo — tocam arquivos parcialmente sobrepostos em `execute.ts`, mas em blocos logicos distintos (fallback vs. resumeOverride); coordenar merge de `runWithRetry`/`ExecuteOptions`
  - US3 (T020-T024) depende apenas do Foundational (T002-T005), nao de US1/US2, mas o cenario de validacao mais rico (quickstart.md secao 4) reaproveita a run de US1
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas

### User Story Dependencies

- **US1 (P1)**: depende de Foundational — sem dependencia de US2/US3
- **US2 (P1)**: depende de Foundational — sem dependencia de US1/US3 (mas reaproveita o mesmo candidato inicial de `runWithRetry` de T004, sem reescrever o mecanismo de fallback)
- **US3 (P2)**: depende de Foundational — sem dependencia de US1/US2 para ser implementada, mas seu teste independente mais completo (soma de tentativas falhas + sucesso) fica mais facil de demonstrar apos US1 existir

### Within Each User Story

- Testes antes da implementacao equivalente (escrever e falhar antes de implementar)
- Schema/DB antes de runner
- Runner antes de CLI/status
- Story completa antes de avancar para a proxima prioridade

### Parallel Opportunities

- T002 (DB) pode rodar em paralelo com nada mais no Foundational (T003-T005 dependem dele em cadeia)
- Apos Foundational: US1 e US2 em paralelo (times/agentes diferentes); US3 pode comecar junto se so depender de T002-T005
- Dentro de US1: T006/T007 (testes) em paralelo entre si; T012 (testes de DB) em paralelo com T010/T011 de arquivos distintos
- Dentro de US2: T013/T014 (testes) em paralelo; T015 (adapters) em paralelo com T013/T014
- Dentro de US3: T020/T021 (testes) em paralelo entre si

---

## Parallel Example: User Story 1

```bash
# Testes de US1 em paralelo:
Task: "Testes de fallback progression em tests/runner/execute.test.ts"
Task: "Testes de FallbackAlternativeSchema em tests/backlog/schema.test.ts"

# Depois da implementacao principal, teste de DB em paralelo com o resto:
Task: "Testes de createRetryRecord/updateRunTool em tests/db/repo.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRITICO — bloqueia US1/US3)
3. Completar Phase 3: US1 (fallback automatico)
4. **PARAR e VALIDAR**: testar US1 de forma independente (quickstart.md secao 2)
5. Entregar/demo se pronto

### Incremental Delivery

1. Setup + Foundational → fundacao pronta
2. US1 (fallback automatico) → testar independente → demo (MVP!)
3. US2 (resume com override) → testar independente → demo
4. US3 (visibilidade de custo acumulado) → testar independente → demo
5. Polish (validacao completa + docs) → fechar a feature

---

## Notes

- `[P]` = arquivos diferentes, sem dependencia entre si
- `[Story]` mapeia cada task para US1/US2/US3 (rastreabilidade)
- Verificar que os testes falham antes de implementar
- Commitar apos cada task ou grupo logico coerente (`.claude/rules/git-workflow.md`)
- T004 é a unica task verdadeiramente compartilhada por US1 e US2 — tratar como fronteira de merge cuidadosa se forem trabalhadas em paralelo
