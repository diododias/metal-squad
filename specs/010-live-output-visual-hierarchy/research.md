# Research: Live Output — Hierarquia Visual e Cores Mutadas

## Contexto observado no codigo

- **Decision**: A entry `tool` e renderizada por `renderOutputEntry` em
  `src/web/static/components/RunDetail.js:139-144` como uma `div` com classe
  `output-entry tool`, e o estilo `.output-entry.tool` em
  `src/web/static/styles.css:598-604` aplica `border`, `border-radius`,
  `padding` e `background: var(--panel)` — isto e o "card" que compete
  visualmente com a narrativa.
  **Rationale**: Confirmado lendo o componente e o CSS atuais; nao havia
  ambiguidade a resolver via pesquisa externa, pois o problema e puramente de
  apresentacao dentro de um codebase ja conhecido.
  **Alternatives considered**: N/A — este item resolve o "onde" da mudanca,
  nao uma escolha tecnica com trade-offs.

- **Decision**: O tratamento de referencia para o novo estilo de `tool` e o
  `.output-entry.heartbeat` ja existente (`color: var(--muted); font-style:
  italic;`), reaproveitando a variavel de cor `--muted` ja definida no tema.
  **Rationale**: A propria spec (Assumptions) pede paridade de contraste com
  heartbeat (FR-002, SC-003); reaproveitar a variavel existente evita
  introduzir uma nova cor no design system so para esta feature.
  **Alternatives considered**: Criar uma variavel de cor nova
  (`--tool-muted`) — rejeitado por nao haver diferenca de contraste
  requerida entre `tool` e `heartbeat` (SC-003 pede nivel *comparavel*).

- **Decision**: A largura da entry `tool` deixa de ser bloco (`div` que
  ocupa 100% do container, herdando `white-space: pre-wrap` de
  `.output-log`) e passa a ser compacta (`display: inline-block` ou
  `width: fit-content`), preservando `truncateText(entry.line, maxWidth)` ja
  usado hoje para nao estourar a largura do container em textos longos
  (FR-001, edge case de comando de shell extenso).
  **Rationale**: `truncateText`/`maxWidth` ja resolvem o truncamento de
  texto; o problema de "esticar borda-a-borda" e puramente do `display`
  block do container, nao do conteudo textual.
  **Alternatives considered**: Reduzir `maxWidth` passado para
  `truncateText` — rejeitado porque nao resolve o caso de texto curto
  (edge case "um unico token nao deve esticar ate a largura do container"),
  que e um problema de `display`, nao de tamanho de string.

- **Decision**: Manter um prefixo/indicador curto (ex.: label `tool` ja
  presente implicitamente pela classe, ou um prefixo textual como `▸` /
  `TOOL>` antes do texto truncado) para que a distincao semantica dos 4 tipos
  de entry continue clara mesmo com cor apagada (FR-006, User Story 2).
  **Rationale**: `stderr` ja usa o padrao de prefixo textual (`ERR>` em
  `RunDetail.js:157`); replicar o mesmo padrao para `tool` mantem
  consistencia visual entre os tipos de entry sem exigir nova legenda/UI.
  **Alternatives considered**: Icone/emoji unicode — rejeitado por
  inconsistencia com o padrao textual ja usado por `stderr` e por risco de
  nao renderizar em todos os terminais/fontes do navegador do usuario.

## Itens sem NEEDS CLARIFICATION pendente

Nenhum item da Technical Context ficou em aberto — o escopo e pequeno
(CSS + um componente de apresentacao ja existente) e totalmente observavel
no codigo atual.
