# Feature Specification: UX e telas da página Analytics

**Feature Branch**: `feat/ana12-analytics-ux-screens`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M3  
**Depende de**: ANA-00, ANA-04

## Objetivo

Especificar a experiência de usuário da página `/analytics` antes de implementar
tabelas e gráficos. A entrega define navegação, hierarquia visual, filtros,
drilldowns, estados vazios/erro/loading e comportamento responsivo.

## Princípio de UX

Analytics deve responder primeiro “onde os tokens estão indo?” e depois permitir
investigar “por que isso aconteceu?”. A tela não deve começar com uma grade de
gráficos independentes; ela deve guiar a investigação em camadas:

1. visão executiva do consumo;
2. identificação dos maiores responsáveis;
3. comparação por tool/model/stage;
4. análise de waste/anomalias;
5. drilldown até run/stage/task;
6. export com os mesmos filtros visíveis.

## Estrutura da página

### Header e filtros globais

```text
Analytics
Token consumption, efficiency and operational waste

Project: [active project ▾]  Period: [Last 30 days ▾]  Compare: [Previous period ✓]
Filters: Epic ▾  Repository ▾  Work Item ▾  Tool ▾  Model ▾  Stage ▾  Status ▾  Quality ▾
Active filters: [Project: Metal Squad x] [Tool: codex x] [Quality: exact x] [Clear all]
```

Comportamento:

- O seletor global de Project do app continua sendo respeitado.
- `All projects` deve existir como escolha explícita, não como ausência invisível
  de filtro.
- Filtros locais aparecem como chips removíveis.
- Mudanças de filtro atualizam KPIs, gráficos, tabela e export.
- Filtros rápidos usam `requestId`; resposta antiga não pode sobrescrever a mais
  recente.
- O usuário sempre deve ver qual recorte está ativo.

### Navegação interna

```text
[Overview] [Work Items] [Breakdowns] [Insights] [Data Quality]          [Export]
```

As abas ficam dentro da página `/analytics`, sem criar rotas obrigatórias novas.
O objetivo é reduzir densidade visual e manter contexto. Se rotas internas forem
necessárias depois, devem preservar query string/filtros.

## Tela 1 — Overview

### Layout desktop

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ KPI Total Tokens │ KPI Waste │ KPI Avg / Run │ KPI Burn Rate │ KPI Context │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tokens over time + previous period comparison                              │
├───────────────────────────────────────────────┬─────────────────────────────┤
│ Top consumers                                 │ Token breakdown             │
│ - Projects / Epics / Work Items               │ input / cached / output     │
├───────────────────────────────────────────────┴─────────────────────────────┤
│ Insights summary: expensive failures, anomalies, missing data               │
└─────────────────────────────────────────────────────────────────────────────┘
```

KPIs obrigatórios:

- Total tokens.
- Useful tokens.
- Waste tokens e waste rate.
- Avg tokens/run.
- Burn rate.
- Context P95.
- Runs sem telemetria ou `unknown` quando relevante.

Comportamento:

- Cada KPI mostra variação contra período anterior quando `Compare` está ativo.
- Clicar em um KPI aplica filtro quando fizer sentido ou abre a aba relacionada.
- Tooltips explicam fórmula e caveats de dados antigos.

## Tela 2 — Work Items

### Layout desktop

```text
┌ Search Work Item... ┐ Sort: [Tokens desc ▾] Columns ▾
┌────┬──────────────┬────────┬───────┬──────┬───────┬───────┬────────┬────────┐
│ ID │ Work Item    │ Epic   │ Repo  │ Runs │ Total │ Waste │ Model  │ Quality│
├────┼──────────────┼────────┼───────┼──────┼───────┼───────┼────────┼────────┤
│ ... clickable rows open drawer                                              │
└──────────────────────────────────────────────────────────────────────────────┘
Pagination: 1-50 of N
```

Colunas mínimas:

- Work Item ID, título e tipo.
- Project, Epic e Repository.
- Status derivado.
- Total tokens.
- Input/cached/output.
- Runs.
- Done/failed/blocked/aborted.
- Waste tokens.
- Última run.
- Tool/model predominante.
- Maior `context_window_percent`.
- Data quality/confidence.

Comportamento:

- Ordenação server-side para colunas de alto volume.
- Busca por ID/título sem quebrar os filtros ativos.
- Clique em linha abre drawer lateral.
- `Unknown Project`, `Unknown Model` e `Invalid tokens` são badges visíveis.
- A tabela nunca deve esconder Work Items sem tokens; eles aparecem com `—`.

## Tela 3 — Drawer de Work Item

```text
┌ Work Item F-123 — Improve Analytics                         [Open Run Detail]│
│ Project / Epic / Repo / Status / Type                                      │
│ Total tokens | Waste | Runs | Avg/run | Context max | Data quality          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Timeline de runs                                                           │
│ #391 blocked  claude/sonnet  implement  84k tok  context 42%               │
│ #392 failed   claude/sonnet  implement   4k tok  retry                     │
│ #393 done     claude/sonnet  implement  31k tok                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Stage/task breakdown                                                       │
│ implement / task-1 / task-2 ...                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Events: retry, resume, gate wait, timeout, publish failure                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Comportamento:

