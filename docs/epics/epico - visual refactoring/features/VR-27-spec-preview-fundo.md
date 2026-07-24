# Feature Specification: Spec Preview — fundo menos agressivo

**Feature Branch**: `feat/vr27-spec-preview-fundo`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M6 (Tema F)
**Depende de**: —

## Objetivo

Suavizar o contraste da leitura da Spec: o fundo preto/branco puro é agressivo
para leitura longa. Usar um fundo menos escuro (token de painel), consistente
com o resto do app.

## Contexto de execução

- O preview da spec usa `MarkdownView` (`components/MarkdownView.tsx`), que
  aplica `baseStyle` com `color: var(--text-primary)` mas **sem** background
  próprio — o fundo vem do contêiner (`BacklogItemDetail` preview pane / aba spec
  da Run Detail).
- `BacklogItemDetail.tsx` alterna `specView` entre `edit` e `preview`; o pane de
  preview é onde o contraste incomoda. Os tokens de superfície existem
  (`--bg-panel`, `--bg-panel-alt`, `--bg-sunken`).

O que **falta**: aplicar um background de painel suave ao contêiner de preview
da spec (em vez de preto/branco puro), sem alterar o `MarkdownView` globalmente.

## Modelo técnico

- No contêiner de preview (BacklogItemDetail e aba spec da Run Detail), definir
  `background: var(--bg-panel)` (ou `--bg-sunken`) com padding, dando um "cartão"
  de leitura de contraste reduzido. Passar via `className`/`style` do
  `MarkdownView` (já suportados) sem tocar o `baseStyle` compartilhado.

## Requirements

- O preview da Spec usa um fundo de painel suave, não preto/branco puro.
- O ajuste é no contêiner de preview, sem alterar o `MarkdownView` de outros
  usos.
- Legibilidade preservada no tema escuro.

## Arquivos afetados

- `src/web/client/pages/BacklogItemDetail.tsx`, `pages/RunDetailPage.tsx`
  (contêiner do preview).
- `tests/web/` — classe/estilo de fundo aplicada ao preview.

## Success Criteria

- **SC-001**: o preview da Spec tem fundo de painel suave.
- **SC-002**: outros usos do `MarkdownView` não mudam.
- **SC-003**: o contraste do texto continua legível.
