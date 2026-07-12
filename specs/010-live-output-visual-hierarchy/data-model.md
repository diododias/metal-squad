# Data Model: Live Output — Hierarquia Visual e Cores Mutadas

Esta feature nao introduz nem altera entidades de dados, schema ou
persistencia. `Output Entry` (definida na spec) ja existe como estrutura de
runtime consumida por `renderOutputEntry` em
`src/web/static/components/RunDetail.js` — o unico "modelo" relevante aqui e
o mapeamento entre `entry.source` e o tratamento visual aplicado, que muda de
comportamento mas nao de forma.

## Output Entry (existente, inalterada nos campos)

| Campo | Tipo | Origem | Observacao |
|-------|------|--------|------------|
| `id` | number \| undefined | stream de eventos do run | usado so para `key` React |
| `source` | `'tool' \| 'heartbeat' \| 'stderr' \| 'stdout' \| outro` | stream de eventos do run | determina a classe CSS e o tratamento em `renderOutputEntry` |
| `line` | string | stream de eventos do run | texto exibido; truncado por `truncateText`/`formatHeartbeatLine` |

## Mapeamento entry.source → tratamento visual (mudanca desta feature)

| `source` | Antes | Depois |
|----------|-------|--------|
| default (narrativa) | contraste normal, sem card | inalterado (FR-003) |
| `tool` | card com borda/background, largura de bloco | linha compacta, cor `--muted`, prefixo curto, sem esticar a largura total (FR-001, FR-002) |
| `heartbeat` | cor `--muted`, italico | inalterado (FR-005) |
| `stderr` | cor `--danger`, prefixo `ERR>` | inalterado (FR-004) |

Nenhuma migracao, nenhuma mudanca de contrato de API ou de payload de
streaming e necessaria — a mudanca e inteiramente local ao componente de
apresentacao (`renderOutputEntry`) e ao CSS (`.output-entry.tool`).
