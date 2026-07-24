# Feature Specification: KanbanCard — largura mínima, rolagem lateral e spinner real

**Feature Branch**: `feat/vr22-kanbancard-min-width-spinner`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M6 (Tema F)
**Depende de**: —

## Objetivo

Dois ajustes de legibilidade do Board: garantir uma **largura mínima** ao card
no desktop (permitindo **rolagem lateral** em vez de espremer as colunas), e um
**spinner de fato animado** quando há Work Item em execução.

## Contexto de execução

- **Spinner**: `StatusPill` já troca o ícone estático por
  `<span className="msq-status-spinner" />` quando `status === 'running'` e
  `spinner` está ligado (default). Verificar se a animação CSS `.msq-status-spinner`
  está definida e visível (o `plan.md` reporta "ícone parado" — pode ser CSS
  ausente/estático). O card usa `<StatusPill status={run.status} />` sem
  desligar o spinner.
- **Largura**: o Board monta colunas com
  `gridTemplateColumns: repeat(N, minmax(220px, 1fr))` (`BoardPage.tsx:125`) —
  em telas estreitas isso espreme. O `plan.md` pede min-width por card + scroll
  lateral do container.

O que **falta**: (1) confirmar/implementar a animação do spinner
(`msq-status-spinner`); (2) dar min-width ao card e trocar o layout do Board para
permitir overflow horizontal com scroll em vez de encolher abaixo do legível.

## Modelo técnico

- Spinner: garantir a keyframe CSS de rotação para `.msq-status-spinner` (nos
  estilos globais do client); nenhum novo componente.
- Board: aplicar `min-width` ao card (ou às colunas) e `overflow-x: auto` no
  container das colunas, mantendo `minmax` como piso — o container rola quando o
  total ultrapassa a viewport.

## Requirements

- Card em `running` exibe spinner animado (rotação contínua).
- Cards não encolhem abaixo de uma largura mínima legível; o Board rola
  lateralmente quando necessário.
- Comportamento mobile preservado.

## Arquivos afetados

- Estilos globais do client (keyframe `.msq-status-spinner`),
  `components/core/StatusPill.tsx` (se necessário), `pages/BoardPage.tsx`,
  `components/data/KanbanCard.tsx`.
- `tests/web/` — spinner em running; min-width/scroll do Board.

## Success Criteria

- **SC-001**: um item running mostra spinner girando.
- **SC-002**: com muitas colunas, o Board rola lateralmente sem espremer os
  cards abaixo do mínimo.
- **SC-003**: sem regressão no mobile.
