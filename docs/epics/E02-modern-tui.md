# E02 — Modern TUI (opencode / claude-code / codex inspired)

## Motivacao

A TUI atual eh uma tabela simples de runs + painel de gates. Tools como opencode, claude code e codex tem interfaces muito mais ricas: paineis laterais, streaming de output, navegacao por sessoes, status bars informativos, comandos interativos.

## Objetivo

Reconstruir a TUI para ser o centro de controle do msq — onde o usuario monitora, interage, e toma decisoes sobre o pipeline em tempo real.

## Referencia Visual

- **opencode**: sidebar de sessoes, area principal de chat/output, status bar com tokens/modelo/custos
- **claude code**: output streaming com indicadores de progresso, compact mode, tool usage display
- **codex**: painel lateral de arquivos afetados, logs de execucao, controles de aprovacao inline

## Features

- [F05 — Layout Multi-Painel](../features/F05-layout-multi-panel.md)
- [F06 — Log Streaming em Tempo Real](../features/F06-log-streaming.md)
- [F07 — Status Bar & Token Tracker](../features/F07-status-bar.md)
- [F08 — Navegacao por Sessoes/Runs](../features/F08-session-navigation.md)
- [F09 — Command Palette & Shortcuts](../features/F09-command-palette.md)
- [F10 — Theme System](../features/F10-theme-system.md)
- [F24 — Task & Stage Progress na TUI](../features/F24-task-stage-progress.md)
- [F29 — TUI Shell Polish](../features/F29-tui-shell-polish.md)

## Impacto

- `src/ui/` — reescrita substancial dos componentes Ink
- `src/ui/hooks/` — novos hooks para streaming, sessoes, navegacao
- `src/db/` — novas queries para sessoes e logs
- `src/core/runner/execute.ts` — precisa emitir eventos para streaming
- feedback efemero e redistribuicao de layout agora tambem impactam shell
  global, gates e historico de notificacoes
