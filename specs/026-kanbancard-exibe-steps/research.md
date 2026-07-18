# Research: KanbanCard exibe steps da feature

## Decisions

### D1 — Onde adicionar a variante compacta
- **Decision**: Adicionar um prop `size?: 'default' | 'compact'` (default `'default'`) ao
  `WorkflowStepper` existente (`src/web/client/components/navigation/WorkflowStepper.tsx`), em vez
  de criar um componente novo.
- **Rationale**: A spec (Assumptions) trata a variante compacta como "adaptação de apresentação
  (tamanho de fonte, espaçamento, wrap)", não uma máquina de estados divergente. O componente já
  calcula `done`/`current`/`next` a partir de `stages` + `currentStage`; só o layout muda. Reuso
  evita duplicar a lógica de marker entre duas implementações.
- **Alternatives considered**:
  - Componente novo `CompactWorkflowStepper`: rejeitado — duplicaria o cálculo de índice/marker já
    testado indiretamente via `RunDetailPage`, violando o princípio de ownership pequeno.
  - Prop de estilo livre (`className`/`style` override) passado pelo consumidor: rejeitado —
    KanbanCard não deveria conhecer detalhes de CSS internos do stepper; o componente deve
    encapsular a própria variante.

### D2 — Onde o KanbanCard busca o estado "atual"
- **Decision**: `KanbanCard` passa `run.stage` como `currentStage` ao `WorkflowStepper` (variante
  compacta), preservando a mesma fonte usada hoje pelo indicador `→ {stage}` removido.
- **Rationale**: FR-003 exige `run.stage` como referência; não há novo campo de "stage atual"
  proposto pela spec além do já existente.
- **Alternatives considered**: usar um campo separado tipo `run.pipelineCurrentStage` (como em
  `RunDetailPage`) — rejeitado, esse campo não existe em `KanbanCardRun` e a spec não pede.

### D3 — DONE/TODO forçam todos os steps concluídos/pendentes (FR-004/FR-005)
- **Decision**: A lógica de "todos concluídos quando `status === 'done'`" e "todos pendentes quando
  `status === 'todo'`" vive no `KanbanCard`, que decide o `currentStage` efetivo a passar ao
  `WorkflowStepper` (não uma prop nova de status no stepper).
  - Quando `status === 'done'`: passar `currentStage` fora do array (ex.: `null` combinado com uma
    forma de indicar "todos concluídos") — como o `WorkflowStepper` atual trata `currentStage == null`
    como "todos done" (linha 23: `currentIndex > i || currentStage == null ? 'done' : 'next'`), basta
    passar `currentStage: null` para obter o efeito de FR-004 sem mudar a lógica do stepper.
  - Quando `status === 'todo'`: o stepper atual não tem um modo "todos pendentes" nativo (o caso
    `currentStage == null` já significa "todos done"). É necessário estender o `WorkflowStepper`
    com uma forma explícita de marcar todos como `next` — resolvido com um novo prop opcional
    `allPending?: boolean` que, quando `true`, força todo `marker = 'next'` independentemente de
    `currentStage`.
- **Rationale**: Mantém a decisão de negócio (o que "done"/"todo" significam) no `KanbanCard`, que já
  é o dono do campo `status`; o `WorkflowStepper` permanece um componente de apresentação pura que só
  precisa de mais um interruptor booleano para representar o estado "nada começou".
- **Alternatives considered**: fazer o `KanbanCard` pré-computar um `currentStage` sintético fora da
  lista (ex.: string vazia) para forçar `next` em todos — rejeitado, é implícito e frágil (depende de
  nenhum stage real ser string vazia); um prop explícito é mais claro e testável.

### D4 — `stage` inconsistente (não está em `stages`) (FR-007)
- **Decision**: Sem mudança necessária — o `WorkflowStepper` atual já produz `currentIndex = -1`
  quando `currentStage` não é encontrado (`stages.indexOf` retorna `-1`), e a expressão de marker
  (`stage === currentStage ? 'current' : currentIndex > i || currentStage == null ? 'done' : 'next'`)
  resulta em `next` para todo `i` (já que `currentIndex > i` é sempre falso com `currentIndex = -1` e
  `currentStage` não é `null`). Isso já satisfaz "nenhum step destacado como atual, sem quebrar".
- **Rationale**: Comportamento existente já cobre o edge case; nenhuma mudança de lógica requerida
  além de confirmar via teste.

### D5 — Fallback sem `stages` (FR-006 / User Story 2)
- **Decision**: `KanbanCard` renderiza a seção de steps condicionalmente
  (`run.stages && run.stages.length > 0`), preservando hoje um estado discreto: quando ausente,
  nenhuma seção de steps é renderizada (equivalente ao comportamento atual quando `run.stage` é
  falsy), sem introduzir um placeholder visual novo.
- **Rationale**: Spec aceita "sem a sequência de steps" como resultado válido do fallback (Acceptance
  Scenario 1 da User Story 2); menor mudança de superfície visual.
- **Alternatives considered**: renderizar um placeholder tipo "sem workflow" — não pedido pela spec e
  aumentaria a superfície de teste sem valor claro.

### D6 — Legibilidade com 8+ steps (User Story 3)
- **Decision**: Reaproveitar o `flexWrap: 'wrap'` já presente no `WorkflowStepper`, sem novo CSS
  custom; a variante compacta reduz `fontSize`/`gap` para caber mais steps por linha, mas a quebra de
  linha (wrap) já é responsabilidade do componente existente.
- **Rationale**: `WorkflowStepper` (linha 21) já usa `flexWrap: 'wrap'` — o container do card
  (`Card`) já tem largura fixa de coluna; testar apenas que a marcação renderiza sem overflow
  horizontal explícito (nenhum `white-space: nowrap` ou `overflow: hidden` bloqueando quebra).

## Testing approach

- Componente: `renderToStaticMarkup` (padrão já usado em `tests/web/kanban-card.test.tsx`), sem DOM
  real — consistente com `tests/ui/*` (Ink) mas aqui é React puro server-rendered.
- Cobrir: stages populado com stage no meio (US1), status `done`/`todo` (FR-004/FR-005), `stages`
  ausente/vazio (US2/FR-006), `stage` não encontrado em `stages` (FR-007), lista longa 8+ (US3).
- Suite alvo: `tests/web/kanban-card.test.tsx` (estender) e, se a mudança no `WorkflowStepper` for
  testada isoladamente, um teste novo/estendido para o prop `allPending`.

## Resolved unknowns

Nenhum `NEEDS CLARIFICATION` restante — a spec já define o contrato (`stages?: string[]`), o
componente de reuso (`WorkflowStepper`), e os comportamentos de `DONE`/`TODO`/dado inconsistente.
