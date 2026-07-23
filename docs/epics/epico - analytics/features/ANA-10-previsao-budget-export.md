# Feature Specification: Forecast de budget e export analítico

**Feature Branch**: `feat/ana10-budget-forecast-export`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M6  
**Depende de**: ANA-03, ANA-04, ANA-09

## Objetivo

Adicionar previsão de consumo e exportação dos dados analíticos para auditoria.
O usuário deve conseguir responder se o Project/Epic está queimando tokens acima
do esperado e baixar os mesmos números exibidos na UI.

### Estado atual no código (verificado 2026-07-23)

- `src/core/budget/tracker.ts` já existe — o forecast de estouro deve reusar o
  limite/`maxTokens` daí, não inventar fonte de budget paralela.
- Não há tabela de preço monetário hoje; custo depende de `pricingProfileId`
  (snapshot de [[ANA-02]]) + tabela versionada. Sem isso, mostrar `cost unavailable`.
- Export precisa sanitizar: `runs` carrega `branch_name`, `commit_sha`, `pr_url`,
  paths locais — não vazar no export padrão.
- Os agregados exportados devem sair de `src/db/analytics.ts` ([[ANA-03]]) para
  reproduzir exatamente os números da UI sob o mesmo filtro.

## Requirements

- Burn rate por período: tokens/dia, tokens/semana e tokens por Work Item done.
- Forecast de estouro de budget quando houver `maxTokens` ou limite configurado.
- Comparação com período anterior: total, média, waste e success rate.
- Export CSV e JSON dos agregados e da tabela de Work Items com filtros aplicados.
- Export inclui metadados: filtros, generatedAt, versão do schema e data quality.
- Custo monetário opcional:
  - só aparece se houver `pricingProfileId` e tabela de preço configurada;
  - caso contrário mostra `cost unavailable`.
- Não enviar segredos ou paths sensíveis no export padrão.

## Arquivos afetados

- `src/db/analytics.ts` — forecast e datasets de export.
- `src/web/server.ts` — endpoints/ações de export.
- `src/web/types.ts` — contratos de forecast/export.
- `src/web/client/pages/AnalyticsPage.tsx` — UI de forecast/export.
- `src/core/budget/tracker.ts` — integração com limites existentes (reuso, não
  fonte nova).
- `tests/web/server.test.ts` — export e sanitização.

## Fora de escopo

- Cobrança real via API de providers (ROADMAP fora de escopo).
- Persistir orçamentos novos; usa o limite já existente do tracker.

## Success Criteria

- Forecast muda corretamente ao trocar período e Project.
- Export reproduz os totais da UI para o mesmo filtro (mesmos agregados de [[ANA-03]]).
- Sem tabela de preço, custo aparece como indisponível sem quebrar tokens.
- Export não contém segredos nem paths absolutos sensíveis (branch/commit/pr/paths)
  por padrão.

## Validação

Mudança em `src/db/` + `src/web/` (ver `testing.md`):

```bash
rtk npm run build && rtk npm test && rtk npm run typecheck
rtk npx vitest run tests/web/server.test.ts tests/budget/*.test.ts
```
