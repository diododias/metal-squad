# F09 — Command Palette & Shortcuts

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Media
**Esforco**: Medium
**Depende de**: F05

## Problema

A TUI tem poucos atalhos fixos (q, a, s, r, setas). Falta um command palette para acoes rapidas e discoverability de funcionalidades.

## Solucao

### Command palette (Ctrl+P ou `:`)

Popup com fuzzy search sobre acoes disponiveis:
- `run <feature>` — inicia execucao
- `pause` / `resume` / `abort` — controles de run
- `filter <status>` — filtra lista
- `gate approve/skip/retry` — resolve gate
- `stats` — mostra analytics
- `config` — abre configuracao
- `help` — ajuda

### Shortcuts globais

| Key | Acao |
|-----|------|
| `q` | Quit |
| `Tab` | Alterna foco |
| `j/k` | Navega |
| `Enter` | Seleciona/drill |
| `Esc` | Volta |
| `Ctrl+P` / `:` | Command palette |
| `Ctrl+L` | Toggle log view |
| `?` | Help overlay |
| `1-5` | Switch para tab N |

### Contextuais (mudam por painel)

| Contexto | Key | Acao |
|----------|-----|------|
| Gates | `a` | Approve |
| Gates | `s` | Skip |
| Gates | `r` | Retry |
| Run detail | `p` | Pause |
| Run detail | `x` | Abort |

## Criterios de aceite

- [ ] Command palette com fuzzy search
- [ ] Shortcuts globais e contextuais funcionais
- [ ] Help overlay com `?`
- [ ] Atalhos exibidos no status bar
