# Feature Specification: Run Detail — 1ª aba Feature Spec e consolidação da aba Workflow

**Feature Branch**: `feat/vr24-run-detail-abas-consolidar-workflow`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M6 (Tema F)
**Depende de**: —

## Objetivo

Reordenar as abas da Run Detail para abrir na **Feature Spec** e eliminar a
**redundância** entre `Run Summary` e `Workflow` — a aba Workflow está obsoleta
e duplica o breakdown de tarefas do Run Summary.

## Contexto de execução

- `RunDetailPage.tsx` define as abas: `summary`, `spec`, `workflow`, `config`,
  `output` (`TABS`, `:34-40`) e abre em `summary` (`useState('summary')`, `:123`).
- A aba **spec** já renderiza a Feature Spec com `MarkdownView`
  (`feature.description`, `:308-314`) — o markdown já funciona.
- A aba **workflow** (`:316-328`) lista `feature.tasks` (id/title/status). O
  **Run Summary** já mostra `WorkflowStepper` + `stageGroups` (done/total/tokens
  por stage via `summarizeTaskRuns`) — ou seja, o breakdown de tarefas é coberto
  ali. A aba Workflow é a duplicata/obsoleta citada no `plan.md`.

O que **falta**: (1) `spec` como primeira aba e aberta por padrão; (2) remover a
aba `workflow` (ou fundir seu conteúdo útil no Run Summary, se houver algo não
coberto).

## Modelo técnico

- Reordenar `TABS` para `spec` primeiro; `useState` inicial → `'spec'`.
- Remover a entrada `workflow` de `TABS` e o `tabContent.workflow`; conferir se
  `feature.tasks` traz algo além do que `stageGroups` já mostra — se sim, migrar
  para o Run Summary; se não, apenas remover.

## Requirements

- A Run Detail abre na Feature Spec.
- Não há mais aba Workflow redundante; nada útil se perde (migrado ao Run
  Summary se necessário).
- A ordem sugerida é `Feature Spec → Run Summary → Feature Config → Live Output`.

## Arquivos afetados

- `src/web/client/pages/RunDetailPage.tsx`.
- `tests/web/run-detail-page.test.tsx` — aba inicial spec; ausência da aba
  workflow.

## Success Criteria

- **SC-001**: abrir uma run mostra a Feature Spec primeiro.
- **SC-002**: a aba Workflow não existe mais; o breakdown por stage continua no
  Run Summary.
- **SC-003**: nenhuma informação de tarefas se perde.
