# Feature Specification: Edição de Epic

**Feature Branch**: `feat/prj13-edit-epic`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M4
**Depende de**: PRJ-11, PRJ-12

## Objetivo

Permitir editar um **Epic** pela web: título, descrição, posição e o **status
manual** (`todo|in_progress|done`), com controle de concorrência por revisão. O
ponto-chave é manter o status manual do Epic estritamente separado do progresso
derivado das runs.

## Contexto de execução

Hoje o Epic é anêmico: `EpicSchema` (`src/core/backlog/schema.ts:187-191`) tem só
`id`, `title` e `features` — sem `description`, sem `status`, sem `position`. As
colunas `description`/`status`/`revision` nascem em PRJ-01 e a ação de escrita
`action:updateEpic` (com `patch` incluindo status manual) nasce em PRJ-11. Esta
feature é a **UI** que dispara `updateEpic` a partir do detalhe do Project
(PRJ-12).

Status derivado × manual (ponto de atenção do ROADMAP §Status e da SPEC §8): o
Kanban usa **status de execução** derivado das runs (`BoardPage.tsx:51-54`, colunas
por `r.status`), enquanto o Epic passa a ter **status manual** definido pelo
usuário. Editar o status do Epic **não** pode recalcular nada por runs nem mover
cards do Board. O progresso derivado (quantos Work Items done) é exibido à parte,
apenas informativo.

Concorrência: `action:updateEpic` carrega `expectedRevision`; divergência gera
`REVISION_CONFLICT` (PRJ-03). A UI preserva o draft e permite recarregar/reaplicar
— mesmo padrão de PRJ-08/PRJ-13 para todas as edições. Auditoria: toda mutação
grava `audit_events` na mesma transação (PRJ-03).

Primitivos: `EditableTextField` para título/descrição, `EditableSelectField`
(`src/web/client/components/core/EditableSelectField.tsx`) para o status manual,
`send` via `useWebSocket` (`App.tsx:100`) com `requestId`.

## Modelo técnico

- `action:updateEpic { requestId, epicId, patch, expectedRevision }` onde `patch`
  pode conter `title`, `description`, `position`, `status`.
- `EpicSchema`/`EpicInputSchema` (PRJ-01) já aceitam `description` +
  `status: todo|in_progress|done`.
- Componente de edição de Epic no `ProjectDetailPage` (PRJ-12), com draft local +
  reconciliação em conflito.
- Progresso derivado computado do catálogo por escopo (PRJ-15), separado do campo
  `status`.

## Requirements

- Editar título, descrição, posição e status manual `todo|in_progress|done`.
- Usar `expectedRevision`; conflito preserva draft e permite recarregar/reaplicar.
- Status manual não é recalculado por runs nem move cards do Kanban.
- Mostrar progresso derivado dos Work Items separadamente do status manual.
- Archive/delete entram somente em PRJ-18.

## Arquivos afetados

- `src/web/client/pages/ProjectDetailPage.tsx` / `EpicEditor.tsx` (novo) — form de
  edição de Epic.
- `src/web/client/components/core/*` — `EditableTextField`, `EditableSelectField`.
- `src/web/types.ts` — `action:updateEpic` com status manual (PRJ-11).
- `tests/web/*` — validação, concorrência, distinção status manual × progresso.

## Success Criteria

- Edição persiste, gera audit event e atualiza apenas o Epic correto.
- Run iniciada/finalizada não altera status manual.
- Testes de componente cobrem validação, concorrência e distinção status/progresso.
