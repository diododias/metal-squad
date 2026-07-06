# E03 — Orchestration v2

## Motivacao

O scheduler atual tem politica unica (stop-on-fail), sem retry, sem pause/resume, sem controle granular por feature. Para uso real, o orquestrador precisa ser mais resiliente e flexivel.

## Objetivo

Evoluir o scheduler e o runner para suportar politicas de falha configuraveis, retry, pause/resume, abort individual, e melhor visibilidade do grafo de execucao.

## Features

- [F11 — Retry Policies](../features/F11-retry-policies.md)
- [F12 — Pause / Resume / Abort](../features/F12-pause-resume-abort.md)
- [F13 — Execution Graph Visualization](../features/F13-execution-graph.md)
- [F14 — Budget Caps & Cost Controls](../features/F14-budget-caps.md)
- [F15 — Event System (pub/sub interno)](../features/F15-event-system.md)

## Impacto

- `src/core/orchestrator/scheduler.ts` — retry, pause, abort logic
- `src/core/runner/execute.ts` — event emission, budget enforcement
- `src/db/` — novas tabelas para retry history, budget tracking
- Novo modulo: `src/core/events/`
