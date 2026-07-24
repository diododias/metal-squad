# Feature Specification: Run Detail — hover no Live Output e badge feature/bug

**Feature Branch**: `feat/vr26-run-detail-hover-live-output-badge`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M6 (Tema F)
**Depende de**: VR-14

## Objetivo

Dois refinamentos da Run Detail: destacar a linha do **Live Output** ao passar
o mouse (hover), e garantir o badge **feature/bug** também nesta tela (fecha o
que VR-14 iniciou).

## Contexto de execução

- Live Output: a aba `output` renderiza `AgentTranscript` com `combinedOutput`
  (linhas + tool calls ordenadas). Cada entrada vira uma linha do transcript;
  hoje não há realce no hover.
- Badge feature/bug: a Run Detail não renderiza o tipo hoje (gap tratado em
  VR-14, que extrai `WorkItemTypeBadge`). Este item **consome** esse componente
  no header da Run Detail.

O que **falta**: (1) estilo de hover por linha no `AgentTranscript`/itens do
transcript; (2) colocar o `WorkItemTypeBadge` no header da Run Detail.

## Modelo técnico

- `components/transcript/AgentTranscript.tsx` (e/ou `AgentMessage`): adicionar
  realce de hover por item (background sutil `--bg-panel-alt` / `--accent-info-10`
  no `:hover`), sem quebrar densidade.
- Run Detail: renderizar `WorkItemTypeBadge` (VR-14) ao lado do título/estado.

## Requirements

- Passar o mouse sobre uma linha do Live Output a destaca.
- A Run Detail exibe o badge feature/bug (mesmo componente das outras
  superfícies).
- Sem perda de performance no transcript longo (hover é CSS, não JS por item).

## Arquivos afetados

- `src/web/client/components/transcript/AgentTranscript.tsx` (hover),
  `pages/RunDetailPage.tsx` (badge).
- `tests/web/` — badge presente; classe/estilo de hover aplicável.

## Success Criteria

- **SC-001**: hover em uma linha do Live Output a realça.
- **SC-002**: a Run Detail mostra o badge feature/bug.
- **SC-003**: o transcript continua fluido com muitas linhas.
