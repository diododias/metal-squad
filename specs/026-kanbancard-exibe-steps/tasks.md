---

description: "Task list for SET-08 — KanbanCard exibe steps da feature"

---

# Tasks: KanbanCard exibe steps da feature

**Input**: Design documents from `/specs/026-kanbancard-exibe-steps/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (no `contracts/` — sem API nova, ver plan.md)

**Tests**: Tests are included — `research.md` § Testing approach define cobertura obrigatória
via `tests/web/kanban-card.test.tsx` (server-rendered, `renderToStaticMarkup`), consistente com o
padrão já usado no arquivo.

**Organization**: Tasks agrupadas por user story (US1/US2/US3 do spec.md). Escopo é 2 componentes
(`WorkflowStepper.tsx`, `KanbanCard.tsx`) + 1 suite de teste — a maior parte do trabalho por story
cai nos mesmos arquivos, então poucas tasks são `[P]`.

## Path Conventions

Projeto web único existente: `src/web/client/components/`, `tests/web/`. Sem `backend/`/`frontend/`
separados (ver plan.md § Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

Não aplicável — nenhuma dependência nova, nenhum scaffold de projeto necessário. `WorkflowStepper` e
`KanbanCard` já existem; a feature estende ambos in-place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Estender `WorkflowStepper` com os dois props de apresentação/estado (`size`,
`allPending`) que todas as user stories dependem para renderizar a variante compacta no card.

**⚠️ CRITICAL**: Nenhuma user story pode ser implementada no `KanbanCard` antes desta fase, pois
US1/US2/US3 todas consomem o `WorkflowStepper` compacto.

- [ ] T001 Adicionar prop `size?: 'default' | 'compact'` (default `'default'`) a
  `WorkflowStepperProps` em `src/web/client/components/navigation/WorkflowStepper.tsx`; quando
  `'compact'`, reduzir `fontSize`/`gap` do container e do separador sem alterar o cálculo de marker
  (`done`/`current`/`next`) nem o `flexWrap: 'wrap'` existente (ver data-model.md, research.md D1/D6).
- [ ] T002 Adicionar prop `allPending?: boolean` (default `false`) a `WorkflowStepperProps` no mesmo
  arquivo; quando `true`, forçar `marker = 'next'` para todo `stage`, ignorando `currentStage`/índice
  (ver data-model.md § Regra de marker consolidada, research.md D3).
- [ ] T003 Confirmar que `src/web/client/pages/RunDetailPage.tsx` (único outro consumidor de
  `WorkflowStepper`) continua funcionando sem passar `size`/`allPending` — defaults preservam o
  comportamento atual (verificação manual de leitura, sem mudança de código nesse arquivo).

**Checkpoint**: `WorkflowStepper` suporta variante compacta e modo "todos pendentes"; pronto para uso
pelo `KanbanCard`.

---

## Phase 3: User Story 1 - Ver os steps de uma feature no card (Priority: P1) 🎯 MVP

**Goal**: Cada card do kanban mostra a sequência completa de steps do workflow da feature, com o
step atual destacado, no lugar do indicador único `→ {stage}`.

**Independent Test**: Renderizar `KanbanCard` com `run.stages` populado e `run.stage` no meio da
lista; verificar que os steps anteriores aparecem `done`, o atual `current` e os seguintes `next`.

### Tests for User Story 1

- [ ] T004 [P] [US1] Em `tests/web/kanban-card.test.tsx`, adicionar teste: card com
  `stages: ['plan', 'implement', 'review']` e `stage: 'implement'` renderiza a sequência com `plan`
  marcado concluído, `implement` destacado como atual e `review` como pendente (Acceptance Scenario 1
  da US1; usar os ícones/marcadores de `WorkflowStepper` como asserção via `renderToStaticMarkup`).
- [ ] T005 [P] [US1] No mesmo arquivo, adicionar teste: card com `status: 'done'` e `stages`
  preenchido renderiza todos os steps como concluídos independentemente de `stage` (FR-004,
  Acceptance Scenario 2 da US1).
- [ ] T006 [P] [US1] No mesmo arquivo, adicionar teste: card com `status: 'todo'` e `stages`
  preenchido renderiza todos os steps como pendentes (FR-005, Acceptance Scenario 3 da US1).

### Implementation for User Story 1

- [ ] T007 [US1] Adicionar campo opcional `stages?: string[]` à interface `KanbanCardRun` em
  `src/web/client/components/data/KanbanCard.tsx` (FR-001, data-model.md).
- [ ] T008 [US1] Em `KanbanCard.tsx`, substituir o bloco `run.stage && <div>...→ {run.stage}</div>`
  por uma renderização condicional do `WorkflowStepper` com `size="compact"`, passando
  `stages={run.stages}` e o `currentStage` efetivo derivado de `run.status`/`run.stage`: `null` quando
  `status === 'done'`, `run.stage` nos demais casos com `allPending={status === 'todo'}` (FR-002,
  FR-003, FR-004, FR-005; depende de T001, T002, T007).

**Checkpoint**: US1 completa e testável de forma independente — card exibe a sequência de steps com
o atual destacado.

---

## Phase 4: User Story 2 - Card sem dado de steps continua utilizável (Priority: P2)

**Goal**: Cards sem `stages` persistido continuam renderizando sem erro e sem quebra de layout,
degradando para um estado discreto sem a sequência de steps.

**Independent Test**: Renderizar `KanbanCard` sem `stages` (ou com array vazio) e verificar ausência
de erro e de seção de steps.

### Tests for User Story 2

- [ ] T009 [P] [US2] Em `tests/web/kanban-card.test.tsx`, adicionar teste: card com `stages`
  ausente (`undefined`) renderiza sem lançar erro e sem a seção de sequência de steps (FR-006,
  Acceptance Scenario 1 da US2).
- [ ] T010 [P] [US2] No mesmo arquivo, adicionar teste: card com `stages: []` produz o mesmo
  resultado do caso ausente — sem seção de steps (FR-006, Acceptance Scenario 2 da US2).
- [ ] T011 [P] [US2] No mesmo arquivo, adicionar teste: card com `stages` populado mas `stage` não
  presente na lista (ex.: `stage: 'unknown'`) renderiza a sequência sem nenhum step marcado como
  atual e sem erro (FR-007, Edge Case do spec.md).

### Implementation for User Story 2

- [ ] T012 [US2] Em `KanbanCard.tsx`, condicionar a renderização da seção de steps a
  `run.stages && run.stages.length > 0` (FR-006, research.md D5; depende de T007/T008 — mesmo bloco
  introduzido na US1).

**Checkpoint**: US1 e US2 funcionam juntas — cards com e sem `stages` renderizam corretamente.

---

## Phase 5: User Story 3 - Workflow com muitos steps cabe no card compacto (Priority: P3)

**Goal**: Sequências longas (8+ steps) permanecem legíveis dentro da largura fixa de uma coluna do
board, sem overflow horizontal.

**Independent Test**: Renderizar `KanbanCard` com 8+ `stages` na largura padrão de coluna e verificar
que o markup não usa `white-space: nowrap`/`overflow: hidden` bloqueando a quebra de linha existente.

### Tests for User Story 3

- [ ] T013 [P] [US3] Em `tests/web/kanban-card.test.tsx`, adicionar teste: card com 8+ `stages`
  renderiza todos os steps no markup (nenhum item omitido/truncado no HTML) via
  `renderToStaticMarkup`, confirmando que o `WorkflowStepper` compacto não trunca a lista (Acceptance
  Scenario da US3).

### Implementation for User Story 3

- [ ] T014 [US3] Revisar `size="compact"` em `WorkflowStepper.tsx` (T001) para garantir que o
  `flexWrap: 'wrap'` existente permanece ativo e que nenhum `fontSize`/`gap` reduzido introduz
  `overflow: hidden`/`white-space: nowrap` (research.md D6) — ajustar apenas se o teste T013 ou a
  validação manual do quickstart revelar overflow.
- [ ] T015 [US3] Validação visual manual opcional via `msq web` (quickstart.md § Cenário 6): abrir o
  board, localizar um card com `stages` mockado e conferir que a sequência quebra linha corretamente
  na largura da coluna (não bloqueante para merge — depende de dado real de SET-09 para casos
  reais; pode ser feito com dado de teste local).

**Checkpoint**: Todas as user stories (US1, US2, US3) funcionam de forma independente e conjunta.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T016 Rodar suite focada: `rtk npx vitest run tests/web/kanban-card.test.tsx`.
- [ ] T017 Rodar baseline completa: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`,
  `rtk npm run lint` (mudança em `src/`, ver testing.md).
