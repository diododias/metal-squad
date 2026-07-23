# Feature Specification: Gráficos por Project, Epic e Work Item

**Feature Branch**: `feat/ana06-hierarchy-token-charts`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M4  
**Depende de**: ANA-03, ANA-04, ANA-05, ANA-12

## Objetivo

Exibir gráficos de consumo de tokens por hierarquia de produto:
Project, Epic, Repository e Work Item. A navegação deve permitir sair de uma
visão macro e chegar rapidamente nos itens que explicam o consumo.

### Estado atual no código (verificado 2026-07-23)

- Componentes reutilizáveis já existem: `BarList.tsx` (ranking por escopo),
  `TrendBars.tsx` (série temporal) e `MetricCard.tsx` (cards de resumo) em
  `src/web/client/components/data/`. Reusar antes de criar gráfico novo.
- `byEpic`/`byRepository` dependem do join por snapshot ([[ANA-03]]); runs sem
  epic/repo resolvível caem em `unknown/unscoped` e devem aparecer, não sumir.
- Todos os agregados vêm de `getTokenBreakdowns`/`getTokenTimeSeries` ([[ANA-03]]);
  esta feature não soma listas cruas no cliente.

## Requirements

- Cards de resumo por escopo: total tokens, runs, avg tokens/run, waste,
  success rate e context P95.
- Gráfico por Project: tokens totais e participação percentual.
- Gráfico por Epic dentro do Project ativo.
- Gráfico por Repository quando o Project tiver múltiplos repos.
- Gráfico por Work Item com top N e link para listagem completa.
- Série temporal por escopo selecionado: tokens por bucket e comparação com
  período anterior.
- Breakdown stacked opcional: input, cached input e output.
- Grupos `unknown/unscoped` aparecem separados e com callout de data quality.

## Arquivos afetados

- `src/web/client/pages/AnalyticsPage.tsx`.
- `src/web/client/components/data/BarList.tsx`.
- `src/web/client/components/data/TrendBars.tsx`.
- Novo componente de gráfico, se necessário, mantendo CSS/design system local.
- `tests/web/analytics-page.test.tsx` — testes focados de Analytics.

## Fora de escopo

- Gráficos por tool/model/stage (é [[ANA-07]]).
- Waste/anomalia como análise dedicada (é [[ANA-09]]); aqui waste é só coluna/KPI.

## Success Criteria

- Selecionar Project altera Project/Epic/Repository/Work Item de forma coerente.
- Soma dos grupos principais bate com o total do resumo para o mesmo filtro.
- Dados `unknown/unscoped` aparecem separados e são contabilizados.
- Teste cobre gráfico com Project multi-repo e Epic sem runs.

## Validação

Mudança em `src/web/client/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm run typecheck
rtk npx vitest run tests/web/analytics-page.test.tsx
```