- Drawer não carrega detalhes pesados antes do clique.
- Runs são agrupadas por pipeline quando houver retomadas.
- Eventos mostram evidência, não apenas status.
- Run sem token mostra “No token telemetry captured”.
- Link para Run Detail usa a tela existente, quando disponível.

## Tela 4 — Breakdowns

```text
Breakdowns
[Group by: Project ▾] [Metric: Total tokens ▾] [Stack: input/cached/output ▾]

┌ Tokens by Project ┐ ┌ Tokens by Epic ┐
┌ Tokens by Tool    ┐ ┌ Tokens by Model┐
┌ Tokens by Stage   ┐ ┌ Tokens by Status┐
```

Comportamento:

- Clicar em uma barra aplica filtro.
- `Shift/cmd click` pode multi-selecionar se o componente já suportar; caso
  contrário fica fora do primeiro corte.
- Gráficos mostram soma, percentual e número de runs.
- Modelos `derived` e `unknown` são visualmente distintos.
- Stacked breakdown deve ser opcional; se não houver dados confiáveis, mostrar
  total simples com aviso.

## Tela 5 — Insights

```text
Insights
┌ Waste summary ┐ ┌ Budget forecast ┐ ┌ Outliers ┐

Priority findings
1. Feature F-X spent 1.2M tokens and ended failed.
2. codex/model Y increased avg tokens/run +43% vs previous period.
3. 18 runs have unknown model; model chart confidence is partial.
```

Comportamento:

- Insights são cards acionáveis com:
  - título;
  - severidade;
  - métrica observada;
  - baseline;
  - filtro/link para investigar.
- Waste deve separar falhas, aborts, blocked, retries e resumes sem sucesso.
- Forecast de budget só aparece se houver limite configurado.
- Sem limite configurado, a seção explica como habilitar ou mostra apenas burn rate.

## Tela 6 — Data Quality

```text
Data Quality
┌ Valid rows ┐ ┌ Derived rows ┐ ┌ Unknown rows ┐ ┌ Invalid rows ┐

Issues
- Runs without project snapshot
- Runs without model snapshot
- Negative token components
- Runs without token telemetry
- Scope integrity issues
```

Comportamento:

- Cada problema mostra contagem, impacto e link para filtro.
- Problemas que afetam gráficos aparecem também como warning na aba Overview.
- A tela deve diferenciar:
  - dado ausente;
  - dado derivado;
  - dado inválido;
  - dado válido.
- O usuário deve conseguir excluir `unknown/invalid` de comparativos sem perder
  a visibilidade da contagem total.

## Export

Botão no topo direito da navegação interna.

Opções:

