# Implementation Plan: Live Output — Hierarquia Visual e Cores Mutadas

**Branch**: `010-live-output-visual-hierarchy` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-live-output-visual-hierarchy/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Reduzir a competicao visual das entries de tool call no painel Live Output do
detalhe de run (dashboard web), fazendo com que a narrativa do agente
continue sendo o elemento mais proeminente da tela. Abordagem: remover o
tratamento de "card" das entries `tool` em `src/web/static/styles.css`
(borda, background, padding tipo bloco, largura de borda-a-borda) e
substituir por um estilo compacto e mutado, alinhado ao `.output-entry
.heartbeat` ja existente (cor `--muted`, sem card), preservando um
indicador/prefixo curto para distincao semantica. Nenhuma mudanca em
`src/web/static/components/RunDetail.js` alem, no maximo, de ajustar o
prefixo/label renderizado para `entry.source === 'tool'`; a fonte de dados,
o streaming e o polling do Live Output permanecem intocados. TUI (`src/ui/`)
fica fora de escopo.

## Technical Context

**Language/Version**: JavaScript (ES modules, sem build step) para o dashboard web, servido por `src/web/`

**Primary Dependencies**: React via `htm`/`preact` ou equivalente ja usado em `src/web/static/components/*.js` (ver imports existentes); nenhuma dependencia nova

**Storage**: N/A — mudanca e puramente de apresentacao (CSS/markup), sem tocar SQLite/`src/db/`

**Testing**: Nao ha suite automatizada para os componentes de `src/web/static/` hoje (`tests/web/` cobre `server.test.ts` e `state.test.ts`, nao renderizacao); validacao desta feature e visual/manual conforme SC-001..SC-004, comparando o painel antes/depois com uma run real ou fixture local

**Target Platform**: Browser (dashboard web servido por `msq ui`/`src/web/`)

**Project Type**: web (frontend estatico sem build, backend Node servindo os assets)

**Performance Goals**: N/A — sem novo trabalho computacional; troca e so de CSS/markup, sem impacto perceptivel de performance

**Constraints**: Nao alterar streaming/polling do Live Output (FR-007); nao alterar TUI (FR-008); preservar contraste de narrativa (FR-003) e de stderr (FR-004); manter distincao dos 4 tipos de entry (FR-006)

**Scale/Scope**: Escopo restrito a `src/web/static/styles.css` (regras `.output-entry.tool` e vizinhas) e, se necessario, ao label/prefixo em `renderOutputEntry` de `src/web/static/components/RunDetail.js` (~linhas 137-165)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` ainda esta no template placeholder (sem
principios ratificados) — nao ha gates de constituicao ativos para avaliar
nesta feature. Seguindo `.claude/rules/architecture.md`, a mudanca respeita a
ownership de `src/ui/` sendo composicao/formatacao (aqui, `src/web/static/`
como equivalente de apresentacao web) sem acesso a filesystem/spawn de
processos — nao ha violacao a registrar.

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
src/web/
├── static/
│   ├── styles.css                    # regras .output-entry.tool/.heartbeat/.stderr — alvo principal
│   └── components/
│       └── RunDetail.js              # renderOutputEntry(entry, maxWidth, fallbackIndex), linhas ~137-165
├── server.ts / routes/ (nao tocados) # servem os assets estaticos e o stream de eventos
tests/
└── web/
    ├── server.test.ts                # cobre backend/API; nao cobre renderizacao
    └── state.test.ts                 # cobre estado; nao cobre renderizacao
```

**Structure Decision**: Aplicacao web unica servida por `src/web/` (backend
Node + assets estaticos sem build step). A mudanca fica contida em
`src/web/static/styles.css` (novo estilo compacto/mutado para
`.output-entry.tool`) e, se preciso um prefixo/indicador textual explicito,
em `renderOutputEntry` dentro de `src/web/static/components/RunDetail.js`.
Nao ha camada de backend, banco ou TUI envolvida (`src/ui/` fica fora de
escopo por FR-008).

## Complexity Tracking

*Sem violacoes de constituicao — secao nao se aplica (constituicao ainda em
placeholder, nenhum gate ativo).*
