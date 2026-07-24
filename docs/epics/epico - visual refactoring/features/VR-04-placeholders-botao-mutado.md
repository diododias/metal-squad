# Feature Specification: Placeholders de texto → botão mutado com motivo

**Feature Branch**: `feat/vr04-placeholders-botao-mutado`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M1 (Tema A)
**Depende de**: VR-02

## Objetivo

Eliminar os placeholders de texto que hoje substituem botões — "It is running;
cancel it first", "It has run history and can be archived but not deleted" — e
transformá-los no estado visual do próprio botão: `Cancel`/`Archive` renderizado
**mutado (desabilitado)** com o motivo em `title`/tooltip no hover.

## Contexto de execução

- `components/LifecycleActions.tsx` já carrega `allowed.blockedReason` do
  servidor e hoje o renderiza como **texto solto** ao lado de `Cancel`
  (`allowed.cancel` → `<span>{allowed.blockedReason ?? 'Running.'}</span>`) e no
  ramo "delete recusado mas não running" (`!allowed.cancel && !allowed.delete &&
  allowed.blockedReason` → `<span>`). Esse texto é justamente o placeholder a
  matar.
- `components/core/Button.tsx` já suporta `disabled` e `title` (usado em vários
  pontos, ex. Start com `eligibility.reason` em `BacklogItemDetail`).

O que **falta**: trocar os `<span>` de motivo por um botão desabilitado
correspondente (`Cancel` mutado quando running mas sem `onRequestCancel`;
`Archive` mutado com motivo "has history → archive only") mantendo o texto só
como `title` do botão.

## Modelo técnico

- Em `LifecycleActions`, substituir os dois ramos de `<span>` de
  `blockedReason` por um `Button disabled title={blockedReason}` com o rótulo da
  ação bloqueada (`Cancel` ou `Archive`, conforme o caso).
- Preservar a acessibilidade: `title` no botão + `aria-disabled`; o motivo
  continua legível por leitor de tela.
- Nenhuma mudança no cálculo de `allowed` (servidor) — só apresentação.

## Requirements

- Nenhum motivo de bloqueio aparece como frase solta na UI: sempre vira botão
  mutado com tooltip.
- O motivo real (vindo de `allowed.blockedReason`) é preservado no `title`.
- `Cancel` mutado quando running e não cancelável daqui; `Archive` mutado no
  caso "tem histórico".

## Arquivos afetados

- `src/web/client/components/LifecycleActions.tsx` — remove `<span>` de motivo,
  usa botão desabilitado.
- `tests/web/lifecycle-actions.test.tsx` — motivo aparece como `title` de botão
  desabilitado, não como texto solto.

## Success Criteria

- **SC-001**: item running mostra `Cancel` desabilitado com motivo no hover, não
  a frase "It is running; cancel it first".
- **SC-002**: item com histórico mostra `Archive` disponível e nenhum texto
  "can be archived but not deleted" solto — o motivo do delete recusado vai para
  o `title`.
- **SC-003**: leitores de tela ainda acessam o motivo via `title`/`aria`.
