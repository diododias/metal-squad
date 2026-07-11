# F38 — Live Output: Hierarquia Visual e Cores Mutadas

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Media
**Esforco**: Small
**Depende de**: F34 (web run detail — introduziu o painel Live Output)

## Problema

No painel "Live Output" do detalhe de run (dashboard web), cada evento de tool
call vira um bloco full-width com borda e fundo solido:

```
src/web/static/components/RunDetail.js:139-145
  if (entry.source === 'tool') {
    return React.createElement(
      'div',
      { key, className: 'output-entry tool' },
      truncateText(entry.line, maxWidth),
    );
  }
```

```
src/web/static/styles.css:598-604
.output-entry.tool {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 6px;
  margin-bottom: 6px;
  background: var(--panel);
}
```

`maxWidth` e passado como `1000` em `renderOutputEntry` (chamado em
`RunDetail.js:515`), entao o texto do bloco de tool nao e limitado por largura
visual — o `output-entry.tool` estica ate a borda do container
(`.output-log`, `RunDetail.js:513` / `styles.css:582-592`), preenchendo a
linha inteira da direita pra esquerda como mostrado no screenshot anexado.

Isso cria dois problemas de hierarquia visual:

1. **Blocos de tool competem com o texto de raciocinio do agente**: entries
   sem `source === 'tool'` (a narrativa/"thinking" do agente, ex. `Vou
   verificar os hooks ativos...`) caem no branch default
   (`RunDetail.js:160-164`, classe `output-entry` sem modificador) e
   renderizam como texto plano, sem borda nem fundo. Como os blocos de tool
   tem borda + `background: var(--panel)` + padding, eles chamam mais
   atencao visual que a narrativa do agente, invertendo a prioridade que o
   usuario espera (a narrativa/raciocinio deveria ser o conteudo principal;
   as tool calls, o detalhe secundario).
2. **Paleta pouco mutada**: `var(--panel)` (`#111827`) e `var(--border)`
   (`#374151`) — ver `styles.css:1-14` — geram um bloco quase tao claro
   quanto o texto padrao `var(--text)` (`#e5e7eb`) sobre `var(--bg)`
   (`#0b0f19`), sem diferenca de contraste suficiente para sinalizar "isto e
   secundario". Ferramentas de mercado (ex. Claude Code CLI, Codex CLI, ver
   screenshot de referencia anexado ao pedido do usuario) usam labels curtos
   e cor apagada para tool calls (`shell`, `read`, etc.), texto truncado numa
   unica linha, sem card com borda propria.

## Objetivo

Redesenhar a apresentacao das entries de tool no Live Output para:

- ocupar menos espaco horizontal (nao esticar borda a borda do container),
- usar cores mais mutadas/apagadas do que o texto de narrativa do agente,
- ficar mais proximo do padrao visual de CLIs de mercado (linha compacta,
  prefixo/label curto, texto truncado, sem card full-width com fundo solido).

Sem alterar o que e mostrado — apenas como e mostrado. Fora de escopo: mudar
fonte de dados do live output (WebSocket, `outputLines`), fila/paginacao ou
comportamento de streaming.

## Solucao

### 1. Limitar largura das entries de tool

Truncar a linha de tool a um numero fixo de caracteres bem menor que hoje
(hoje `maxWidth=1000`, ou seja, sem truncamento efetivo). Ajustar a chamada
em `RunDetail.js:515` para passar uma largura menor para entries de tool
(ex.: um valor no bloco de 80-100 chars, similar ao que `heartbeat`/`stderr`
ja assumem implicitamente pela leitura do terminal), e/ou trocar o elemento
de `div` block-level com `width: 100%` implicito por um elemento
`inline-flex`/`max-width` no CSS para nao ocupar a largura inteira do
container mesmo quando o texto e curto.

### 2. Cores mais mutadas para tool entries

Em `styles.css:598-604`, trocar `background: var(--panel)` /
`border: 1px solid var(--border)` por um tratamento mais discreto — por
exemplo, sem background solido, com `color: var(--muted)` (ja usado em
`heartbeat`, `styles.css:606-609`) e um indicador visual leve (ex.: borda
esquerda fina de 2px, ou apenas um prefixo tipo `›` / `$` colorido em
`var(--muted)`) em vez de card completo. Objetivo: contraste visivelmente
mais baixo que o texto default (`var(--text)`) usado pela narrativa do
agente.

### 3. Preservar hierarquia entre fontes de output

Manter a distincao semantica entre `tool`, `heartbeat`, `stderr` e
default/`stdout` (narrativa), mas reordenar a hierarquia de contraste para:

1. narrativa do agente (default, `var(--text)`) — mais visivel, sem mudanca
2. `stderr` (`var(--danger)`) — mais visivel, sem mudanca (erro deve chamar
   atencao)
3. `tool` — mutado, compacto, largura limitada (mudanca desta feature)
4. `heartbeat` — ja mutado/italico, sem mudanca

### 4. Referencia visual

O screenshot anexado ao pedido do usuario mostra o padrao alvo: linha unica
por tool call, com label curto (`shell`), comando truncado, cor apagada,
sem card com fundo proprio disputando espaco com o texto de raciocinio
acima.

## Escopo tecnico

- `src/web/static/components/RunDetail.js`:
  - `renderOutputEntry` (linhas 137-165) — ajustar `maxWidth` efetivo por
    tipo de entry e/ou estrutura do elemento (label + linha truncada)
  - chamada em `outputToRender.map(...)` (linha 515) — revisar o
    `maxWidth=1000` fixo
- `src/web/static/styles.css`:
  - `.output-entry.tool` (linhas 598-604) — nova paleta/tratamento visual
  - `.output-log` / `.output-entry` (linhas 582-597) — ajustar se a largura
    limitada exigir mudanca no container (ex. `display: block` vs
    `inline-block`/`max-width`)
- Nao tocar: `src/web/lib/format.js` (`truncateText`, `formatHeartbeatLine`)
  a menos que a nova largura efetiva exija passar um segundo parametro de
  largura por tipo de entry — se sim, deixar isso explicito no PR de
  implementacao.
- TUI Ink (`src/ui/components/MainPanel.tsx:575`) tem um `ERR> ` similar mas
  **fora de escopo** aqui — o screenshot e o pedido do usuario sao sobre o
  dashboard web (`Live Output` de `RunDetail.js`), nao a TUI.

## Criterios de aceite

- [ ] Entries de tool no Live Output nao esticam mais borda-a-borda do
      container `.output-log`
- [ ] Entries de tool usam cor visivelmente mais apagada que o texto de
      narrativa do agente (contraste reduzido, comparavel a `heartbeat`)
- [ ] Texto de narrativa do agente (`source` default) continua com o
      contraste atual (`var(--text)`), sem regressao de legibilidade
- [ ] `stderr` continua com destaque de erro (`var(--danger)`)
- [ ] Comparado ao estado atual, o painel Live Output reduz a "competicao"
      visual entre tool calls e raciocinio do agente ao rolar uma run real
      no dashboard
- [ ] Nenhuma mudanca em `outputLines`/streaming/websocket — so
      apresentacao
- [ ] `npm run build` e `npm run typecheck` passam
