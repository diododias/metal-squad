# F29 — TUI Shell Polish (header, runs, gates footer, toast notifications)

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Alta
**Esforco**: Medium

## Problema

A fundacao da TUI ja existe, mas a casca global ainda transmite excesso de
densidade e competicao visual:

- o header fica colado no topo e sem tagline de posicionamento do produto
- o quadro de runs disputa espaco com a area principal por estar preso na
  sidebar
- os gates permanecem visiveis o tempo todo mesmo quando nao ha aprovacao
  pendente
- notificacoes internas usam feed persistente para tudo, quando parte delas
  deveria ser efemera

Esses pontos reduzem legibilidade e fazem a interface parecer mais um painel
tecnico cru do que um centro de controle operacional.

## Objetivo

Refinar a casca da TUI para que a hierarquia visual fique mais clara:

- topo mais respirado e com assinatura textual do produto
- runs promovidos para a area principal/infraestrutura central da tela
- gates tratados como excecao operacional, em um rodape visivel so quando
  necessario
- notificacoes de UI tratadas como toasts temporarios, sem poluir o historico
  com eventos de gate pendente

## Escopo funcional

### 1. Header do produto

- aumentar a margem superior do bloco `Metal Squad`
- adicionar o slogan:

```text
Automated pipeline orchestrator
```

- preservar o wordmark atual, mas com melhor espacamento em terminais compactos

### 2. Runs no painel principal

- remover a dependencia de um painel lateral direito para a lista principal de
  runs
- reposicionar runs para a area principal ou para uma faixa inferior integrada
  ao painel central
- manter navegacao por teclado clara mesmo com a mudanca de posicao

### 3. Gates como rodape condicional

- remover gates da lateral fixa
- exibir gates apenas quando houver aprovacao ou acao pendente
- transformar gates em um rodape operacional visivel sem roubar o layout inteiro
- manter acoes `approve`, `skip`, `retry` acessiveis sem exigir outra view

### 4. Notificacoes como toast

- eventos `ui:*`, sucesso de acao local e avisos operacionais leves devem virar
  toasts temporarios
- criacao de gate pendente nao deve abrir toast intrusivo; deve apenas entrar
  no historico/feed silenciosamente
- o feed de historico continua existindo para consulta, mas deixa de ser o
  mecanismo primario de feedback imediato

## Fora de escopo

- multi-channel externo (Telegram/Slack/Discord): continua em F19
- streaming de output e detalhamento de run: continua em F06/F24
- redesign tematico amplo: continua em F10

## Areas tecnicas afetadas

- `src/ui/App.tsx`
- `src/ui/components/MainPanel.tsx`
- `src/ui/components/Sidebar.tsx`
- `src/ui/components/StatusBar.tsx`
- `src/ui/components/CommandBar.tsx`
- `src/ui/hooks/useNotifications.ts`
- possivel novo componente de `ToastStack`

## Criterios de aceite

- [ ] O header fica mais distante do topo e exibe `Automated pipeline orchestrator`
- [ ] A lista de runs deixa de depender de uma sidebar direita fixa
- [ ] Gates aparecem apenas quando ha pendencia e sao renderizados como rodape operacional
- [ ] Eventos de gate pendente nao geram toast
- [ ] Avisos e feedbacks locais aparecem como toast temporario e nao ficam presos como unica forma de feedback
- [ ] A navegacao por teclado continua consistente apos a redistribuicao do layout
