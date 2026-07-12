# H19 — Perguntas da IA no Specify Tratadas como Aprovacao + Mensagens Telegram Truncadas

**Tipo**: Hotfix
**Status**: Resolvido
**Prioridade sugerida**: Critica
**Relaciona**: F19 (Notifications v2), F27 (Stage Sessions + Telegram), F47 (Telegram Interactive Questions)

## Resolucao (2026-07-12)

- Truncamento de mensagens Telegram: resolvido por F47 (US3) — `TelegramChannel.send`
  divide texto > 4096 caracteres em fragmentos sequenciais (`src/core/notify/telegram.ts`).
- Deteccao pergunta vs aprovacao: `parseControlSignal` (`src/core/adapters/control.ts`)
  dependia exclusivamente do marcador literal `MSQ_INPUT_REQUIRED:` no output da IA — uma
  pergunta em linguagem natural sem esse marcador exato caia silenciosamente no fluxo de
  aprovacao de gate. Adicionado um heuristico de fallback (`detectUnmarkedClarificationQuestion`)
  que reconhece frases inequivocas de pedido de esclarecimento (ex. "could you", "should I",
  "which of", "please clarify") no ultimo paragrafo do output quando termina em `?`, roteando
  para `needs_input` mesmo sem o marcador exato.
- Residual: o heuristico e conservador por desenho (evita falso-positivo em resumos que
  terminam com pergunta retorica) e nao substitui o marcador explicito como sinal primario —
  o prompt de stage continua instruindo a IA a emitir `MSQ_INPUT_REQUIRED:` (`src/core/runner/execute.ts`).
  Se surgirem casos reais de pergunta nao capturada por nenhum dos dois caminhos, reabrir este
  hotfix com o output bruto observado.

## Relato do usuario (2026-07-11)

> parece que estao entrando como aprove, enquanto deveria levar o
> questionamento pro telegram
> Tratar corretamente perguntas da IA e aprovacoes para avancar step
> Mensagens no telegram aparecem truncadas, avaliar por no prompt/skill
> orientacoes como deve ser o output das ias para melhorar nossa
> administracao

## Problema

Durante o step `specify`, quando a IA faz uma pergunta de esclarecimento ao
usuario, o sistema parece estar interpretando isso como um pedido de
aprovacao de gate (avancar/nao avancar) em vez de rotear como pergunta para
o Telegram. Isso e potencialmente critico: uma pergunta real pode estar
sendo auto-aprovada ou tratada incorretamente, avancando o pipeline sem que
o usuario tenha respondido de fato.

Problema secundario relacionado: mensagens que chegam ao Telegram vem
truncadas, dificultando a leitura de perguntas/contexto — possivelmente por
limite de tamanho de mensagem do Telegram nao sendo tratado (split/paginacao)
ou por falta de orientacao ao prompt/skill sobre como formatar output para
consumo humano no Telegram.

## Escopo provavel

- Runner/orchestrator — deteccao de "isto e uma pergunta" vs "isto e uma
  aprovacao de gate" (provavel parsing do output da IA)
- `src/core/events/` — dispatch de notificacao Telegram
- Integracao Telegram — limite de caracteres por mensagem, split
- Skills/prompts do step `specify` — instrucoes de formato de output

## Proximo passo

Reproduzir com uma run real do step `specify` que gere uma pergunta,
capturando o output bruto da IA e o ponto exato onde o sistema decide
"aprovacao" vs "pergunta". Este e pre-requisito de F47 (botoes no Telegram) —
resolver o roteamento antes de melhorar a apresentacao.
