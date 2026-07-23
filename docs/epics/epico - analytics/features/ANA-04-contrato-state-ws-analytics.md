# Feature Specification: Contrato de state/WS para Analytics

**Feature Branch**: `feat/ana04-analytics-state-contract`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M2  
**Depende de**: ANA-03

## Objetivo

Substituir o consumo implícito de `state.dashboard.rows` por um contrato explícito
de Analytics no WebSocket/state, com payload leve no snapshot padrão e consultas
sob demanda para tabelas grandes.

## Contexto de execução

`MsqWebState.stats.tokenStats` hoje carrega apenas total de tokens recente, e
`dashboard.rows` alimenta a página de Analytics. Isso acopla Analytics ao shape
de dashboard e força o cliente a recalcular ranking/tendência.

### Estado atual no código (verificado 2026-07-23)

- `src/web/state.ts` monta `stats.tokenStats: computeTokenStats(7)` e
  `dashboard.rows` a partir de `listRunsForStats({ sinceDays: 7 })` — ou seja, o
  snapshot padrão já carrega runs cruas de 7 dias. O novo resumo `analytics` deve
  ser leve e agregado, sem repetir essa lista.
- `src/web/types.ts` define `stats.tokenStats: TokenStats` (linha ~162) e
  `dashboard.rows` (~164); os tipos novos entram aqui.
- O hook de WS existente é `src/web/client/hooks/useWebSocket.ts` (não há hook de
  analytics ainda) — a requisição sob demanda deve se apoiar nele, não abrir canal
  paralelo.
- `computeTokenStats` vive em `src/web/state.ts`; se virar base do resumo
  `analytics`, extrair para função pura reutilizável (evita SQL/loop no cliente).

## Requirements

- Adicionar `analytics` ao contrato web com resumo leve:
  - período ativo;
  - totais principais;
  - top groups limitados;
  - `dataQuality` resumido;
  - timestamp/revision da consulta.
- Criar ação WS para consulta sob demanda:
  - `action:getAnalyticsWorkItems`;
  - `action:getAnalyticsBreakdown`;
  - `action:getAnalyticsRunDrilldown`;
  - ou contrato equivalente, tipado e validado.
- Validar filtros recebidos no servidor; cliente não manda SQL-like filter.
- Respostas carregam `requestId` para evitar race de filtros rápidos.
- Erros de domínio usam payload acionável, não `Error` genérico.
- Manter compatibilidade temporária com `dashboard.rows` até a UI migrar.

## Arquivos afetados

- `src/web/types.ts` — tipos de Analytics e mensagens WS.
- `src/web/state.ts` — snapshot leve.
- `src/web/server.ts` — handlers de ações sob demanda.
- `src/web/client/hooks/useWebSocket.ts` (+ novo hook de analytics) — filtros/
  requisições sob demanda.
- `tests/web/server.test.ts` — contrato WS e erros.
- `tests/web/state.test.ts` — snapshot leve.

## Fora de escopo

- Renderização das telas/abas (é [[ANA-12]] e specs de UI).
- Remoção de `dashboard.rows` (mantido como compat até a UI migrar).

## Success Criteria

- Snapshot padrão não carrega lista completa de runs só para Analytics
  (o `dashboard.rows` de 7 dias deixa de ser a fonte da página).
- Trocar filtro rapidamente não renderiza resposta obsoleta (`requestId` descarta
  resposta mais antiga).
- Payload inválido é recusado com erro tipado (não `Error` genérico).
- A UI antiga continua funcionando até o item de migração visual.

## Validação

Mudança em `src/web/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm test && rtk npm run typecheck
rtk npx vitest run tests/web/server.test.ts tests/web/state.test.ts
```
