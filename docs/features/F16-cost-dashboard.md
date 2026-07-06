# F16 — Token Cost Dashboard

**Epic**: [E04 — Observability](../epics/E04-observability.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F05, F07

## Problema

Token usage existe no DB mas nao eh apresentado de forma util. Nao ha breakdown por periodo, repo, tool, modelo, ou feature.

## Solucao

### Dashboard na TUI

Acessivel via `d` ou tab dedicada:

```
Token Usage — last 7 days
─────────────────────────────────
 Repo          Tool     Tokens    Cost
 metal-squad   claude   245.2k   $3.67
 metal-squad   codex     89.1k   $1.23
 other-repo    claude    12.0k   $0.18
─────────────────────────────────
 Total                  346.3k   $5.08

 By feature:
 feat-01  ████████████░░░░  78.2k  $1.17
 feat-02  ██████░░░░░░░░░░  34.1k  $0.51
 feat-03  ████░░░░░░░░░░░░  22.0k  $0.33
```

### Periodos

- Today / 7d / 30d / All time
- Navegavel com `[` e `]`

### Aggregacoes

- Por repo
- Por tool/modelo
- Por feature
- Por status (quanto foi gasto em runs que falharam?)

## Criterios de aceite

- [ ] Dashboard com breakdown por repo, tool, feature
- [ ] Custos estimados em USD
- [ ] Filtro por periodo
- [ ] Barra de progresso visual por feature
