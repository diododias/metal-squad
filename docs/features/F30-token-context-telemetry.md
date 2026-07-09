# F30 — Token & Context Telemetry Refinement

**Epic**: [E04 — Observability](../epics/E04-observability.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F17, F18, F24, F28

## Problema

O produto ja coleta tokens e custos estimados, mas a apresentacao atual ainda
esta enviesada para custo financeiro agregado. Isso cria dois problemas:

1. custo por hora ou custo instantaneo fica volatil e pouco confiavel, porque
   precificacao de API muda e depende de modelo/cache
2. falta a metrica operacional que realmente importa para runs longas:
   **quanto da janela de contexto ja foi consumido**, por sessao, stage e step

Hoje a visibilidade de tokens existe, mas ainda nao fecha o circuito completo de
planejamento operacional:

- falta total agregado claro entre todas as sessoes/steps de uma pipeline
- falta breakdown por step/stage
- falta persistencia da porcentagem de uso da janela de contexto
- falta exposicao consistente por run/sessao, e nao so por total global

## Objetivo

Trocar o foco de "quanto custou em dolares por hora" para "quanto contexto e
tokens esta consumindo agora e ao longo da pipeline", mantendo custo apenas como
dado secundario quando fizer sentido.

## Escopo funcional

### 1. Remover destaque de custo por hora

- eliminar da TUI qualquer destaque principal de custo financeiro por hora
- manter calculos de custo como capacidade secundaria/analytics, nao como metrica
  central do monitoramento ao vivo

### 2. Total agregado de tokens

- exibir o total agregado de tokens somando todas as sessoes/steps associadas a
  uma pipeline/run selecionada
- deixar claro quando o numero representa agregado global vs sessao atual

### 3. Breakdown por step e stage

- mostrar consumo individual por stage e por step/task quando esses dados
  existirem
- refletir isso no detail view da TUI e no `msq stats --run`
- permitir identificar rapidamente qual etapa concentrou mais contexto

### 4. Uso da janela de contexto

- calcular a porcentagem usada em relacao ao limite estimado da janela do
  modelo/tool da sessao
- persistir esse valor por sessao/step para consultas posteriores
- expor a diferenca entre:
  - tokens acumulados
  - budget operacional do bloco
  - percentual estimado da janela ja consumido

## Modelo esperado

Cada sessao/stage deve poder responder pelo menos:

```typescript
interface SessionTelemetry {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindowTokens?: number;
  contextWindowPercent?: number;
  taskId?: string;
  stage?: string;
}
```

## Integracoes esperadas

- `F24` fornece granularidade por task/stage na TUI
- `F28` fornece estimativa de budget por bloco e janela de contexto
- `F17/F18` continuam como superficies de consulta historica e breakdown

## Areas tecnicas afetadas

- `src/db/index.ts` e `src/db/repo.ts`
- `src/core/stats.ts`
- `src/core/budget/pricing.ts` e camadas de apresentacao que hoje destacam custo
- `src/ui/components/CostDashboard.tsx` ou sucessor focado em telemetria
- `src/ui/components/MainPanel.tsx`
- `src/ui/components/StatusBar.tsx`
- `src/ui/hooks/useRuns.ts` / `useTaskRuns.ts`

## Criterios de aceite

- [ ] Custo por hora deixa de ser exibido como metrica principal na TUI
- [ ] O total agregado de tokens entre todas as sessoes/steps fica visivel
- [ ] O consumo por step/stage fica visivel individualmente quando houver dados
- [ ] O percentual de uso da janela de contexto e calculado e persistido por sessao/step
- [ ] O detail view diferencia total global, sessao atual e budget de contexto do bloco
- [ ] `msq stats --run` expõe a mesma leitura de tokens/contexto da TUI
