# Tasks: Perguntas Interativas via Telegram (Botoes)

**Input**: Design documents from `/specs/012-telegram-interactive-questions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/control-signal-format.md, contracts/telegram-notification-dispatch.md, quickstart.md

**Tests**: Included — `quickstart.md` treats the focused test suites as "evidencia minima" obrigatoria (`.claude/rules/harness.md`), e `.claude/rules/testing.md` exige baseline de build/test/typecheck/lint para mudancas em `src/`/`tests/`.

**Organization**: Tasks are grouped by user story (P1/P2/P3 de `spec.md`) para permitir implementacao e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivo diferente, sem dependencia direta dentro do mesmo grupo)
- **[Story]**: US1, US2 ou US3 — mapeia para as user stories de `spec.md`
- Caminhos de arquivo exatos em cada descricao

## Path Conventions

Single project existente (`msq` CLI) — `src/`, `tests/` na raiz do repo. Nenhum diretorio novo; extensao localizada de 5 modulos ja mapeados (`adapters`, `runner`, `db`, `events`, `notify`) conforme `plan.md`.

---

## Phase 1: Setup

**Purpose**: Confirmar que o baseline esta verde antes de tocar qualquer arquivo.

- [X] T001 Rodar baseline completo (`rtk npm run build && rtk npm test && rtk npm run typecheck && rtk npm run lint`) e confirmar que passa sem erros antes de iniciar qualquer mudanca (`.claude/rules/testing.md`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Coluna nova em `stage_requests` + tipos que todas as user stories consomem (`RunControl.options`, `StageRequestCreatedEvent.options`, `StageRequestRow`/`createStageRequest`/`getStageRequest` cientes de `options`).

**⚠️ CRITICAL**: Nenhuma user story pode comecar antes desta fase terminar.

- [X] T002 [P] Adicionar coluna nullable `options TEXT` em `stage_requests` via migracao `ALTER TABLE`, seguindo o padrao `ensure*Column` ja usado (`ensureTaskRunColumn`/`ensurePipelineColumn`/`ensureRetryHistoryColumn`) em src/db/index.ts
- [X] T003 [P] Estender `RunControlNeedsInput` com `options?: string[]` (rotulos na ordem apresentada pela IA) em src/core/adapters/types.ts
- [X] T004 [P] Estender `StageRequestCreatedEvent` com `options?: string[]` em src/core/events/types.ts
- [X] T005 Estender `StageRequestRow` (`options?: string[] | null`), `createStageRequest` (novo `opts.options?: string[]`, serializado como JSON na coluna nova e incluido no payload emitido para `stage:request-created`) e `getStageRequest` (deserializa a coluna `options` de volta para `string[] | undefined`) em src/db/repo.ts (depende de T002, T004)
- [X] T006 [P] Estender testes de migracao para a nova coluna `options` (coluna existe, default `NULL`, idempotente em segunda chamada de `migrate`) em tests/db/index-migrate.test.ts (depende de T002)
- [X] T007 [P] Estender testes de round-trip de `options` (`createStageRequest` com/sem `options` → `getStageRequest` retorna `string[]`/`undefined` corretamente; evento emitido carrega `options`) em tests/db/repo.test.ts e tests/db/repo-extended.test.ts (depende de T005)

**Checkpoint**: Coluna e tipos prontos — as user stories podem comecar.

---

## Phase 3: User Story 1 - Responder pergunta da IA com um toque (Priority: P1) 🎯 MVP

**Goal**: Uma pergunta de esclarecimento da IA com opcoes discretas chega ao Telegram como botoes (um por opcao real), e tocar num botao produz o mesmo efeito observavel que a resposta livre por texto equivalente.

**Independent Test**: Disparar um step que gere `MSQ_INPUT_REQUIRED: <pergunta>` + bloco `OPTIONS:` valido, confirmar que a notificacao Telegram chega com um botao por opcao (rotulos identicos ao output da IA), tocar num botao e confirmar que `stage_requests` resolve com o rotulo escolhido e o step continua.

### Tests for User Story 1

> Escrever estes testes primeiro; eles devem falhar antes da implementacao correspondente.

- [X] T008 [P] [US1] Testes de extracao valida do bloco `OPTIONS:` (1-8 opcoes, ordem preservada, `prompt` fica sem o bloco `OPTIONS:` cru) em tests/core/control.test.ts
- [X] T009 [P] [US1] Testes de fallback do bloco `OPTIONS:` invalido (nenhuma linha `-`, mais de 8 opcoes, rotulo vazio ou > 60 caracteres, rotulos duplicados → `options` ausente, `prompt` = texto integral original) em tests/core/control.test.ts
- [X] T010 [P] [US1] Teste garantindo que `executeStagedFeature` propaga `res.control.options` para a chamada `createStageRequest(..., { runId })` no caminho `needs_input` em tests/runner/execute.test.ts
- [X] T011 [P] [US1] Teste garantindo que `stage:request-created` com `kind:'input'` e `options` presente monta `reply_markup.inline_keyboard` (um botao por opcao, `callback_data: input:<requestId>:<index>`) e omite a linha `Reply: input:<id> <text>` da mensagem em tests/core/events-notifications.test.ts
- [X] T012 [P] [US1] Teste garantindo que um callback `input:<id>:<index>` resolve `options[index]` via `getStageRequest(id)` e chama `resolveStageRequest(id, label)` em tests/core/notify-telegram-poller.test.ts

### Implementation for User Story 1

- [X] T013 [US1] Estender `parseControlSignal` para detectar o bloco `OPTIONS:` conforme a gramatica de `contracts/control-signal-format.md` (marcador de linha `OPTIONS:` case-insensitive; linhas `- <rotulo>` ate a primeira linha que nao comeca com `-`; validar `1 <= options.length <= 8`, `1 <= label.length <= 60`, sem duplicata exata; em qualquer violacao, `options` fica `undefined` e `prompt` preserva o texto integral original) em src/core/adapters/control.ts (depende de T003; faz T008/T009 passarem)
- [X] T014 [US1] Instruir o formato `OPTIONS:` no `buildStagePrompt` (nova linha apos a instrucao existente de `MSQ_INPUT_REQUIRED:` em `stageNotes`) em src/core/runner/execute.ts
- [X] T015 [US1] Propagar `res.control.options` na chamada `createStageRequest(pipelineId, feature.id, stage, 'input', res.control.prompt, { runId, options: res.control.options })` em src/core/runner/execute.ts (linha ~619-627) (depende de T005, T013; faz T010 passar)
- [X] T016 [US1] Montar `reply_markup.inline_keyboard` (um botao por opcao, `callback_data: 'input:' + requestId + ':' + index`) no branch `kind === 'input'` de `stage:request-created` quando `options` presente e nao-vazio, omitindo a linha `Reply: input:<id> <text>` nesse caso; manter o comportamento atual (texto livre, sem `reply_markup`) quando `options` ausente, em src/core/events/notifications.ts (depende de T004, T005; faz T011 passar)
- [X] T017 [US1] Adicionar reconhecimento de `input:<id>:<index>` (novo regex, ex. `/^input:(\d+):(\d+)$/`) em `TelegramPoller`: resolver `options[index]` via `getStageRequest(requestId)`, chamar `resolveStageRequest(requestId, label)` quando o indice e valido e o pedido ainda esta `pending`; nao escrever nada quando o indice e invalido ou o pedido ja foi resolvido; chamar `answerCallback` incondicionalmente quando houver `callback_query.id`, em src/core/notify/telegram-poller.ts (depende de T005; faz T012 passar)

**Checkpoint**: US1 completa e testavel de forma independente — pergunta com opcoes discretas vira botoes funcionais.

---

## Phase 4: User Story 2 - Aprovacao de gate continua funcionando sem regressao (Priority: P2)

**Goal**: Pedidos de aprovacao de gate (`kind: 'approval'`) permanecem byte-a-byte identicos ao comportamento atual, sem serem afetados pela introducao dos botoes de pergunta.

**Independent Test**: Disparar um gate de aprovacao sem pergunta de esclarecimento envolvida, confirmar que a notificacao Telegram mantem o formato Advance/Retry/Hold atual e que a decisao do administrador tem o mesmo efeito de hoje.

### Tests for User Story 2

- [X] T018 [P] [US2] Teste de regressao garantindo que o branch `kind === 'approval'` de `stage:request-created` continua montando os botoes fixos Advance/Retry/Hold (ou a mensagem `auto-advance`), sem qualquer opcao "inventada" de pergunta, em tests/core/events-notifications.test.ts
- [X] T019 [P] [US2] Teste de regressao garantindo que o novo regex `input:<id>:<index>` nao colide com `GATE_CMD`, `STAGE_CMD` nem com o formato existente `input:<id> <texto>` (espaco, nao dois-pontos) em tests/core/notify-telegram-poller.test.ts

### Validation for User Story 2

- [X] T020 [US2] Rodar a suite completa (`rtk npm run build && rtk npm test && rtk npm run typecheck && rtk npm run lint`) e confirmar zero regressoes nos testes existentes de aprovacao de gate (SC-003) (depende de T013-T017, T018, T019)

**Checkpoint**: US1 + US2 funcionam juntas — aprovacao de gate identica ao existente, perguntas com botoes funcionais.

---

## Phase 5: User Story 3 - Pergunta longa respeita o limite de mensagem do Telegram (Priority: P3)

**Goal**: Texto de pergunta > 4096 caracteres chega integralmente ao Telegram em mensagens sequenciais legiveis, com os botoes anexados apenas na ultima mensagem.

**Independent Test**: Simular (via teste unitario de `TelegramChannel.send`) um texto de pergunta > 4096 caracteres e confirmar que chega em multiplas mensagens sequenciais sem corte, com `reply_markup` apenas no ultimo fragmento.

### Tests for User Story 3

- [X] T021 [P] [US3] Teste garantindo que `TelegramChannel.send` fatia texto > 4096 caracteres em multiplas chamadas `sendMessage` sequenciais sem perda de conteudo em tests/core/notify-telegram.test.ts
- [X] T022 [P] [US3] Teste garantindo que `reply_markup` e enviado apenas no ultimo fragmento quando ha split, e que mensagens <= 4096 caracteres continuam em uma unica chamada (comportamento atual preservado) em tests/core/notify-telegram.test.ts

### Implementation for User Story 3

- [X] T023 [US3] Implementar split de mensagem > 4096 caracteres em fragmentos sequenciais dentro de `TelegramChannel.send`, chamando `sendMessage` uma vez por fragmento e anexando `reply_markup` (quando presente em `metadata`) somente ao ultimo fragmento, em src/core/notify/telegram.ts (depende de T021, T022 para o comportamento esperado)

**Checkpoint**: Todas as user stories (US1, US2, US3) funcionam de forma independente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consistencia de documentacao e validacao final cobrindo todos os cenarios de `quickstart.md`.

- [X] T024 [P] Atualizar os checkboxes de "Criterios de aceite" em docs/features/F47-telegram-interactive-questions.md refletindo o escopo efetivamente implementado
- [X] T025 Rodar a suite focada de `quickstart.md` (`rtk npx vitest run tests/core/control.test.ts tests/core/events-notifications.test.ts tests/core/events-notifications-full.test.ts tests/core/notify-telegram.test.ts tests/core/notify-telegram-poller.test.ts tests/db/repo.test.ts tests/db/repo-extended.test.ts tests/runner/execute.test.ts tests/db/index-migrate.test.ts`) seguida do baseline completo (`rtk npm run build && rtk npm test && rtk npm run typecheck && rtk npm run lint`) como validacao final (depende de T001-T023)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependencias — comeca imediatamente
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEIA todas as user stories (T013, T015, T016, T017 dependem de T002-T005)
- **US1 (Phase 3)**: Depende de Foundational completo — nenhuma dependencia de US2/US3
- **US2 (Phase 4)**: Depende de Foundational completo; T020 depende de US1 estar implementada (T013-T017) pois a suite completa precisa que ambos os caminhos existam
- **US3 (Phase 5)**: Depende de Foundational completo — independente de US1/US2 (toca apenas `telegram.ts`)
- **Polish (Phase 6)**: Depende de US1, US2 e US3 completas

### User Story Dependencies

- **US1 (P1)**: Pode comecar apos Foundational — nenhuma dependencia de outra story
- **US2 (P2)**: Pode comecar apos Foundational; sua tarefa de validacao final (T020) so faz sentido apos US1 existir, pois valida que US1 nao regrediu o fluxo de aprovacao
- **US3 (P3)**: Pode comecar apos Foundational — totalmente independente de US1/US2 (arquivo `telegram.ts` nao e tocado por nenhuma das duas)

### Within Each User Story

- Testes antes da implementacao correspondente (devem falhar antes)
- Tipos/coluna (Foundational) antes de qualquer parsing/propagacao/dispatch
- `control.ts` (extracao) antes de `execute.ts` (propagacao) antes de `notifications.ts`/`telegram-poller.ts` (dispatch/resolucao)

### Parallel Opportunities

- T002, T003, T004 (Foundational, arquivos diferentes) podem rodar em paralelo
- T006, T007 (testes de Foundational) podem rodar em paralelo entre si apos T002/T005
- T008-T012 (testes de US1, arquivos diferentes) podem rodar em paralelo
- T018, T019 (testes de US2) podem rodar em paralelo
- T021, T022 (testes de US3, mesmo arquivo mas casos independentes) — paralelizavel em times diferentes, mas mesmo arquivo exige cuidado com merge
- US3 (Phase 5) pode ser trabalhada em paralelo com US1/US2 por outra pessoa, pois toca um arquivo (`telegram.ts`) que nenhuma das duas modifica

---

## Parallel Example: Foundational

```bash
# Lancar as tarefas de tipo/coluna em paralelo (arquivos diferentes):
Task: "Adicionar coluna options em stage_requests em src/db/index.ts"
Task: "Estender RunControlNeedsInput com options?: string[] em src/core/adapters/types.ts"
Task: "Estender StageRequestCreatedEvent com options?: string[] em src/core/events/types.ts"
```

## Parallel Example: User Story 1 (testes)

```bash
Task: "Testes de extracao valida do bloco OPTIONS: em tests/core/control.test.ts"
Task: "Teste de propagacao de options para createStageRequest em tests/runner/execute.test.ts"
Task: "Teste de reply_markup com botoes de opcao em tests/core/events-notifications.test.ts"
Task: "Teste de resolucao de callback input:<id>:<index> em tests/core/notify-telegram-poller.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRITICO — bloqueia todas as stories)
3. Completar Phase 3: US1
4. **PARAR e VALIDAR**: rodar `tests/core/control.test.ts`, `tests/runner/execute.test.ts`, `tests/core/events-notifications.test.ts`, `tests/core/notify-telegram-poller.test.ts` e confirmar Cenario 1 de `quickstart.md`
5. US1 sozinha ja entrega o valor central do pedido do usuario (botoes para perguntas de esclarecimento)

### Incremental Delivery

1. Setup + Foundational → fundacao pronta
2. US1 → validar independentemente → perguntas com botoes funcionando (MVP)
3. US2 → validar independentemente → confirmar zero regressao no fluxo de aprovacao
4. US3 → validar independentemente → perguntas longas divididas corretamente
5. Polish → checklist de aceite atualizado + baseline completo verde

---

## Notes

- [P] = arquivos diferentes, sem dependencia direta dentro do mesmo grupo
- [Story] mapeia cada tarefa para a user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar o codigo correspondente
- Commitar apos cada tarefa ou grupo logico coerente (`.claude/rules/git-workflow.md`)
- Parar em qualquer checkpoint para validar a story de forma independente
- Nao criar arquivos/diretorios novos: todas as mudancas sao extensoes de modulos existentes (`plan.md` → Project Structure)
