# F08 — Navegacao por Sessoes/Runs

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Media
**Esforco**: Medium
**Depende de**: F05

## Problema

A TUI mostra apenas a lista flat de runs. Nao ha como navegar entre sessoes historicas, ver detalhes de um run, ou comparar runs de uma mesma feature.

## Solucao

### Hierarquia de navegacao

1. **Overview** — todos os repos registrados
2. **Repo** — epics e features do repo
3. **Feature** — historico de runs da feature
4. **Run** — detalhes do run (logs, tokens, duracao, resultado)

### Views

- **List view**: navegacao com j/k, enter para drill down, esc para voltar
- **Detail view**: log completo + metadata do run
- **Diff view**: comparar 2 runs da mesma feature (tokens, duracao, resultado)

### Filtering

- Por status: `f` abre filtro (running, done, failed, blocked)
- Por tool: `t` filtra por adapter
- Search: `/` busca por feature id ou titulo

## Criterios de aceite

- [ ] Drill down: overview → repo → feature → run
- [ ] Historico de runs por feature
- [ ] Filtros por status e tool
- [ ] Search por id/titulo
