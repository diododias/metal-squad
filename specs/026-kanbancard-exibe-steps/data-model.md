# Data Model: KanbanCard exibe steps da feature

## KanbanCardRun (extended)

`src/web/client/components/data/KanbanCard.tsx`

| Field | Type | Change | Notes |
|---|---|---|---|
| `stages` | `string[]` (optional) | **new** | Sequência de steps do workflow da feature, na ordem em que ocorrem. Ausente/vazio → sem seção de steps (FR-006). Fonte dos dados é responsabilidade de uma feature subsequente (SET-09, fora de escopo). |
| `status` | `PillStatus` | unchanged | Já usado para decidir "todos done" (`'done'`) / "todos pendentes" (`'todo'`) via FR-004/FR-005. |
| `stage` | `string \| null` (optional) | unchanged | Continua sendo a referência do step atual (FR-003), agora consumida pelo `WorkflowStepper` compacto em vez do texto `→ {stage}`. |

Nenhum outro campo de `KanbanCardRun` muda. Não há migração de schema/backend nesta feature (ver
Assumptions do spec.md).

## WorkflowStepper (extended props)

`src/web/client/components/navigation/WorkflowStepper.tsx`

| Prop | Type | Change | Notes |
|---|---|---|---|
| `stages` | `string[]` | unchanged | |
| `currentStage` | `string \| null` (optional) | unchanged | `null`/ausente já significa "todos concluídos" no cálculo de marker existente. |
| `size` | `'default' \| 'compact'` (optional, default `'default'`) | **new** | Controla apenas apresentação (fonte, gap, espaçamento do separador). Não altera o cálculo de marker. |
| `allPending` | `boolean` (optional, default `false`) | **new** | Quando `true`, força todo step a `marker = 'next'`, independentemente de `currentStage`/índice. Usado pelo `KanbanCard` quando `run.status === 'todo'`. |

### Regra de marker (consolidada, sem mudança na lógica existente + `allPending`)

Para cada `stage` no índice `i`:

1. Se `allPending` → `'next'`.
2. Senão, se `stage === currentStage` → `'current'`.
3. Senão, se `currentIndex > i || currentStage == null` → `'done'`.
4. Senão → `'next'`.

Onde `currentIndex = currentStage != null ? stages.indexOf(currentStage) : -1`.

## Mapeamento requisito → dado/comportamento

| Requisito | Cobertura |
|---|---|
| FR-001 | `KanbanCardRun.stages?: string[]` |
| FR-002 | `KanbanCard` renderiza `WorkflowStepper` (`size="compact"`) no lugar de `→ {stage}` |
| FR-003 | `WorkflowStepper` já marca done/current/next a partir de `currentStage = run.stage` |
| FR-004 | `KanbanCard` passa `currentStage={null}` ao stepper quando `run.status === 'done'` |
| FR-005 | `KanbanCard` passa `allPending={true}` ao stepper quando `run.status === 'todo'` |
| FR-006 | `KanbanCard` só renderiza a seção de steps se `run.stages?.length` |
| FR-007 | Comportamento já coberto pelo cálculo existente de marker (`currentIndex = -1`) |

## State transitions

Não há máquina de estados nova — o "estado" do step é derivado, não persistido, a cada render a
partir de `stages` + `stage` + `status`.
