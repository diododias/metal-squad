# F05 — Layout Multi-Painel

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Critica (fundacao de E02)
**Esforco**: High

## Problema

A TUI atual eh uma tela unica com tabela + painel de gates. Nao tem sidebar, nao tem areas dedicadas, nao tem layout responsivo real.

## Solucao

### Layout inspirado em opencode/claude-code

```
+----------------------------------+--------------------+
|  metal-squad                     |  Runs              |
|  ================================|  ▶ feat-01 ⟳      |
|                                  |  ✓ feat-02 done    |
|  [Log streaming area]           |  ✗ feat-03 failed  |
|  > Running feat-01...            |                    |
|  > Editing src/schema.ts         |  Gates             |
|  > Tests passing...              |  ⊘ feat-04 awaits  |
|                                  |                    |
|                                  |  Skills            |
|                                  |  specify → plan →  |
|                                  |  implement         |
+----------------------------------+--------------------+
|  ▶ feat-01 | claude | 12.3k tokens | 2m34s | $0.04  |
|  [a]pprove [s]kip [r]etry [p]ause [q]uit  ctrl+l log |
+-------------------------------------------------------+
```

### Componentes

1. **MainPanel** — area principal com log streaming do run selecionado
2. **Sidebar** — lista de runs, gates pendentes, skills em execucao
3. **StatusBar** — info do run ativo (tool, tokens, duracao, custo estimado)
4. **CommandBar** — shortcuts e acoes disponiveis no contexto

### Responsividade

- Terminal < 80 cols: layout single-column (sidebar colapsa)
- Terminal 80-120 cols: sidebar compacta
- Terminal > 120 cols: layout completo

### Navegacao

- `Tab` alterna foco entre paineis
- `j/k` ou setas navegam dentro do painel focado
- `Enter` seleciona run para ver detalhes
- `Esc` volta ao overview

## Criterios de aceite

- [ ] Layout multi-painel com sidebar + main + status bar
- [ ] Responsivo (single-column em terminais pequenos)
- [ ] Navegacao por teclado entre paineis
- [ ] Painel principal mostra conteudo contextual (log ou overview)
