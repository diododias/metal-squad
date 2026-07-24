# Feature Specification: Grafo de dependências do Epic (ordem de implementação/revisão)

**Feature Branch**: `feat/vr31-grafo-dependencias-epic`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M8 (Tema H)
**Depende de**: VR-01, VR-12

## Objetivo

Dar ao Epic uma visualização do **grafo de dependências** entre seus Work Items,
mostrando a **ordem de implementação** e a **ordem de revisão/merge** — hoje só
há `DependencyTag` por item, sem visão de conjunto.

## Contexto de execução

- O orquestrador **já tem o grafo**: `src/core/orchestrator/` faz ordenação
  topológica e scheduling a partir de `dependsOn`. A informação de dependências
  existe no dado (`feature.dependsOn`, `DependencyTag`).
- No web, hoje as deps aparecem só como tags por item
  (`FeatureConfigDetail.DependencyTag`), sem grafo. O épico Projetos-Front
  declarou explicitamente "visualização do grafo de dependências" como
  **melhoria futura** (ver `ROADMAP` de PF, não-escopo) — este VR a realiza.

O que **falta**: expor a ordenação topológica ao cliente (via snapshot/derivação)
e renderizar um grafo navegável no detalhe do Epic, com ordem de implementação e
de revisão/merge.

## Modelo técnico

- **Dado**: reusar a ordenação do `orchestrator` (ou derivá-la no cliente a
  partir de `dependsOn` dos Work Items do Epic). Se derivar no cliente, isolar a
  toposort em `lib/` com detecção de ciclo.
- **Render**: grafo leve (SVG/canvas simples ou lib já disponível no bundle;
  evitar dependência nova pesada). Nós = Work Items (com short id `E…/F…/B…` de
  VR-12 e `pillStatus` de VR-01), arestas = dependências; realçar a ordem
  linearizada (implementação) e a ordem de revisão/merge.
- Superfície: nova seção/aba no `EpicDetailPage`.

## Requirements

- O Epic mostra um grafo das dependências entre seus Work Items.
- O grafo indica a ordem de implementação e a de revisão/merge.
- Ciclos são detectados e sinalizados, não quebram a tela.

## Arquivos afetados

- `src/web/client/pages/EpicDetailPage.tsx` (+ componente de grafo),
  `src/web/client/lib/` (toposort/derivação), possível exposição do
  orchestrator no snapshot.
- `tests/web/` — grafo com ordem correta; ciclo sinalizado.

## Success Criteria

- **SC-001**: o detalhe do Epic exibe o grafo de dependências dos Work Items.
- **SC-002**: o grafo mostra ordem de implementação e de revisão/merge.
- **SC-003**: um ciclo é sinalizado sem quebrar a visualização.
