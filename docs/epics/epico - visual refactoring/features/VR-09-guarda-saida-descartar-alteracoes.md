# Feature Specification: Guarda de saída com modal "Descartar alterações?"

**Feature Branch**: `feat/vr09-guarda-saida-descartar-alteracoes`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M2 (Tema D)
**Depende de**: VR-08

## Objetivo

Impedir a perda de trabalho ao navegar: com a página _dirty_, tentar sair ou
avançar abre um modal "Descartar alterações?" com **Cancelar** (fica) e
**Descartar** (sai perdendo). Complementa VR-08.

## Contexto de execução

- A navegação é por hash: `App.tsx` tem `navigate(path)` (`:210`) e
  `hashState`/`routes.ts` orquestram as rotas. Não há hoje interceptação de
  navegação com pendências.
- O primitivo de modal existe: `components/feedback/Modal.tsx` (usado pela
  confirmação de delete em `LifecycleActions`).
- O `isDirty` por página vem de VR-08 (`usePageDirtyState`).

O que **falta**: um guard que, quando `isDirty`, intercepte `navigate` (e o
`beforeunload` do browser para reload/fechar aba) e peça confirmação antes de
descartar.

## Modelo técnico

- `hooks/useUnsavedGuard.ts` (novo): recebe `isDirty` e um `onConfirmLeave`;
  registra `beforeunload` e envolve `navigate` para abrir o `Modal` de descarte
  quando há pendências.
- Integração no `App.tsx`/páginas que usam VR-08: o guard decide se a navegação
  prossegue ou abre o modal.
- Modal reusa `feedback/Modal.tsx`: título "Descartar alterações?", ações
  `Cancelar`/`Descartar` (destructive).

## Requirements

- Navegar/avançar com página dirty abre o modal; `Cancelar` mantém o estado,
  `Descartar` sai perdendo as alterações.
- `beforeunload` protege reload/fechamento de aba com pendências.
- Página limpa (não dirty) navega direto, sem modal.

## Arquivos afetados

- `src/web/client/hooks/useUnsavedGuard.ts` (novo).
- `src/web/client/App.tsx` (ou wrapper de navegação) e páginas com VR-08.
- `tests/web/` — navegação bloqueada com dirty; liberada após salvar/descartar.

## Success Criteria

- **SC-001**: sair de uma página dirty abre "Descartar alterações?".
- **SC-002**: `Cancelar` mantém as alterações e a página; `Descartar` navega
  perdendo-as.
- **SC-003**: página sem alterações navega sem modal.
