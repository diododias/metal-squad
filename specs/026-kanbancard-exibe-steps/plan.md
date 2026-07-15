# Implementation Plan: KanbanCard exibe steps da feature

**Branch**: `feat/set08-kanbancard-exibe-steps` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-kanbancard-exibe-steps/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

`KanbanCard` (`src/web/client/components/data/KanbanCard.tsx`) ganha um campo opcional
`stages?: string[]` em `KanbanCardRun` e substitui o indicador único `→ {stage}` por uma variante
compacta do `WorkflowStepper` (`src/web/client/components/navigation/WorkflowStepper.tsx`) já
existente. A abordagem técnica é estender o `WorkflowStepper` com dois props de apresentação/estado
(`size?: 'default' | 'compact'` e `allPending?: boolean`) em vez de criar um componente paralelo,
mantendo o cálculo de done/current/next centralizado em um único lugar. `KanbanCard` decide o
`currentStage` efetivo (ou `allPending`) a partir de `run.status`/`run.stage`, sem novo estado
persistido nem mudança de contrato de API.

## Technical Context

**Language/Version**: TypeScript (Node.js >=20.17), React (JSX client, sem framework SSR)

**Primary Dependencies**: React, componentes internos `src/web/client/components/core` (`Card`,
`StatusPill`, `Tag`) e `navigation/WorkflowStepper`

**Storage**: N/A — dado (`stages`) é passado via prop; preenchimento real a partir do backend é
escopo de feature subsequente (SET-09)

**Testing**: Vitest + `react-dom/server` (`renderToStaticMarkup`), padrão já usado em
`tests/web/kanban-card.test.tsx`

**Target Platform**: Web dashboard (`msq web`), navegador

**Project Type**: Web application existente (client React dentro do monorepo `msq`, sem projeto
frontend/backend separado)

**Performance Goals**: N/A — mudança de apresentação em componente já leve; sem novo I/O nem
recomputação custosa

**Constraints**: Card deve permanecer legível na largura fixa de coluna do board mesmo com 8+ steps
(User Story 3); nenhuma quebra de layout quando `stages` está ausente (User Story 2)

**Scale/Scope**: 2 arquivos de componente (`KanbanCard.tsx`, `WorkflowStepper.tsx`) + testes
correspondentes; nenhuma mudança de schema/backend/adapter

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Source of truth**: mudança está descrita em `specs/026-kanbancard-exibe-steps/spec.md` (SET-08)
  e referenciada em `docs/epics/epic -settings/features/SET-08-kanbancard-exibe-steps.md`; nenhum
  outro artefato de backlog precisa sincronizar (não altera `backlog.yaml`). **PASS**.
- **Layer ownership**: mudança fica inteiramente em `src/web/client/components/` (camada de UI);
  `KanbanCard` continua sem acessar filesystem/spawnar processo; `WorkflowStepper` continua um
  componente de apresentação pura. **PASS**.
- **Validation**: baseline `npm run build` / `npm test` / `npm run typecheck` / `npm run lint`
  aplicável (mudança em `src/`); cobertura automatizada via `tests/web/kanban-card.test.tsx`
  estendido (ver research.md § Testing approach). **PASS**.
- **Runtime evidence**: não aplicável como "execução `msq` real" — é mudança de componente web
  sem novo `run` de orquestrador; evidência é a suite de testes + validação visual manual opcional
  via `msq web` (quickstart.md). **N/A justificado**.
- **Harness safety**: não envolve `msq-develop`/executor; segue `dev-flow` normal. **N/A**.
- **UI scope**: exclusivamente web dashboard (`src/web/client`), nenhum código de TUI tocado.
  **PASS**.

Nenhuma violação — Complexity Tracking não é necessária.

## Project Structure

### Documentation (this feature)

```text
specs/026-kanbancard-exibe-steps/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

Sem `contracts/`: não há interface externa (API/CLI) nova ou alterada — a mudança é um contrato de
props de componente React interno, já documentado em data-model.md.

### Source Code (repository root)

```text
src/web/client/
├── components/
│   ├── data/
│   │   └── KanbanCard.tsx        # +stages? no KanbanCardRun; renderiza WorkflowStepper compacto
│   └── navigation/
│       └── WorkflowStepper.tsx   # +size?, +allPending? (apresentação + marker "todos pendentes")
└── pages/
    └── RunDetailPage.tsx          # consumidor existente do WorkflowStepper — não deve regredir

tests/web/
└── kanban-card.test.tsx           # estendido com os cenários de stages/status/edge cases
```

**Structure Decision**: projeto web único já existente (`src/web/client`), sem necessidade de novo
diretório/pacote. A mudança é local a dois componentes e sua suite de testes; `RunDetailPage.tsx` é
o único outro consumidor de `WorkflowStepper` e deve continuar funcionando sem props novos
(`size`/`allPending` opcionais, default preserva comportamento atual).

## Complexity Tracking

*Não aplicável — Constitution Check não reportou violações.*
