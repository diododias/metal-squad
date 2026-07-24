# Feature Specification: Resíduos PT→EN — Board `FALHA / CANCELED` → `FAILED`

**Feature Branch**: `feat/vr13-residuos-pt-en-board-failed`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M3 (Tema C)
**Depende de**: —

## Objetivo

O app é todo em inglês; corrigir os resíduos em português. O caso âncora é a
coluna do Board `FALHA / CANCELED` → `FAILED`. Varrer e eliminar outros
resíduos PT na UI.

## Contexto de execução

- `pages/BoardPage.tsx:63` define a coluna:
  `{ key: 'failed', label: 'FALHA / CANCELED', items: ... }`. O `key` já é
  `failed` (correto); só o `label` está em PT/misto.
- As demais colunas já estão em EN: `'IN PROGRESS / BLOCKED'` (`:61`), `'DONE'`
  (`:62`), `TODO` (`:150`). Vale rever se `CANCELED` deve virar `ABORTED` para
  casar com o vocabulário de status (`aborted`), já que a coluna agrupa
  `failed || aborted`.
- Varredura de outros resíduos: buscar strings PT em `src/web/client/`
  (acentos, "Falha", "Salvar", "Novo", "Descartar" que sejam de UI e não de
  docs).

O que **falta**: trocar o label e rodar a varredura para não deixar outro
resíduo escapar.

## Modelo técnico

- `BoardPage.tsx:63`: `label: 'FAILED / ABORTED'` (ou `'FAILED'` se preferir
  simplificar) — decidir junto ao vocabulário de status.
- Varredura assistida: `rg -n "[À-ÿ]" src/web/client` e revisão manual dos hits
  de UI; corrigir strings visíveis ao usuário.

## Requirements

- A coluna do Board não exibe mais texto em PT.
- O rótulo é coerente com os status agrupados (`failed`/`aborted`).
- Nenhum outro resíduo PT visível permanece na UI web.

## Arquivos afetados

- `src/web/client/pages/BoardPage.tsx`.
- Outros arquivos de `src/web/client/` conforme a varredura.
- `tests/web/board-page.test.tsx` — rótulo da coluna em EN.

## Success Criteria

- **SC-001**: a coluna de falhas do Board exibe rótulo em inglês.
- **SC-002**: a varredura de resíduos PT em `src/web/client/` não retorna
  strings de UI em português.
- **SC-003**: o rótulo casa com os status que a coluna agrupa.
