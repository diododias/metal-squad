---

description: "Task list template for feature implementation"
---

# Tasks: Remover visão "by workflow stage"

**Input**: Design documents from `/specs/025-remover-visao-workflow-stage/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Nenhuma suite dedicada a `BoardPage` existe hoje (confirmado em research.md); a
constitution (Princípio III / `.claude/rules/harness.md`) exige cobertura automatizada nova para
SC-001 — teste incluído nesta lista.

**Organization**: Feature com uma única user story (P1). Sem fase Foundational — é uma remoção
de código contida a um arquivo, sem infraestrutura compartilhada nova.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 (única user story desta feature)

## Path Conventions

Monorepo CLI único: `src/web/client/pages/BoardPage.tsx` (produção), `tests/web/` (testes).

---

## Phase 1: Setup

**Purpose**: Nenhuma inicialização de projeto nova é necessária — build e dependências já
existem no repo.

- [X] T001 Confirmar baseline local com `rtk npm run build` antes de alterar
      `src/web/client/pages/BoardPage.tsx`

---

## Phase 2: Foundational

Não aplicável — não há infraestrutura compartilhada bloqueante para esta feature de arquivo
único. Prossegue direto para a User Story 1.

---

## Phase 3: User Story 1 - Board único por status (Priority: P1) 🎯 MVP

**Goal**: `BoardPage` renderiza exclusivamente colunas por status (IN PROGRESS/BLOCKED, DONE,
FALHA/CANCELED, mais a coluna TODO já existente fora do array `columns`), sem estado `viewMode`,
sem toggle de alternância e sem a constante `WORKFLOW_STAGES`.

**Independent Test**: Renderizar `BoardPage` isoladamente em teste (ou abrir `msq web`) e
verificar que as colunas exibidas são as de status e que nenhum controle de troca de visão
aparece na árvore/props retornada.

### Tests for User Story 1 ⚠️

> **NOTE: Escrever este teste PRIMEIRO; ele deve falhar antes da remoção porque o toggle e o
> branch `workflow` ainda existem.**

- [X] T002 [P] [US1] Criar `tests/web/board-page.test.tsx` cobrindo: (a) `columns` derivadas de
      `BoardPage({...props})` contêm apenas as colunas de status (sem stages de
      `WORKFLOW_STAGES` como `specify`/`plan`/`tasks`/`implement`/`validate`); (b) a árvore JSX
      retornada não contém nenhum botão/controle com os textos `by status` / `by workflow
      stage`; seguir o padrão de análise de árvore JSX sem DOM completo usado em
      `tests/web/kanban-card.test.tsx` e `tests/web/feature-identity.test.tsx`

### Implementation for User Story 1

- [X] T003 [US1] Remover a constante `WORKFLOW_STAGES` (linha 10) de
      `src/web/client/pages/BoardPage.tsx`
- [X] T004 [US1] Remover o estado `viewMode`/`setViewMode` (linha 45,
      `useState<'status' | 'workflow'>('status')`) de `src/web/client/pages/BoardPage.tsx`
      (depende de T003)
- [X] T005 [US1] Colapsar o `if (viewMode === 'status') { ... } else { ... }` (linhas 56-75) em
      `src/web/client/pages/BoardPage.tsx` para manter apenas o corpo do branch `status`
      (`columns = [...]` com IN PROGRESS/BLOCKED, DONE, FALHA/CANCELED), removendo o branch
      `else` que usava `WORKFLOW_STAGES` (depende de T003, T004)
- [X] T006 [US1] Remover o bloco de toggle de visão (linhas 117-136, o `<div>` com o `.map` sobre
      `['status', 'workflow']` e os `<button>` "by status"/"by workflow stage") de
      `src/web/client/pages/BoardPage.tsx` (depende de T004)
- [X] T007 [US1] Rodar `grep -rn "viewMode\|WORKFLOW_STAGES" --include="*.ts" --include="*.tsx"
      src tests` e confirmar zero ocorrências, cobrindo FR-006/SC-003 (depende de T003-T006)
- [X] T008 [US1] Rodar `rtk npx vitest run tests/web/board-page.test.tsx` e confirmar que o teste
      criado em T002 passa após a remoção (depende de T003-T007)

**Checkpoint**: Board renderiza só por status, sem toggle, sem `WORKFLOW_STAGES`, com cobertura
de teste dedicada passando.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validação final de baseline e evidências exigidas pela constitution/harness.

- [X] T009 Rodar `rtk npm run build`
- [X] T010 Rodar `rtk npm test`
- [X] T011 Rodar `rtk npm run typecheck` e confirmar ausência de erro relacionado a `viewMode`
      ou `WORKFLOW_STAGES` (SC-002)
- [X] T012 Rodar `rtk npm run lint`
- [X] T013 Executar a validação visual opcional de `quickstart.md` (`msq web`, conferir colunas
      TODO/IN PROGRESS/DONE/FALHA e ausência do toggle) — não substitui T008-T012

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: não aplicável
- **User Story 1 (Phase 3)**: depende de Setup; é a única fase de user story
- **Polish (Phase 4)**: depende da conclusão da User Story 1

### Within User Story 1

- T002 (teste) deve ser escrito e falhar antes de T003-T006 (implementação)
- T003 → T004 → T005/T006 (ordem de remoção: constante, depois estado, depois branch e toggle
  que dependem do estado)
- T007 (grep de ausência) e T008 (teste passando) só depois de toda a remoção (T003-T006)

### Parallel Opportunities

- T002 pode ser escrito em paralelo com T001 (arquivos diferentes: teste novo vs. build check)
- Não há paralelismo real dentro de T003-T006 — todas tocam o mesmo arquivo
  (`BoardPage.tsx`) em sequência

---

## Parallel Example: User Story 1

```bash
# T001 e T002 podem rodar em paralelo (build check vs. novo arquivo de teste):
Task: "Confirmar baseline local com rtk npm run build"
Task: "Criar tests/web/board-page.test.tsx cobrindo colunas de status e ausência de toggle"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (T001)
2. Completar Phase 3: User Story 1 (T002-T008) — única fase de story, já é o MVP completo da
   feature
3. **STOP and VALIDATE**: T007/T008 confirmam FR-006/SC-001/SC-003 de forma independente
4. Completar Phase 4: Polish (T009-T013) para fechar SC-002 e evidências de harness

### Incremental Delivery

Feature de arquivo único sem incremento adicional — User Story 1 é o único incremento e entrega
o valor completo da spec (remoção da visão by workflow stage).

---

## Notes

- [P] tasks = arquivos diferentes, sem dependência
- T003-T006 tocam o mesmo arquivo (`BoardPage.tsx`) — não marcar como [P] entre si
- Escrever T002 antes de T003-T006 e confirmar que falha primeiro (o toggle e o branch
  `workflow` ainda existem até T006)
- Commitar após T008 (User Story 1 completa e validada) e novamente após T009-T013 (polish), ou
  em um único commit se a validação de polish for rápida — seguir `.claude/rules/git-workflow.md`
