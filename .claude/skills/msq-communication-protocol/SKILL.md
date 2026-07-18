---
name: "msq-communication-protocol"
description: "Protocolo obrigatorio de encerramento de resposta em runs headless do msq: MSQ_DONE, MSQ_INPUT_REQUIRED ou MSQ_BLOCKED, pre-autorizacao de push/PR e abertura de PR para develop sempre que material for gerado. Reforco redundante ao contrato de codigo em src/core/runner/communicationProtocol.ts. Leia sempre que o msq referenciar esta skill por nome (/msq-communication-protocol) num prompt de stage ou num turno de reforco."
---

## Quando esta skill se aplica

Toda sessao headless disparada pelo `msq` (`claude`, `codex` ou `opencode`, em qualquer stage) deve encerrar cada resposta final respeitando este protocolo. Isso vale mesmo quando o `msq` referenciar esta skill apenas pelo nome (`/msq-communication-protocol`) dentro do prompt do stage ou de um turno de reforco — a referencia por nome e um pedido explicito para ler e aplicar as regras abaixo antes de terminar a resposta.

Esta skill e uma camada redundante e independente do contrato ja embutido em `src/core/runner/communicationProtocol.ts` (`COMMUNICATION_PROTOCOL` e `PROTOCOL_REINFORCEMENT_PROMPT`). As duas fontes devem permanecer consistentes; se divergirem, o codigo e a fonte de verdade tecnica (e o parser real dos sinais de controle), e esta skill deve ser atualizada para acompanhar.

## Contexto do problema

Runs que terminam corretamente — implementacao concluida, gates verdes, branch pronta — ainda assim podiam ser classificadas como `blocked` pelo `msq` quando a resposta final nao declarava um dos sinais de controle abaixo. Isso ja aconteceu de verdade: a feature `F-4YW66H3T` (run 302) foi implementada com sucesso, mas o agente encerrou a resposta com uma pergunta em prosa ("Quer que eu faca push e abra o PR agora?") em vez de um sinal de controle, e o `msq` nao tem como distinguir isso de uma falha real. Ver `docs/hotfixes/H26-msq-done-protocol-reinforcement.md`.

## Regras obrigatorias

1. **Encerre sempre com exatamente um sinal de controle.** Nunca termine a resposta final com uma pergunta em linguagem natural, um resumo sem sinal, ou qualquer outra forma de pedir confirmacao fora do protocolo.

   - `MSQ_DONE: <summary>`
     Na linha seguinte, inclua os campos de publicacao obrigatorios exatamente como:
     `pr_url=<url> pr_number=<number> base=<base-branch> head=<head-branch>`
   - `MSQ_INPUT_REQUIRED: <question>`
     Se a pergunta tiver de 1 a 8 opcoes discretas de resposta, adicione `OPTIONS:` na linha seguinte,
     seguida de uma linha `- <label>` por opcao. Cada label deve ter entre 1 e 60 caracteres e ser unica.
     Omita `OPTIONS:` para resposta livre.
   - `MSQ_BLOCKED: <reason_code> | <reason>`
     Use exatamente um reason_code: `dependency_unavailable`, `precondition_failed`,
     `environment_error`, `spec_ambiguous` ou `validation_failed`.

2. **Push e abertura de PR ja estao pre-autorizados nesta sessao headless.** Nao pause para pedir confirmacao antes de `git push` ou de abrir um pull request — essa autorizacao ja foi dada pelo fato de a sessao ter sido disparada pelo `msq`. Pedir confirmacao em prosa para uma acao ja autorizada e, por si so, uma violacao do protocolo.

3. **Sempre abra PR para `develop` quando qualquer material for gerado.** Isso vale para qualquer stage que produza artefato persistente — codigo, docs, specs, ADRs, configuracao — nao apenas para o stage `implement`. Se a tarefa gerou commit(s) numa branch de trabalho, essa branch deve ser enviada (`push`) e um PR deve ser aberto contra `develop` (ou contra a base de dependencia declarada, em caso de stacked PR) antes de declarar `MSQ_DONE`. Nao declare `MSQ_DONE` com material gerado e nao publicado, exceto quando o proprio stage explicitamente nao publica (ver `stagePublishes` do workflow).

4. **`MSQ_DONE` sem os campos de publicacao exigidos e tratado como falha de validacao**, nao como sucesso parcial. Se o stage publica e voce nao tem os quatro campos (`pr_url`, `pr_number`, `base`, `head`), voce ainda nao terminou — complete a publicacao primeiro.

5. **Se voce receber um turno de reforco** (uma mensagem comecando com algo como "In the last message you sent, RESPECT COMMUNICATION PROTOCOL AS FOLLOW skill /msq-communication-protocol" ou equivalente), isso significa que sua resposta anterior violou a regra 1. Nao repita a pergunta em prosa: se o trabalho ja esta concluido (incluindo push/PR), declare `MSQ_DONE` agora; se voce realmente esta bloqueado ou precisa de uma decisao humana, use `MSQ_BLOCKED` ou `MSQ_INPUT_REQUIRED`.

## O que NAO fazer

- Nao termine a resposta final com uma pergunta como "Quer que eu prossiga?", "Posso fazer o push agora?" ou equivalente — isso nao e um sinal de controle valido e o `msq` nao consegue interpretar.
- Nao assuma que push/PR precisam de aprovacao humana dentro desta sessao — essa cautela padrao nao se aplica aqui, ja foi resolvida pela autorizacao da sessao headless.
- Nao declare `MSQ_DONE` deixando material gerado sem PR aberto para `develop` (ou base de dependencia declarada) quando o stage publica.
- Nao invente um novo formato de sinal de controle; use exatamente a sintaxe acima.
