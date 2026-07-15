# Implementation Plan: Remover tab "Features & Prompts" do Config

**Branch**: `feat/set10-remover-tab-features-prompts` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-remover-tab-features-prompts/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Remover a sub-tab "Features & Prompts" e o componente local `FeaturesPromptsTab` de
`ConfigPage.tsx`, e ajustar o texto do header da página de configuração para não
mencionar mais a ressalva "read-only except Features & Prompts". A edição de
feature continua exclusivamente pelo card de detalhe (`FeatureConfigDetail`, já
usado em `BacklogItemDetail.tsx` e `RunDetailPage.tsx` desde M1) — esse componente
compartilhado **não** é removido, apenas o wrapper local e a entrada de navegação
em `ConfigPage.tsx`.

## Technical Context

**Language/Version**: TypeScript (Node.js >=20.17), React/JSX (web client)

**Primary Dependencies**: React (dashboard web `src/web/client`), componentes
internos `Tabs`, `PageHeader`, `FeatureConfigDetail`

**Storage**: N/A (mudança é puramente de apresentação; nenhum dado ou schema é
afetado)

**Testing**: Vitest (`npm test`); não existe teste dedicado de `ConfigPage.tsx`
  hoje. A cobertura relevante (`tests/web/featureConfigDetail.test.tsx`) já
  valida o fluxo de edição via card e permanece aplicável; a remoção será
  validada também por typecheck, lint, build e busca textual sem referências
  órfãs.

**Target Platform**: Web dashboard (`msq web`), navegador

**Project Type**: web (single React app servido pelo `msq web`)

**Performance Goals**: N/A — remoção de UI sem impacto de performance

**Constraints**: Não deixar referência órfã (import, tipo, rota, string) ao
componente ou à sub-tab removidos em nenhum arquivo do repositório (FR-004)

**Scale/Scope**: Um único arquivo de produção afetado (`ConfigPage.tsx`); escopo
restrito ao dashboard web, sem equivalente na TUI aposentada

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Source of truth: spec já registrada em
  `specs/027-remover-tab-features-prompts/spec.md`; esta é uma mudança de
  comportamento observável (UI) e não requer novo doc em `docs/features/` além da
  spec versionada — comportamento passado (M1: edição via card) já está
  documentado.
- Layer ownership: mudança fica inteiramente em `src/web/client/pages/ConfigPage.tsx`
  (camada de UI); nenhuma lógica de negócio, SQL ou orquestração é tocada.
- Validation: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck` e
  `rtk npm run lint` são os gates aplicáveis; não há teste automatizado dedicado
  a `ConfigPage.tsx` hoje. A cobertura existente de `FeatureConfigDetail`,
  combinada com typecheck, lint, build e busca textual (SC-003), é suficiente
  para esta remoção de UI sem lógica nova.
- Runtime evidence: não aplicável para runner `msq` — mudança não toca
  orquestrador/adapters; validação é typecheck + verificação visual do dashboard
  web (`msq web`).
- Harness safety: não aplicável — não há validação do executor `msq` nesta
  mudança.
- UI scope: mudança é exclusivamente no dashboard web (interface oficial),
  conforme já definido nas Assumptions da spec.
- Nenhuma violação identificada; Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/027-remover-tab-features-prompts/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (input)
├── checklists/          # Existing checklist artifacts
├── research.md          # Phase 0 decisions and alternatives
├── data-model.md        # Phase 1: no new persisted entities
├── quickstart.md        # Phase 1 validation guide
```

Não há pontos técnicos pendentes, entidade de dados nova ou contrato externo
novo: a mudança é uma remoção de UI interna. Os artefatos de pesquisa, modelo e
quickstart registram essas decisões e a validação manual do dashboard.

### Source Code (repository root)

```text
src/web/client/
├── pages/
│   └── ConfigPage.tsx           # Remove SUB_TABS entry 'features', FeaturesPromptsTab(), case 'features', ajusta breadcrumb do PageHeader
│   ├── BacklogItemDetail.tsx    # Não afetado — já usa FeatureConfigDetail (M1)
│   └── RunDetailPage.tsx        # Não afetado — já usa FeatureConfigDetail (M1)
├── components/
│   └── FeatureConfigDetail.tsx  # Não afetado — componente compartilhado permanece

tests/web/
└── featureConfigDetail.test.tsx # Não afetado — cobre o fluxo de edição via card
```

**Structure Decision**: Single project (dashboard web dentro do monorepo `msq`).
A mudança é isolada a `src/web/client/pages/ConfigPage.tsx`: remover a entrada
`{ id: 'features', label: 'Features & Prompts' }` de `SUB_TABS`, remover a função
`FeaturesPromptsTab`, remover o `case 'features'` no `useMemo` de conteúdo, e trocar
o texto do `breadcrumb` do `PageHeader` para não citar mais "except Features &
Prompts". Nenhum outro arquivo de produção precisa de mudança (confirmado por
busca textual — `FeatureConfigDetail` é usado apenas por
`BacklogItemDetail.tsx` e `RunDetailPage.tsx`, que já implementam o fluxo do card
desde M1).

## Complexity Tracking

*Não aplicável — nenhuma violação da Constitution Check.*
