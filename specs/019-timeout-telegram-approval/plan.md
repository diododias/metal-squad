# Implementation Plan: F55 — Aprovação via Telegram ao atingir timeout

**Branch**: `019-timeout-telegram-approval` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-timeout-telegram-approval/spec.md`

## Summary

Quando um adapter exceder o timeout, o runner deve persistir uma ocorrência
idempotente, encerrar a execução corrente como bloqueada, pausar o pipeline no
ponto afetado e criar uma solicitação de decisão no tópico Telegram da feature.
Um callback `Retry` deve fazer uma única reserva atômica para repetir a mesma
etapa; `Keep blocked`, silêncio, callbacks tardios, tópicos incorretos e falhas
de entrega não podem liberar ou duplicar o pipeline. A solução estende os
eventos, o repositório SQLite e o poller existentes, mas mantém gates, inputs e
notificações não relacionadas em seus contratos atuais.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js >=20.17, ESM

**Primary Dependencies**: better-sqlite3, Vitest, Zod, Telegram Bot API via `fetch`

**Storage**: SQLite persistido em `src/db/index.ts` e acessado por `src/db/repo.ts`

**Testing**: Vitest unit/integration, com build, test, typecheck e lint como gates

**Target Platform**: processo CLI/web Node.js em Linux/macOS, Telegram configurado opcionalmente

**Project Type**: CLI/orquestrador de pipelines com dashboard web e notificações externas

**Performance Goals**: persistir e publicar a decisão em até 5s do timeout; iniciar retry único em até 10s do callback, sem polling mais agressivo que o intervalo de workflow existente

**Constraints**: SQLite deve arbitrar concorrência; nenhum retry sem decisão explícita; mensagens devem ser sanitizadas, limitadas ao tamanho do Telegram e sem segredos; falha de Telegram não pode alterar o estado de recuperação

**Scale/Scope**: uma ou mais features e pipelines concorrentes no mesmo processo/DB; uma solicitação por ocorrência de timeout; sem novo canal, política automática ou alteração do limite de timeout

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Source of truth: PASS — esta especificação e os artefatos gerados definem o
  comportamento observável e serão mantidos junto da implementação.
- Layer ownership: PASS — o design separa adapter, runner, eventos,
  notificações, poller, DB e testes.
- Validation: PASS — build, test, typecheck e lint, além de cobertura focada,
  estão definidos em [quickstart.md](quickstart.md).
- Runtime evidence: PASS para a etapa posterior de implementação/QA — rows
  persistidas e saída/eventos úteis serão exigidos; este plano não reivindica
  uma execução live.
- Harness safety: PASS — a validação do executor usará `msq-develop`, rebuild
  antes da execução, sem implementar manualmente a feature alvo nem iniciar
  runner aninhado.
- UI scope: PASS — não há expansão do TUI; qualquer exposição de estado usa o
  dashboard web e os caminhos persistidos existentes.

## Project Structure

### Documentation

```text
specs/019-timeout-telegram-approval/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/timeout-telegram-approval.md
```

### Source Code

```text
src/
├── core/
│   ├── adapters/             # timeout tipado e propagação do adapter
│   ├── events/               # tipos, persistência e notificação de timeout
│   ├── notify/               # mensagem, entrega e callbacks Telegram
│   └── runner/               # pausa, espera e retry do estágio afetado
└── db/
    ├── index.ts              # schema/migrations SQLite
    └── repo.ts               # operações atômicas de timeout/recuperação

tests/
├── core/                     # runner, eventos e Telegram
└── db/                       # migração, idempotência e concorrência
```

**Structure Decision**: Single TypeScript project. A mudança reutiliza os
limites existentes; comandos delegam, o runner orquestra, o DB arbitra estados,
o Telegram trata transporte e o dashboard não acessa filesystem, processos ou
SQLite diretamente.

## Design Summary

- Adapters expõem um sinal de timeout contendo `timeoutMs`, `runtimeMs` e
  progresso sanitizado; o runner não infere timeout de texto localizado.
- SQLite adiciona `timeout_occurrences`, `timeout_approval_requests` e
  `recovery_decisions`. A ocorrência é única por `run_id`; a solicitação é
  única por ocorrência; resolução e claim de retry usam compare-and-set.
- `executeStageRun` persiste a ocorrência antes de emitir
  `timeout:approval-created`, marca o run bloqueado, pausa o pipeline e espera
  decisão. Retry retorna um controle tipado para `executeStagedFeature`, que
  reentra somente no estágio afetado; Keep blocked mantém o bloqueio e silêncio
  não cria tentativa.
- A solicitação registra entrega `pending`, `sent` ou `failed`, tentativas e
  erro. O poller valida request, feature, run, stage, chat e tópico antes da
  resolução; falha de Telegram nunca equivale a aprovação.

## Complexity Tracking

Nenhuma violação constitucional requer justificativa. As três tabelas novas
existem para cumprir idempotência, auditoria e falha de entrega, que não são
representáveis sem ambiguidade por `gates` ou `stage_requests` existentes.
