# F42 — Tela de Detalhe de Runs / Analytics com Tempo Total Somado

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Media
**Relaciona**: F17 (Analytics CLI), F18 (Duration Tracking), F16 (Cost Dashboard)

## Relato do usuario (2026-07-11)

> deve ser contabilizado tempo total somado em todas runs, faltou uma tela de
> detalhe das runs/analytics

## Problema

F17/F18 entregaram analytics CLI e tracking de duracao, mas falta uma tela
(provavelmente web dashboard) que agregue tempo total gasto somando todas as
runs de uma feature/pipeline, e sirva como detalhe de analytics navegavel a
partir da tela principal.

## Escopo provavel

- `src/db/` — queries de agregacao (soma de duration_ms entre runs)
- `src/web/static/components/` — nova tela/aba de analytics
- CLI (`src/commands/`) — se o dado tambem deve aparecer via `msq status`/
  analytics CLI existente

## Proximo passo

Revisar `docs/features/F17-analytics-cli.md` e `F18-duration-tracking.md`
para entender o que ja existe de agregacao antes de desenhar a tela nova —
evitar duplicar logica de soma de tempo que ja possa existir.
