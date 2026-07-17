# Feature Specification: KanbanCard exibe steps da feature

**Feature Branch**: `feat/set08-kanbancard-exibe-steps`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M2 (Board por workflow de feature + limpeza do Config)
**Origem no plano**: S08 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Ampliar `KanbanCardRun` com `stages?: string[]`; renderizar sequência de steps
> (done/atual/pendente) via variante compacta do `WorkflowStepper` no lugar do único `→ stage`."

Com o board só por status (SET-07), cada card precisa mostrar o próprio workflow da feature — não
mais um único `→ stage`. O `KanbanCard` passa a renderizar a sequência de steps com o atual
destacado, usando uma variante compacta do `WorkflowStepper`.

## User Scenarios & Testing

### User Story 1 — Ver os steps de uma feature no card
Como usuário, quero que o card mostre todos os steps da feature com o step atual destacado, para
saber em que ponto do fluxo aquela feature está — mesmo com features de workflows diferentes no
mesmo board.

**Fluxo**: o card recebe `stages` da feature → renderiza a sequência via `WorkflowStepper`
compacto → step atual destacado, anteriores como done, seguintes como pendente.

**Aceite**: card mostra todos os steps com o atual destacado; DONE = todos concluídos; TODO =
todos pendentes.

### Edge Cases
- Feature sem `stages` (dado legado) deve degradar sem quebrar (fallback discreto).
- Workflow com muitos steps deve caber no card compacto (truncar/condensar).
- Card em FALHA destaca o step onde falhou, se disponível.

## Requirements

### Functional Requirements
- **FR-001**: `KanbanCardRun` DEVE ganhar `stages?: string[]`.
- **FR-002**: O card DEVE renderizar a sequência de steps via variante compacta do
  `WorkflowStepper`, com estados done/atual/pendente.
- **FR-003**: DONE DEVE exibir todos os steps como concluídos; TODO, todos pendentes.
- **FR-004**: A ausência de `stages` DEVE degradar graciosamente (sem crash).

### Key Entities
- **KanbanCardRun**: modelo do card, agora com `stages`.
- **WorkflowStepper (compacto)**: componente de sequência de steps reaproveitado.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Card com `stages` renderiza a sequência com o atual destacado (teste de componente).
- **SC-002**: Card sem `stages` renderiza sem erro.

## Dependencies & Open Decisions
- **Depende de**: — (pode andar em paralelo com SET-07).
- **Habilita**: SET-09.

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/data/KanbanCard.tsx`, `src/web/client/components/navigation/WorkflowStepper.tsx`.
- **Validação**: teste de componente do card.
