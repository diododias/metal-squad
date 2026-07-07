# F07 — Status Bar & Token Tracker

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Alta
**Esforco**: Low
**Depende de**: F05

## Problema

Nao ha indicacao visual clara de custos, tempo decorrido, modelo em uso, e estado geral do pipeline.

## Solucao

### Status bar persistente (bottom)

```
▶ feat-01 | claude/opus | 12.3k in / 3.2k out | 2m34s | ~$0.04 | 2/5 features done
```

### Componentes

- **Feature ativa**: id + status icon
- **Tool/modelo**: adapter + modelo em uso
- **Tokens**: input/output com atualizacao live
- **Duracao**: timer correndo
- **Custo estimado**: calculado via pricing table do modelo
- **Progresso global**: X/Y features concluidas

### Pricing table

Tabela embutida com precos por modelo (atualizavel via config):
```typescript
const PRICING: Record<string, { input: number; output: number }> = {
  'opus': { input: 15, output: 75 },     // per 1M tokens
  'sonnet': { input: 3, output: 15 },
  'haiku': { input: 0.25, output: 1.25 },
  // codex, opencode models...
};
```

## Criterios de aceite

- [ ] Status bar visivel em todas as telas
- [ ] Tokens e custo atualizados em tempo real durante runs
- [ ] Progresso global mostra features done/total
- [ ] Timer preciso com formatacao legivel
