# F31 — Dashboard Kanban Overview

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Alta
**Esforco**: High
**Depende de**: F09, F24, F29, F30

## Problema

A tela de overview da TUI mostrava runs, gates e features pendentes em paineis
separados sem um agrupamento visual claro por status, e o modelo de foco
(qual painel/atalho respondia ao teclado) tinha bordas ambiguas — gates podiam
capturar foco global mesmo sem selecao valida, e nao havia navegacao consistente
entre colunas.

## Objetivo

Reorganizar o overview em colunas estilo kanban (todo / running / gates /
done-ish), unificar o modelo de foco em tres paineis (`columns`, `gates`,
`activity`), e dar profundidade ao detail view de uma run sem depender de
scroll nativo do terminal (que o Ink nao suporta).

## Escopo entregue

### 1. Kanban columns lado a lado

- colunas renderizadas simultaneamente no overview, com `KanbanCard` unificado
  substituindo os cards duplicados de Sidebar/GatePanel
- navegacao entre colunas via teclado quando `focusPanel === 'columns'`

### 2. Modelo de foco unificado

- foco consolidado em `focusPanel: 'columns' | 'gates' | 'activity'`
- corrigido bug onde o foco em `gates` sobrevivia globalmente mesmo depois de
  a lista de gates pendentes esvaziar (orphaned focus apos resolve)

### 3. TODO preview screen

- `Enter` sobre uma feature pendente na coluna `todo` abre uma tela de preview
  (`activeView: 'preview'`) com a configuracao completa da feature
  (`FeatureConfigSection`) antes de efetivamente iniciar a run
- `Enter` deixou de iniciar a run diretamente a partir do overview

### 4. Run detail scrollavel por secao

- detail view da run com paginacao por secao (nao ha scroll nativo no Ink),
  incluindo `WorkflowStepper` sempre visivel no topo
- toggle de densidade (`view-toggle-density`, atalho `i` quando
  `focusContext === 'run-detail'`) para colapsar/expandir secoes longas

### 5. Degradacao por orcamento vertical

- `getVerticalBudget` calcula quantos cards/estatisticas cabem na altura do
  terminal e degrada a apresentacao (menos cards por coluna, stats bar
  compacta) antes do conteudo estourar verticalmente
- fallback documentado no `HelpOverlay` para modo empilhado (stacked) quando o
  terminal e estreito demais para colunas lado a lado

## Areas tecnicas afetadas

- `src/ui/App.tsx` — modelo de foco, `activeView`, `getVerticalBudget`, wiring
  de comandos
- `src/ui/components/` — `KanbanCard`, `WorkflowStepper`, `FeatureConfigSection`,
  `HelpOverlay`
- `src/ui/commands/definitions.ts` — comando `view-toggle-density`
- `src/ui/format.ts` — calculo de orcamento vertical
- `tests/ui/app.test.ts`, `tests/ui/components.test.tsx` — regressao dos bugs
  encontrados durante a implementacao

## Bugs encontrados e corrigidos durante a implementacao

- `activeView` descartava `'preview'` sempre que `selectedRun` era `null`
- `useTerminalHeight` sem mock proprio deslocava silenciosamente o indice de
  chamada de todo `useState` mockado em `app.test.ts`
- `MainPanel`/`FeatureConfigSection` quebravam com uma entrada de catalogo sem
  `.workflow`

## Criterios de aceite

- [x] Colunas kanban renderizadas lado a lado no overview
- [x] Foco unificado em `columns`/`gates`/`activity`, sem foco orfao apos
      resolver o ultimo gate pendente
- [x] Preview de feature antes de iniciar run (`Enter` nao inicia direto)
- [x] Run detail com paginacao por secao e `WorkflowStepper` sempre visivel
- [x] Toggle de densidade no run detail, registrado no command palette
- [x] Degradacao de layout por orcamento vertical, com fallback documentado
      para modo empilhado
- [x] Suite de UI cobrindo os bugs de foco/preview/catalogo encontrados
