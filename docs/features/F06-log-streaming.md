# F06 — Log Streaming em Tempo Real

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Alta
**Esforco**: High
**Depende de**: F05, F15

## Problema

Hoje o output dos agentes so aparece depois que terminam (stdout/stderr capturados inteiros por `runCli`). Nao ha visibilidade em tempo real do que o agente esta fazendo.

## Solucao

### Streaming de stdout/stderr

Modificar `spawn.ts` para emitir eventos de output em tempo real:
- Cada linha de stdout/stderr vira um evento
- O event system (F15) propaga para a TUI
- A TUI renderiza no MainPanel com scroll automatico

### Parsing de eventos do agente

Para cada adapter, parsear os eventos especificos:
- **Claude**: JSONL com `type: "assistant"`, `type: "tool_use"`, etc.
- **Codex**: JSONL com `type: "item.completed"`, `type: "turn.completed"`
- **OpenCode**: formato proprio

### Display

- Texto do agente em branco
- Tool calls em dim/cinza
- Erros em vermelho
- Tokens acumulados atualizados a cada evento
- Indicador de "thinking" quando agente esta processando

## Criterios de aceite

- [ ] Output do agente aparece em tempo real na TUI
- [ ] Tool calls exibidos com formatacao distinta
- [ ] Scroll automatico com option de pausar (Ctrl+S)
- [ ] Tokens acumulados atualizados em tempo real
