# Feature Specification: Bloco Requirements (Spec + Context + Dependências editáveis)

**Feature Branch**: `feat/vr18-bloco-requirements`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M5 (Tema E)
**Depende de**: VR-15

## Objetivo

Reorganizar a página de Work Item em blocos com propósito claro. O primeiro é
**Requirements** (renomeado de "Spec & Context"), que absorve as **Dependências**
(editáveis aqui) além de Spec e Context.

## Contexto de execução

- `pages/BacklogItemDetail.tsx` tem hoje uma `<section>` "Specification" com
  editor + preview (`specDraft`, `specView`, save por bloco `:244`) e delega o
  restante a `FeatureConfigDetail`.
- Dependências: `FeatureConfigDetail` exporta `DependencyTag` (`:59`,
  `{ depId, doneFeatureIds, failedFeatureIds }`) — hoje as deps aparecem como
  **tags read-only**, não editáveis no detalhe. `action:createWorkItem` aceita
  `dependsOn` (`types.ts:571`), mas a edição pós-criação de dependências é o gap.
- Context: os arquivos de contexto entram no prompt apenas como caminhos
  (`feature.context`, ver CLAUDE.md) — o bloco Requirements exibe/edita a lista
  de caminhos, não o conteúdo.

O que **falta**: unir Spec + Context + Dependências num bloco "Requirements" com
edição de dependências (add/remove com validação contra ciclos/itens
inexistentes — provável apoio de action existente ou nova; declarar se backend).

## Modelo técnico

- Renomear a `<section>` "Specification" para "Requirements" e agrupar:
  editor/preview de spec (mantém), lista de `context` (caminhos), e edição de
  `dependsOn` (add/remove com `DependencyTag` + input).
- Edição de dependências: se houver action de update de deps, reusar; senão,
  declarar dependência de backend (patch de `dependsOn` no Work Item, validado
  contra ciclo). Save sob o padrão global (VR-08).

## Requirements

- Um único bloco "Requirements" reúne Spec, Context (caminhos) e Dependências.
- Dependências são editáveis (add/remove), com feedback de done/failed
  (`DependencyTag`).
- Edição inválida (ciclo, dep inexistente) é recusada com mensagem acionável.

## Arquivos afetados

- `src/web/client/pages/BacklogItemDetail.tsx`,
  `components/FeatureConfigDetail.tsx` (deps editáveis).
- Backend (se necessário): patch de `dependsOn`.
- `tests/web/` — bloco Requirements; edição de deps; validação.

## Success Criteria

- **SC-001**: a página do Work Item tem um bloco "Requirements" com Spec,
  Context e Dependências.
- **SC-002**: adicionar/remover uma dependência persiste e reflete o estado
  done/failed.
- **SC-003**: dependência inválida é recusada com mensagem clara.