- [ ] T018 Confirmar que `docs/epics/epic -settings/features/SET-08-kanbancard-exibe-steps.md`
  continua consistente com o comportamento implementado (sem mudança de escopo em relação ao já
  documentado).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: N/A.
- **Foundational (Phase 2)**: Sem dependências — bloqueia todas as user stories (US1 depende de
  T001/T002 para `size`/`allPending`).
- **User Stories (Phase 3-5)**: Todas dependem da Foundational. US2 e US3 reutilizam o mesmo bloco de
  código introduzido em US1 (T008) — não são estruturalmente paralelas a US1 no `KanbanCard.tsx`, mas
  são independentemente testáveis via os testes correspondentes.
- **Polish (Phase 6)**: Depende de todas as stories completas.

### User Story Dependencies

- **US1 (P1)**: Depende apenas da Foundational (Phase 2).
- **US2 (P2)**: Depende da Foundational; sua implementação (T012) ajusta a mesma condicional
  introduzida por T008 (US1) — implementar em sequência após US1, mas testável isoladamente.
- **US3 (P3)**: Depende da Foundational e da variante `size="compact"` (T001); não introduz mudança
  de lógica nova, apenas validação/ajuste de CSS existente.

### Parallel Opportunities

- T001 e T002 tocam o mesmo arquivo (`WorkflowStepper.tsx`) — não são `[P]` entre si.
- Testes dentro de cada story (T004-T006, T009-T011, T013) são `[P]` entre si (mesmo arquivo de teste,
  mas blocos `it()` independentes sem overlap de asserção).
