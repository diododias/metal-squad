# H10 — TUI nao se encaixa no terminal e nao tem altura fixa

**Tipo**: Hotfix
**Status**: Concluido
**Prioridade**: Alta
**Descoberto em**: 2026-07-09
**Comando observado**: `msq ui` em terminais de diferentes tamanhos

## Problema

A TUI do `msq ui` cresce livremente de acordo com o conteudo renderizado. Quando
há muitos cards no kanban, gates pendentes, notificacoes ou o run detail fica
longo, o conteudo ultrapassa a altura do terminal (`process.stdout.rows`) e
"vaza" para fora da area visivel. Nao ha controle de overflow nem scroll
interno, sobrando ao usuario adivinhar o que esta fora da tela.

Além disso, o app renderiza no buffer normal do terminal, misturando o conteudo
da TUI com o scrollback anterior.

## Impacto

- reduz a usabilidade da TUI em terminais comuns (24-30 linhas)
- dificulta a leitura do run detail e do feed de notificacoes
- quebra a sensacao de "app full-screen" esperada de uma TUI
- conteudo fora da viewport nao pode ser acessado por atalhos

## Hipotese tecnica inicial

O `<Box>` raiz em `src/ui/App.tsx` nao define `height`, entao o Ink o mede pelo
conteudo. Os componentes fixos (header, status bar, command bar, gate footer)
tambem nao contribuem com um orcamento vertical calculado para o painel
principal. Como resultado:

- `MainPanel` nao sabe quantas linhas realmente pode ocupar
- `getVerticalBudget` classifica a altura apenas em `short/regular/tall`, sem
  subtrair o chrome fixo
- nao ha alternate screen buffer isolando a TUI do scrollback do terminal
- o run detail depende de paginacao por tab, mas nao permite scrollar dentro de
  uma secao que extrapole o espaco visivel

## Resolucao esperada

1. Entrar no alternate screen buffer ao iniciar `msq ui` e restaurar o buffer
   normal ao sair (inclusive em `SIGINT`/`SIGTERM`).
2. Fixar a altura total do app em `process.stdout.rows`.
3. Calcular a altura consumida pelo chrome fixo (header, status bar, command
   bar, gate footer, margens) e repassar a altura restante para `MainPanel`.
4. Fazer `MainPanel` respeitar o orcamento vertical:
   - reduzir numero de cards por coluna, notificacoes e demands visiveis no
     overview quando necessario
   - permitir scroll interno no run detail para secoes que nao cabem
5. Adicionar cobertura de teste para o calculo de orcamento e para a
   propagacao de altura nos componentes.

## Resolucao aplicada

- `src/commands/ui.ts`: entra no alternate screen buffer (`\u001B[?1049h`) antes
  de renderizar e restaura (`\u001B[?1049l`) em `waitUntilExit`; handlers de
  sinal garantem restauracao em casos de interrupcao.
- `src/ui/layout/budget.ts`: novo helper puro que calcula a altura do chrome
  fixo e a altura disponivel para `MainPanel`.
- `src/ui/App.tsx`: root `<Box>` recebe `height={height}`; `MainPanel` recebe
  `availableHeight` calculado.
- `src/ui/components/MainPanel.tsx`: recebe `availableHeight`, aplica no
  container interno, recalcula `maxPerColumn`/`maxVisible` pelo orcamento real e
  adiciona scroll interno no run detail.
- `tests/ui/layout/budget.test.ts`, `tests/ui/app.test.ts`,
  `tests/ui/render.test.tsx`: cobrem o calculo de altura e a renderizacao
  dentro do limite do terminal.

## Criterios de aceite

- [x] `msq ui` entra no alternate screen buffer e restaura o terminal ao sair
- [x] A TUI nunca renderiza mais linhas que `process.stdout.rows`
- [x] O MainPanel ocupa todo o espaco vertical restante apos o chrome fixo
- [x] Run detail permite acessar secoes que extrapolam a altura visivel via scroll
- [x] Overview adapta numero de cards/notificacoes/demands sem estourar a altura
- [x] Nenhuma regressao nos atalhos de navegacao ou no ciclo de foco

## Notas

- O alternate screen so e ativado quando `process.stdout.isTTY` e verdadeiro,
  evitando poluir logs e saidas capturadas em testes/CI.
- Todos os criterios foram validados pelos testes existentes (726 testes
  passando) e pelos novos testes em `tests/ui/layout/budget.test.ts`,
  `tests/ui/app.test.ts` e `tests/ui/render.test.tsx`.
