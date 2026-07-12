# F47 — Perguntas Interativas via Telegram (Botoes)

**Epic**: E-notificacoes (ad-hoc, sem epic formal no roadmap ainda)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: H19 (Perguntas do specify tratadas como aprovacao + Telegram truncado), F19 (Notifications v2), F27 (Workflow por etapas com sessoes isoladas + Telegram)

## Relato do usuario (2026-07-11)

> Perguntas no telegram deve vir como botoes para selecionar qual opcao da
> melhor fit, ja seguindo mesmo conteudo de perguntas e respostas das IAs

## Problema

Quando a IA levanta uma pergunta de esclarecimento durante um step (ex.
`specify`), a notificacao que chega no Telegram hoje exige resposta livre
por texto, em vez de oferecer botoes (inline keyboard) com as opcoes que a
propria IA apresentou. Isso aumenta o atrito de responder pelo Telegram e
abre espaco para resposta ambigua ou fora das opcoes validas.

Este item depende diretamente de H19: hoje o sistema as vezes trata uma
pergunta da IA como se fosse um pedido de aprovacao de gate (avancar/nao
avancar), em vez de rotear como pergunta genuina para o Telegram — sem esse
roteamento estar correto, nao ha "pergunta" confiavel para transformar em
botoes.

## Objetivo

Quando o sistema identificar corretamente que a IA fez uma pergunta (apos
H19 resolver a deteccao pergunta-vs-aprovacao), a notificacao no Telegram
deve apresentar as opcoes de resposta como botoes (inline keyboard),
usando o mesmo conteudo de pergunta/opcoes que a IA gerou — nao um
"aprovar/rejeitar" generico. O usuario responde com um toque no botao
correspondente, e essa escolha e propagada de volta ao step em execucao com
o mesmo efeito que a resposta livre por texto teria hoje.

## Solucao (visao macro)

Nao ha ainda mapeamento fino de codigo para este documento (por pedido
explicito do solicitante, o levantamento detalhado de arquivos/linhas fica
para o proximo step do fluxo de desenvolvimento — specify/plan). Em nivel
macro, a mudanca deve tocar:

### 1. Pre-requisito: roteamento correto de pergunta vs aprovacao (H19)

F47 assume que o runner/orchestrator ja sabe distinguir "isto e uma
pergunta da IA" de "isto e um pedido de aprovacao de gate" — hoje isso nao
e confiavel (H19). Sem esse roteamento certo, nao ha pergunta estruturada
(texto + opcoes) para virar botoes; so ha o texto bruto do output da IA.

### 2. Extracao das opcoes de resposta a partir do output da IA

O ponto que hoje envia a notificacao de pergunta para o Telegram precisa
extrair as opcoes de resposta apresentadas pela IA (nao inventar
"aprovar/rejeitar") para montar os botoes com o conteudo real da pergunta.

### 3. Inline keyboard no dispatch de notificacao Telegram

O dispatch de notificacao (`src/core/events/`, integracao com a Telegram
Bot API) precisa suportar inline keyboards — enviar mensagem com botoes
correspondentes as opcoes extraidas, e tratar o callback do botao
pressionado como a resposta do usuario para aquele step.

### 4. Truncamento de mensagem (H19, problema secundario relacionado)

H19 tambem registra que mensagens no Telegram chegam truncadas — vale
confirmar, ao implementar os botoes, se o texto da pergunta (antes dos
botoes) respeita o limite de caracteres do Telegram com split/paginacao,
para nao repetir o mesmo problema na nova UI de botoes.

## Escopo tecnico (provavel, a confirmar no specify/plan)

- `src/core/events/` — dispatch de notificacao Telegram; suporte a inline
  keyboard e tratamento do callback do botao como resposta
- Runner/orchestrator — ponto de deteccao "pergunta vs aprovacao" (owned
  por H19) e extracao das opcoes de resposta do output da IA
- Skills/prompts do step `specify` (e outros stages que podem gerar
  perguntas) — garantir que o formato de output da IA seja parseavel para
  extrair pergunta + opcoes de forma confiavel

## Riscos e pontos em aberto

- F47 depende de H19 estar resolvido primeiro (deteccao correta de
  pergunta vs aprovacao); implementar botoes sobre deteccao errada
  propagaria o bug, so que com uma UI melhor.
- O formato de output da IA para perguntas pode nao ser estruturado hoje
  (texto livre) — pode ser necessario padronizar o prompt/skill para
  produzir pergunta + lista de opcoes de forma parseavel antes de montar os
  botoes (mencionado tambem em H19).
- Limite de caracteres/opcoes de inline keyboard do Telegram (Bot API) deve
  ser respeitado — perguntas com muitas opcoes ou opcoes longas podem
  precisar de fallback para texto livre.

## Criterios de aceite

- [x] Uma pergunta real da IA durante `specify` (ou outro stage que gere
      pergunta) chega ao Telegram como mensagem com botoes representando
      as opcoes reais apresentadas pela IA, nao um "aprovar/rejeitar"
      generico. (`parseControlSignal` extrai bloco `OPTIONS:`;
      `stage:request-created` monta `reply_markup.inline_keyboard`.)
- [x] Escolher um botao propaga a resposta correspondente de volta ao step
      em execucao, com o mesmo efeito observavel que a resposta livre por
      texto tem hoje. (`TelegramPoller` reconhece `input:<id>:<index>` e
      chama `resolveStageRequest` com o rotulo da opcao.)
- [x] Pedidos de aprovacao de gate (nao-pergunta) continuam funcionando
      como hoje, sem regressao. (branch `kind === 'approval'` inalterado;
      regex `input:<id>:<index>` nao colide com `GATE_CMD`/`STAGE_CMD`/
      `input:<id> <texto>`.) H19 (deteccao pergunta vs aprovacao) resolvido
      via heuristico de fallback em `parseControlSignal` — ver
      `docs/hotfixes/H19-specify-questions-misrouted-as-approve.md`.
- [x] Perguntas cujo texto ultrapassa o limite de mensagem do Telegram sao
      tratadas (split/truncamento controlado), nao apenas cortadas
      silenciosamente. (`TelegramChannel.send` fatia em fragmentos de
      4096 caracteres, `reply_markup` so no ultimo fragmento.)
- [x] Testes cobrindo extracao de opcoes do output da IA e o dispatch da
      notificacao com inline keyboard. (`tests/core/control.test.ts`,
      `tests/core/events-notifications.test.ts`,
      `tests/core/notify-telegram-poller.test.ts`,
      `tests/core/notify-telegram.test.ts`.)