- Export current view CSV.
- Export current view JSON.
- Include drilldown rows: off por padrão.
- Include unknown/invalid rows: on por padrão, com coluna `dataQuality`.

O export deve incluir metadados:

- filtros;
- período;
- generatedAt;
- schemaVersion;
- totals;
- dataQuality summary.

## Responsividade

### Desktop

- Header fixo da página.
- Filtros em linha com quebra controlada.
- KPIs em 5 colunas quando houver espaço.
- Gráficos em grid 2 colunas.
- Tabela com colunas completas.
- Drawer lateral.

### Tablet

- KPIs em 2 colunas.
- Gráficos em 1 coluna.
- Filtros dentro de botão “Filters”.
- Drawer vira painel full-width parcial.

### Mobile

- KPIs empilhados.
- Abas horizontais roláveis.
- Tabela vira lista de cards com campos prioritários:
  - Work Item;
  - total tokens;
  - waste;
  - runs;
  - tool/model;
  - quality.
- Drilldown vira tela/painel full-screen.

## Estados obrigatórios

### Loading

- Skeleton por seção.
- Se uma consulta sob demanda está carregando, manter os dados anteriores com
  indicador de atualização.

### Empty

Mensagem:

> No token usage for this filter.

Ações:

- Clear filters.
- Expand period.
- Show all projects.

### Error

- Erro por seção, não página inteira.
- Mostrar módulo/ação afetada quando o backend fornecer.
- Manter outras seções renderizáveis.

### Partial data

- Banner discreto:

> Some historical runs are classified as unknown or derived. Charts remain useful,
> but model/project comparisons may be partial.

## Acessibilidade e usabilidade

- Todos os filtros operáveis por teclado.
- Gráficos precisam de equivalente textual: tabela/lista com os mesmos valores.
- Cores não podem ser o único indicador de `valid/derived/unknown/invalid`.
- Tooltips não podem conter informação exclusiva; fórmulas principais aparecem
  também em texto acessível.
- Números grandes usam formatação compacta, mas tooltip/detalhe mostra valor exato.

## Requirements

- Especificar as abas `Overview`, `Work Items`, `Breakdowns`, `Insights` e
  `Data Quality`.
- Definir header, filtros, chips e comportamento de comparação.
- Definir drawer de Work Item e drilldown lazy.
- Definir estados loading, empty, error, partial data e responsivo.
- Definir interações click-to-filter e export com filtros visíveis.
- Definir critérios mínimos de acessibilidade.

## Arquivos afetados

- `src/web/client/pages/AnalyticsPage.tsx` — composição da página e abas.
- `src/web/client/components/data/*` — reusar `MetricCard`, `BarList`,
  `TrendBars`, `Table` existentes antes de criar componente novo.
- `src/web/client/components/feedback/*` — banners/empty/error states quando aplicável.
- `src/web/client/hooks/*` — filtros locais e requisições sob demanda (sobre
  `useWebSocket`/`useActiveProject`).
- `src/web/types.ts` — shapes necessários para UX.
- `tests/web/analytics-page.test.tsx` — testes da página React (a suíte `tests/ui/`
  é da **TUI aposentada**, não usar para o web).

## Fora de escopo

- Implementar as queries/agregados (vêm de [[ANA-03]]/[[ANA-04]]).
- Popular a tabela de Work Items e gráficos reais (é [[ANA-05]]/[[ANA-06]]/[[ANA-07]]);
  aqui define-se contrato visual e estados.

## Success Criteria

- A spec permite implementar a página sem decisões abertas de layout principal.
- Cada aba tem objetivo, conteúdo e comportamento definidos.
- Filtros e chips são consistentes em todas as abas.
- Drilldown é lazy e preserva contexto.
- Estados vazios, erro e dados parciais têm mensagens e ações definidas.
- Layout responsivo preserva a investigação principal em desktop, tablet e mobile.

## Validação

Mudança em `src/web/client/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm run typecheck
rtk npx vitest run tests/web/analytics-page.test.tsx
```
