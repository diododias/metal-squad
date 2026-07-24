# Feature Specification: Markdown em descrições de Project/Epic e clareza Auto Advance/Start

**Feature Branch**: `feat/vr30-markdown-descricoes-clareza-auto`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M7 (Tema G)
**Depende de**: VR-15, VR-20

## Objetivo

Dois polimentos: descrições de **Project** e **Epic** renderizam markdown
(consistente com a Spec), e os rótulos/tooltips deixam claro **quando** cada um
age — Auto Advance vs Auto Start.

## Contexto de execução

- Markdown já disponível: `components/MarkdownView.tsx` (react-markdown). Hoje
  descrições de Project/Epic aparecem como texto cru (`ProjectDetailPage`
  `description` via header; `EpicDetailPage` `<p>` — tratado em VR-15/VR-16). Aqui
  garante-se o **render markdown** em ambas.
- Auto Advance/Auto Start: os toggles vivem em `FeatureConfigDetail`
  (`autoAdvance` no workflow, `autoStart` na execução). VR-20 os agrupa no bloco
  Behaviour; este item foca na **explicação** (labels/tooltips), reutilizável
  também no card (VR-23).

O que **falta**: passar as descrições de Project/Epic por `MarkdownView` e
adicionar textos de ajuda claros: Auto Start = inicia a run automaticamente
quando elegível; Auto Advance = avança de stage sem aprovação manual (só em
`mode = staged`).

## Modelo técnico

- Descrições: `ProjectDetailPage`/`EpicDetailPage` renderizam a descrição via
  `MarkdownView` no slot do header (coordena com VR-15/VR-16).
- Clareza: rótulos + `title`/tooltip nos toggles de Behaviour (VR-20) e nas
  células do card (VR-23), com cópia curta e consistente.

## Requirements

- Descrições de Project e Epic renderizam markdown.
- Auto Advance e Auto Start têm rótulos/tooltips que explicam quando agem.
- A cópia é a mesma no detalhe e no card.

## Arquivos afetados

- `src/web/client/pages/ProjectDetailPage.tsx`, `EpicDetailPage.tsx`
  (markdown), `components/FeatureConfigDetail.tsx`, `components/data/KanbanCard.tsx`
  (tooltips).
- `tests/web/` — markdown nas descrições; presença dos tooltips.

## Success Criteria

- **SC-001**: descrições de Project e Epic renderizam markdown.
- **SC-002**: Auto Advance/Auto Start têm ajuda explicando seu papel.
- **SC-003**: a explicação é consistente entre detalhe e card.
