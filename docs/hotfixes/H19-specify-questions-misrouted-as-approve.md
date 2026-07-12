# H19 — Perguntas da IA no Specify Tratadas como Aprovacao + Mensagens Telegram Truncadas

**Tipo**: Hotfix
**Status**: Pendente — triagem
**Prioridade sugerida**: Critica
**Relaciona**: F19 (Notifications v2), F27 (Stage Sessions + Telegram), F47 (Telegram Interactive Questions)

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
