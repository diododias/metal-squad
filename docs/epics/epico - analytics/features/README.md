# Features — Épico Analytics

Specs do épico de Analytics avançado, com foco principal em consumo de tokens.
Cada arquivo representa uma unidade de implementação/PR com aceite automatizável.
O agrupamento, as decisões transversais e o caminho crítico estão em
[`../ROADMAP.md`](../ROADMAP.md).

## M0 — Governança

- [ANA-00 — ADR: métricas, escopo e semântica de tokens](ANA-00-adr-metricas-escopo-analytics.md)

## M1 — Telemetria confiável

- [ANA-01 — Saneamento de telemetria de tokens](ANA-01-saneamento-telemetria-tokens.md)
- [ANA-02 — Snapshots de modelo, effort e perfil de custo na run](ANA-02-snapshots-modelo-custo-run.md)

## M2 — Backend de agregações

- [ANA-03 — Queries agregadas de Analytics](ANA-03-queries-agregadas-analytics.md)
- [ANA-04 — Contrato de state/WS para Analytics](ANA-04-contrato-state-ws-analytics.md)

## M3 — Work Items e drilldown

- [ANA-12 — UX e telas da página Analytics](ANA-12-ux-telas-analytics.md)
- [ANA-05 — Listagem completa de Work Items por consumo total](ANA-05-listagem-features-consumo-total.md)
- [ANA-08 — Drilldown por run, stage e task](ANA-08-drilldown-run-stage-task.md)

## M4 — Gráficos principais

- [ANA-06 — Gráficos por Project, Epic e Work Item](ANA-06-graficos-projeto-epico-feature.md)
- [ANA-07 — Gráficos por tool, modelo e stage](ANA-07-graficos-tool-model-stage.md)

## M5 — Waste e alertas

- [ANA-09 — Waste, anomalias e alertas de consumo](ANA-09-anomalias-waste-e-alertas.md)

## M6 — Forecast, export e regressão

- [ANA-10 — Forecast de budget e export analítico](ANA-10-previsao-budget-export.md)
- [ANA-11 — Performance, testes e regressão E2E](ANA-11-performance-e-regressao-e2e.md)

> Caminho crítico: `M0 → M1 → M2 → M3 → M4`; M5 e M6 dependem dos agregados corretos.