- T007/T008 (US1), T012 (US2) e T014 (US3) tocam os mesmos dois arquivos de implementação — executar
  em sequência (US1 → US2 → US3), não em paralelo.

---

## Parallel Example: User Story 1

```bash
# Testes de US1 podem ser escritos em paralelo (mesma suite, cenários independentes):
Task: "Teste: stage no meio da lista → done/current/next em tests/web/kanban-card.test.tsx"
Task: "Teste: status done força tudo concluído em tests/web/kanban-card.test.tsx"
Task: "Teste: status todo força tudo pendente em tests/web/kanban-card.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 2: Foundational (`size`/`allPending` no `WorkflowStepper`).
2. Completar Phase 3: US1 (`stages` no `KanbanCardRun` + renderização compacta com step atual).
3. **STOP and VALIDATE**: `rtk npx vitest run tests/web/kanban-card.test.tsx`.
4. US1 sozinha já entrega o valor central da spec (substituir `→ {stage}` pela sequência).

### Incremental Delivery

1. Foundational → US1 (MVP: sequência com step atual destacado).
2. US2 → fallback seguro para cards sem `stages` (dado legado).
3. US3 → confirmação de legibilidade com workflows longos.
4. Polish → baseline completa + sync de docs.

---

## Notes

- Sem `contracts/` nesta feature — nenhuma API/CLI nova ou alterada (plan.md).
- `stages` real vindo do backend/loader do `BoardPage` é escopo de SET-09 (fora desta spec); os
  testes desta feature usam `stages` mockado diretamente no `run` passado ao `KanbanCard`.
- Preencher `run.stages` a partir de `msq web` ao vivo (T015) é validação opcional, não bloqueante.
