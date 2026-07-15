# Implementation Plan: Remover visão "by workflow stage"

**Branch**: `025-remover-visao-workflow-stage` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-remover-visao-workflow-stage/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Remover a visão alternativa "by workflow stage" de `BoardPage.tsx`: eliminar o estado
`viewMode`, o toggle de alternância de visão, o branch `else` que renderizava colunas por
`WORKFLOW_STAGES`, e a própria constante `WORKFLOW_STAGES`. O board passa a ter uma única
renderização, sempre por status (TODO/IN PROGRESS/DONE/FALHA), sem alternativa condicional.
É uma remoção de código puro — sem novo estado, sem nova UI, sem mudança de contrato de dados.

## Technical Context

**Language/Version**: TypeScript 5.7 (React 18.3, JSX) no client web

**Primary Dependencies**: React 18.3, esbuild (bundling do client web), Ink (não afetado — TUI
fora de escopo)

**Storage**: N/A — mudança é só de UI/renderização no client web, sem leitura/escrita SQLite

**Testing**: Vitest 3, suite em `tests/web/` (client React via análise de árvore/JSX, sem
`@testing-library/react` full DOM — seguir os padrões já usados em
`tests/web/kanban-card.test.tsx` e `tests/web/feature-identity.test.tsx`)

**Target Platform**: Dashboard web servido por `msq web` (Node.js `>=20.17` backend + bundle
client estático)

**Project Type**: Web application dentro de um monorepo CLI único — `src/web/client/` é o
frontend, `src/web/server` (se existir) é o backend; não há split `frontend/`/`backend/` em
diretórios separados

**Performance Goals**: N/A — não há requisito de performance novo; a remoção reduz um branch de
renderização

**Constraints**: Nenhuma referência remanescente a `viewMode` ou `WORKFLOW_STAGES` em
`BoardPage.tsx` ou em qualquer outro arquivo do repositório (grep confirmou hoje que só
`BoardPage.tsx` contém esses símbolos)

**Scale/Scope**: Um único arquivo de produção (`src/web/client/pages/BoardPage.tsx`); nenhuma
suite de teste dedicada a `BoardPage` existe hoje em `tests/web/` — cobertura nova precisa ser
adicionada para provar a coluna única por status (SC-001)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Source of truth: SET-07 é rastreado em `specs/025-remover-visao-workflow-stage/spec.md`;
  não há doc de feature separado em `docs/features/` para este item de limpeza — o próprio
  spec-kit é a fonte de verdade. PASS.
- Layer ownership: mudança fica inteiramente em `src/web/client/pages/BoardPage.tsx` (camada
  UI/web), sem tocar `src/commands/`, `src/core/`, `src/db/`. PASS.
- Validation: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck` e `rtk npm run lint`
  se aplicam (mudança toca TypeScript relevante em `src/`). Cobertura automatizada nova é
  necessária para SC-001 (nenhuma suite dedicada a `BoardPage` existe hoje) — ver Phase 1. PASS
  com ação: adicionar teste.
- Runtime evidence: não é uma mudança de runtime do `msq` orchestrator (sem novo estado
  persistido); evidência via `rtk npm test` + inspeção visual opcional de `msq web` é
  suficiente. N/A para os 3 sinais de execução real do executor.
- Harness safety: não envolve `msq run`/`msq-develop`; segue `dev-flow` normal.
- UI scope: trabalho é 100% no dashboard web oficial, removendo código morto — alinhado com a
  constituição (web é a UI oficial). PASS.
- Nenhuma violação a justificar em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── web/
    └── client/
        └── pages/
            └── BoardPage.tsx      # único arquivo de produção alterado

tests/
└── web/
    └── board-page.test.tsx        # novo teste dedicado (não existe hoje)
```

**Structure Decision**: monorepo CLI único (`msq`), sem split `frontend/`/`backend/` em
diretórios de topo — o client web vive em `src/web/client/`, testes correspondentes em
`tests/web/`. Esta feature toca somente `src/web/client/pages/BoardPage.tsx` e adiciona
cobertura em `tests/web/`.

## Complexity Tracking

Nenhuma violação da constitution — tabela não aplicável.
