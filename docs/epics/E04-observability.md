# E04 — Observability & Analytics

## Motivacao

O msq rastreia tokens mas nao oferece analytics agregados. Para justificar o uso e otimizar custos, precisamos de dashboards, historico, e alertas.

## Objetivo

Fornecer visibilidade completa sobre custos, performance, e taxa de sucesso — tanto na TUI quanto via CLI.

## Features

- [F16 — Token Cost Dashboard](../features/F16-cost-dashboard.md)
- [F17 — Analytics CLI (msq stats)](../features/F17-analytics-cli.md)
- [F18 — Duration & Performance Tracking](../features/F18-duration-tracking.md)
- [F19 — Notifications v2 (multi-channel)](../features/F19-notifications-v2.md)

## Impacto

- `src/db/repo.ts` — novas queries agregadas
- `src/commands/` — novo comando `stats`
- `src/ui/` — novos componentes de dashboard
- `src/core/notify/` — abstrair para multi-canal (telegram, slack, webhook)
