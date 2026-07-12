# F41 — Reaproveitamento Adaptativo de Sessao entre Steps

**Epic**: E-controle-de-sessao (ad-hoc, sem epic formal no roadmap ainda)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F27 (Workflow por etapas com sessoes isoladas), F30 (Token & Context Telemetry)

## Relato do usuario (2026-07-11)

> quando a sessao esta com janela de contexto disponivel para o step, podemos
> reaproveitar a sessao e processar a proxima step na mesma janela de
> contexto, isso pode ser habilitado/desabilitado, a partir de 70% da janela
> de contexto consumida, melhor iniciar uma nova sessao no proximo step
> execution
> Steps como specify e plan podem ter opcao de rodar em sessoes isoladas
> apenas com esses passos, o usuario pode selecionar qual opcao deseja
> quando uma step for concluida e ainda restar 50% do contexto, pode iniciar
> novo step

## Problema

F27 entrega sessoes isoladas por step (uma sessao nova a cada stage do
workflow: `specify`, `plan`, `tasks`, `implement`, `validate`). Isso e seguro
mas desperdica contexto quando um step termina cedo e ainda sobra muita
janela de contexto disponivel — hoje nao existe modo que reaproveite a
sessao anterior para o proximo step.

Nao ha, hoje, nenhum mecanismo de decisao "reusar sessao vs abrir nova"
baseado em consumo de contexto, nem um jeito de marcar stages especificos
(ex.: `specify`, `plan`) como "sempre isolados" independente desse
reaproveitamento.

## Objetivo

Adicionar um modo complementar as sessoes isoladas do F27: reaproveitar a
mesma sessao entre steps consecutivos do workflow quando sobra contexto
suficiente, com dois limiares de decisao e uma flag geral de
liga/desliga:

- **>=70% de contexto consumido** ao final de um step → forcar nova sessao
  no proximo step (nunca reaproveitar acima desse teto).
- **<=50% de contexto consumido** ao final de um step → pode iniciar o
  proximo step reaproveitando a mesma sessao, se o modo estiver habilitado.
- Entre 50% e 70%: comportamento a decidir na fase de plan/specify tecnico
  (ex.: manter isolado por seguranca, ou permitir reuso com aviso) — nao
  faz parte do relato original do usuario, precisa ser resolvido como uma
  clarificacao antes do plan.

Alem do limiar global, permitir que stages especificos (`specify`, `plan`
sao os citados no relato) sejam marcados para **sempre** rodar em sessao
isolada, independente do resultado do calculo de contexto — essa marcacao
deve ser selecionavel pelo usuario (por feature, via backlog/config), nao
hardcoded.

## Solucao (visao macro)

Nao ha ainda mapeamento fino de codigo para este documento (por pedido
explicito do solicitante, o levantamento detalhado de arquivos/linhas fica
para o proximo step do fluxo de desenvolvimento — specify/plan). Em nivel
macro, a mudanca deve tocar:

### 1. Decisao de reuso de sessao

O ponto do orchestrator/adapter que hoje sempre abre uma sessao nova por
stage (comportamento entregue em F27) precisa evoluir para consultar, ao
final de cada step concluido, o consumo de contexto da sessao (telemetria
ja existe em parte via F30 — mas ver H15, que registra que a contagem de
tokens hoje pode estar confusa/incorreta e deve ser confirmada/corrigida
antes ou junto deste trabalho).

### 2. Flag de liga/desliga do modo adaptativo

Precisa existir uma opcao explicita (nivel feature, possivelmente com
default global em `defaults`) para habilitar/desabilitar o
reaproveitamento adaptativo. Quando desabilitado, o comportamento atual
(sessao isolada por step, F27) deve continuar identico.

### 3. Marcacao de stages sempre-isolados

Precisa existir uma forma de listar quais stages (ex.: `specify`, `plan`)
nunca reaproveitam sessao, mesmo com o modo adaptativo ligado e contexto
disponivel abaixo do teto de 50%.

### 4. Persistencia/telemetria

O calculo de "% de contexto consumido ao final do step" depende dos dados
que ja existem de token/context tracking (F30) — este item deve reusar
essa base em vez de criar uma fonte paralela de medicao.

## Escopo tecnico (provavel, a confirmar no specify/plan)

- `src/core/adapters/` — ownership de sessao por adapter (spawn/reuso de
  processo/sessao), conforme `.claude/rules/architecture.md`
- `src/core/orchestrator/` — decisao de "reusar sessao vs abrir nova" entre
  steps do workflow staged
- `src/core/backlog/` — schema para (a) flag de liga/desliga do
  reaproveitamento adaptativo e (b) lista de stages sempre-isolados por
  feature
- `src/db/` — leitura da telemetria de contexto por sessao (base ja
  existente de F30); confirmar exatidao dos dados antes de usar como
  gatilho de decisao (relacionado a H15)

## Riscos e pontos em aberto

- H15 (contagem de tokens confusa/possivelmente errada) pode invalidar o
  calculo dos limiares de 50%/70% se nao for resolvido antes — avaliar
  ordem de execucao com o hotfix.
- Faixa 50%-70% de contexto consumido nao tem comportamento definido pelo
  relato original; precisa de clarificacao explicita no specify.
- F43 (edicao de tool/effort por step) e um pedido relacionado mas
  distinto — nao confundir escopo: F41 e sobre reuso de sessao, F43 e sobre
  trocar tool/model/effort por step.

## Criterios de aceite

- [ ] Com o modo adaptativo desligado, o comportamento observavel e
      identico ao F27 atual (sessao nova a cada step).
- [ ] Com o modo ligado, um step que termina com <=50% de contexto
      consumido permite que o proximo step (se nao estiver na lista de
      sempre-isolados) reaproveite a mesma sessao.
- [ ] Com o modo ligado, um step que termina com >=70% de contexto
      consumido sempre forca nova sessao no proximo step.
- [ ] Stages listados como sempre-isolados (ex.: `specify`, `plan`) nunca
      reaproveitam sessao, independente do consumo de contexto.
- [ ] A flag de liga/desliga e a lista de stages sempre-isolados sao
      configuraveis por feature no backlog (schema documentado).
- [ ] Testes cobrindo os dois limiares (50% e 70%) e a lista de stages
      sempre-isolados.
