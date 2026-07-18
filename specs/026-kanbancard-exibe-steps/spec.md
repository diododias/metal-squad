# Feature Specification: KanbanCard exibe steps da feature

**Feature Branch**: `feat/set08-kanbancard-exibe-steps`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Feature: SET-08 — KanbanCard exibe steps da feature. Ampliar `KanbanCardRun` com `stages?: string[]`; renderizar sequência de steps (done/atual/pendente) via variante compacta do `WorkflowStepper` no lugar do único `→ stage`. Com o board só por status (SET-07), cada card precisa mostrar o próprio workflow da feature — não mais um único `→ stage`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver os steps de uma feature no card (Priority: P1)

Como usuário do board, quero que cada card mostre a sequência completa de steps do workflow da
feature, com o step atual destacado, para saber em que ponto do fluxo aquela feature está — mesmo
com features de workflows diferentes lado a lado no mesmo board (agora que o board agrupa só por
status, ver SET-07).

**Why this priority**: É o comportamento central da feature — sem ele o card volta a mostrar
apenas um `→ stage` isolado, que já foi identificado como informação insuficiente após a remoção
da visão por workflow stage.

**Independent Test**: Pode ser testado isoladamente renderizando `KanbanCard` com um `run.stages`
populado e um `run.stage` correspondente a um step no meio da lista, e verificando que a sequência
aparece com os steps anteriores marcados como concluídos, o atual destacado e os seguintes como
pendentes.

**Acceptance Scenarios**:

1. **Given** um card com `stages: ["plan", "implement", "review"]` e `stage: "implement"`,
   **When** o card é renderizado, **Then** a sequência mostra `plan` como concluído, `implement`
   destacado como atual e `review` como pendente.
2. **Given** um card com status `DONE` e `stages` preenchido, **When** o card é renderizado,
   **Then** todos os steps aparecem como concluídos, independentemente do valor de `stage`.
3. **Given** um card com status `TODO` e `stages` preenchido, **When** o card é renderizado,
   **Then** todos os steps aparecem como pendentes.

---

### User Story 2 - Card sem dado de steps continua utilizável (Priority: P2)

Como usuário, quero que cards de features antigas (sem `stages` persistido) continuem exibindo
alguma informação de posição no fluxo sem quebrar o layout do board, para não perder contexto
durante a transição de dados legados.

**Why this priority**: Garante que a mudança não regride o board para runs já em andamento ou
persistidos antes desta feature, mesmo sendo um caso secundário frente ao fluxo principal.

**Independent Test**: Pode ser testado isoladamente renderizando `KanbanCard` sem `stages` (ou com
array vazio) e verificando que o card renderiza sem erro, com um indicador discreto de fallback
(ou nenhuma seção de steps) no lugar da sequência.

**Acceptance Scenarios**:

1. **Given** um card com `stages` ausente (`undefined`), **When** o card é renderizado, **Then**
   nenhum erro ocorre e o card degrada para um estado discreto (sem a sequência de steps).
2. **Given** um card com `stages` como array vazio, **When** o card é renderizado, **Then** o
   comportamento é equivalente ao de `stages` ausente.

---

### User Story 3 - Workflow com muitos steps cabe no card compacto (Priority: P3)

Como usuário, quero que workflows com muitos steps continuem legíveis dentro do espaço reduzido de
um card do kanban, para não ter cards com layout quebrado ou informação cortada de forma confusa.

**Why this priority**: Refinamento visual sobre o comportamento já funcional das Stories 1 e 2;
não bloqueia o valor central da feature, mas evita regressão de usabilidade em boards com
workflows longos.

**Independent Test**: Pode ser testado isoladamente renderizando `KanbanCard` com uma lista de
`stages` longa (por exemplo, 8+ steps) dentro da largura fixa de uma coluna do board e verificando
que o conteúdo permanece contido (quebra de linha ou truncamento), sem estourar o card.

**Acceptance Scenarios**:

1. **Given** um card com 8 ou mais `stages`, **When** o card é renderizado na largura padrão de
   coluna do board, **Then** a sequência de steps permanece dentro dos limites visuais do card
   (quebra de linha controlada, sem overflow horizontal).

---

### Edge Cases

- Card com status `FAILED`/erro e `stage` correspondente a onde a execução falhou: o step da
  falha deve continuar destacado como o "atual" na sequência, para indicar onde o fluxo parou.
- `stage` presente mas não encontrado em `stages` (dado inconsistente): a sequência deve renderizar
  sem destacar nenhum step como atual, em vez de quebrar.
- `stages` com um único step: a sequência deve renderizar apenas esse step, sem conectores.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `KanbanCardRun` DEVE ganhar um campo opcional `stages?: string[]` representando a
  sequência de steps do workflow da feature.
- **FR-002**: O `KanbanCard` DEVE renderizar a sequência de `stages` através de uma variante
  compacta do `WorkflowStepper`, substituindo o indicador único `→ {stage}` usado atualmente.
- **FR-003**: A variante compacta DEVE marcar visualmente cada step como concluído, atual ou
  pendente, usando `run.stage` como referência do step atual.
- **FR-004**: Quando `run.status` for `DONE`, todos os steps de `stages` DEVEM ser exibidos como
  concluídos, independentemente do valor de `run.stage`.
- **FR-005**: Quando `run.status` for `TODO`, todos os steps de `stages` DEVEM ser exibidos como
  pendentes, independentemente do valor de `run.stage`.
- **FR-006**: Quando `stages` estiver ausente ou vazio, o `KanbanCard` DEVE renderizar sem erro,
  degradando para um estado discreto (sem a sequência de steps).
- **FR-007**: Quando `run.stage` não corresponder a nenhum item de `stages`, a sequência DEVE
  renderizar sem destacar nenhum step como atual, sem lançar erro.

### Key Entities

- **KanbanCardRun**: modelo de dados do card do kanban; passa a incluir `stages?: string[]` além
  dos campos já existentes (`status`, `stage`, etc.).
- **WorkflowStepper (variante compacta)**: componente de sequência de steps já existente em
  `src/web/client/components/navigation/WorkflowStepper.tsx`, reaproveitado em formato reduzido
  para caber no espaço de um card do kanban.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um card renderizado com `stages` populado exibe a sequência completa de steps com o
  atual visualmente destacado, verificável por teste de componente.
- **SC-002**: Um card renderizado sem `stages` não lança erro e não deixa espaço em branco
  quebrado no layout, verificável por teste de componente.
- **SC-003**: Cards com status `DONE` ou `TODO` exibem, respectivamente, 100% dos steps como
  concluídos ou 100% como pendentes, verificável por teste de componente.

## Assumptions

- `stages` é fornecido pelo backend/loader do board na mesma ordem em que os steps ocorrem no
  workflow da feature (sem necessidade de reordenação no componente).
- O `WorkflowStepper` existente em `src/web/client/components/navigation/WorkflowStepper.tsx` é a
  base de reaproveitamento; a "variante compacta" é uma adaptação de apresentação (tamanho de
  fonte, espaçamento, wrap) e não um componente com regras de estado divergentes.
- O preenchimento real de `run.stages` a partir de dados da feature (ex.: no `BoardPage`) é escopo
  de uma feature subsequente (SET-09, listada como dependência habilitada por esta), não desta
  spec.
- Nenhuma mudança de contrato de API é necessária além do tipo `KanbanCardRun` no front-end — o
  backend já é capaz de expor a lista de stages de uma feature (usada anteriormente na visão por
  workflow stage removida em SET-07).
