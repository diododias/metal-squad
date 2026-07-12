# Implementation Plan: Perguntas Interativas via Telegram (Botoes)

**Branch**: `012-telegram-interactive-questions` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-telegram-interactive-questions/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Quando um step do `msq` (ex. `specify`) faz uma pergunta de esclarecimento
via o contrato existente `MSQ_INPUT_REQUIRED:` (mecanismo de deteccao
pergunta-vs-aprovacao de H19, ja implementado em
`src/core/adapters/control.ts` + `src/core/runner/execute.ts`), a
notificacao Telegram hoje sempre exige resposta em texto livre. Esta
feature adiciona um segundo formato de output opcional (`OPTIONS:` — ver
`contracts/control-signal-format.md`) que, quando presente e valido,
resulta em uma mensagem Telegram com um botao inline por opcao. Tocar no
botao propaga a mesma resposta que digitar o rotulo da opcao produziria
hoje, reaproveitando o pipeline de resolucao existente
(`resolveStageRequest`) sem alterar seu contrato. Quando o output nao
tem opcoes discretas parseaveis/validas, ou quando se trata de uma
aprovacao de gate (nao pergunta), o comportamento e identico ao atual —
nao ha novo "modo", apenas um caminho adicional que so ativa quando os
dados permitem.

## Technical Context

**Language/Version**: TypeScript (Node.js >=20.17.0), ESM (`"type": "module"`)

**Primary Dependencies**: `better-sqlite3` (persistencia), `commander` (CLI),
`ink`/`react` (TUI — nao tocada por esta feature), Telegram Bot API via
`fetch` nativo (sem SDK) em `src/core/notify/telegram.ts`

**Storage**: SQLite local (`src/db/index.ts`), banco global via
`src/config/index.ts` (`~/.local/share/metal-squad/app.db`) — ver
`.claude/rules/harness.md` para regras de `MSQ_DB_PATH` em harness

**Testing**: Vitest (`rtk npm test`), suites focadas por area em `tests/`

**Target Platform**: CLI Node.js (macOS/Linux), processo long-running para
o `TelegramPoller` (long-polling `getUpdates`)

**Project Type**: single project (CLI/orquestrador) — sem frontend/backend
separados; `src/web/` e uma UI estatica servida pelo mesmo processo, fora
de escopo desta feature

**Performance Goals**: N/A — feature nao tem requisito de throughput;
volume de perguntas/aprovacoes e baixo (interacao humana)

**Constraints**: limite de 4096 caracteres por mensagem Telegram; limite
pratico de 64 bytes para `callback_data`; no maximo 1 pergunta pendente
por step ativo (Assumption da spec, ja e o modelo atual de
`stage_requests`)

**Scale/Scope**: alteracao localizada em ~7 arquivos existentes (adapters,
runner, db, events, notify) + testes correspondentes; nenhuma tabela nova,
1 coluna nova em `stage_requests`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` neste repositorio ainda esta no
template placeholder (sem principios preenchidos) — nao ha gates
formais de constituicao a avaliar. As regras de arquitetura reais deste
projeto vivem em `.claude/rules/architecture.md` e sao tratadas como o
gate de fato:

- **Ownership por pasta respeitado**: extracao de opcoes fica no adapter
  (`src/core/adapters/control.ts`, que ja "traduz o prompt para cada tool e
  normaliza retorno"); persistencia fica em `src/db/`; dispatch de
  notificacao fica em `src/core/events/` + `src/core/notify/`; nenhuma
  logica de negocio nova entra em `src/commands/` ou `src/ui/`.
  **PASS**.
  Compare with Complexity Tracking. Sem violacoes a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/012-telegram-interactive-questions/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── control-signal-format.md
│   └── telegram-notification-dispatch.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── adapters/
│   │   ├── control.ts        # MODIFICADO — parseControlSignal extrai options do bloco OPTIONS:
│   │   └── types.ts          # MODIFICADO — RunControl.options?: string[]
│   ├── runner/
│   │   └── execute.ts        # MODIFICADO — instrui formato OPTIONS: no prompt; propaga options a createStageRequest
│   ├── events/
│   │   ├── types.ts          # MODIFICADO — StageRequestCreatedEvent.options?: string[]
│   │   └── notifications.ts  # MODIFICADO — monta reply_markup com botoes de opcao para kind:'input'
│   └── notify/
│       ├── telegram.ts         # MODIFICADO — split de mensagem > 4096 chars, reply_markup so no ultimo fragmento
│       └── telegram-poller.ts  # MODIFICADO — novo formato de callback input:<id>:<index>
├── db/
│   ├── index.ts               # MODIFICADO — migracao: coluna stage_requests.options
│   └── repo.ts                 # MODIFICADO — createStageRequest/getStageRequest/StageRequestRow cientes de options

tests/
├── core/
│   ├── control.test.ts                     # ESTENDIDO — parsing de OPTIONS:, fallback, limites
│   ├── events-notifications.test.ts        # ESTENDIDO — reply_markup com botoes
│   ├── events-notifications-full.test.ts   # ESTENDIDO (se aplicavel)
│   ├── notify-telegram.test.ts             # ESTENDIDO — split de mensagem longa
│   └── notify-telegram-poller.test.ts      # ESTENDIDO — callback input:<id>:<index>
├── db/
│   ├── repo.test.ts / repo-extended.test.ts  # ESTENDIDO — options em stage_requests
│   └── index-migrate.test.ts                 # ESTENDIDO — nova coluna
└── runner/
    └── execute.test.ts                        # ESTENDIDO — control.options propagado a createStageRequest
```

**Structure Decision**: projeto single-project ja existente (`msq` CLI).
Nenhum diretorio novo de topo — a feature e uma extensao localizada de 5
modulos ja mapeados em `.claude/rules/repo-context.md`
(`adapters`, `runner`, `db`, `events`, `notify`). Sem mudanca de UI
(`src/ui/`, `src/web/`) — escopo e Telegram-only conforme a spec.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Nenhuma violacao — secao nao aplicavel.
