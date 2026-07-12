# H13 — Live Output / Tool Execution: Hierarquia Visual, Cores Mutadas e Auto Scroll (TUI + Web)

**Tipo**: Hotfix / Melhoria de UX
**Status**: Pendente — triagem
**Prioridade sugerida**: Media
**Relaciona**: F38 (Live Output — hierarquia visual, ja entregue para o dashboard web)

## Relato do usuario (2026-07-11)

> Tela de detalhe: tools execution esta consumindo a tela de lado a lado,
> deveria ser menor e em cor mutada, pois esta tendo mais destaque que o
> proprio thinking
> Live Output: Tools estao em blocos tomando todo espaco da direita pra
> esquerda, limitar o espaco e usar cores mais mutadas, pois esta chamando
> mais atencao que o thinking
> Repense no estilo do live output para ficar mais proximo das ferramentas
> de mercado
> Auto scroll

## Problema

F38 ja resolveu exatamente este problema no dashboard web
(`src/web/static/components/RunDetail.js`, `styles.css`). O relato atual
sugere que o mesmo problema persiste — possivelmente porque:

1. F38 ainda nao foi validado/mergeado nesta base, ou
2. O problema tambem existe na TUI Ink (`src/ui/components/MainPanel.tsx`,
   que F38 explicitamente marcou como fora de escopo), ou
3. Falta auto-scroll no painel de output, que nao fazia parte do escopo de
   F38.

## Escopo provavel

- Confirmar status real de F38 (`git log`/`status` do arquivo, nao a doc)
  antes de reabrir trabalho ja feito
- `src/ui/components/MainPanel.tsx` — equivalente TUI do tratamento visual
  de tool calls, se ainda pendente
- Auto-scroll: `src/web/static/components/RunDetail.js` (painel
  `.output-log`) e/ou `src/ui/components/MainPanel.tsx` — comportamento de
  scroll ao chegar nova linha de output

## Proximo passo

Primeiro passo obrigatorio: verificar se F38 esta de fato implementado no
codigo atual. Se sim, este item vira "estender F38 para a TUI + adicionar
auto-scroll" em vez de retrabalho. Se nao, e a mesma F38 ainda pendente de
execucao.
