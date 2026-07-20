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

1. **Encerre sempre com exatamente um sinal de controle.** Nunca termine a resposta final com uma pergunta em linguagem natural, um resumo sem sinal, ou qualquer outra forma de pedir confirmacao fora do protocolo. Existem exatamente tres sinais — `MSQ_DONE`, `MSQ_INPUT_REQUIRED` e `MSQ_BLOCKED` — detalhados na secao "Os tres sinais de controle" abaixo.

2. **Push e abertura de PR ja estao pre-autorizados nesta sessao headless.** Nao pause para pedir confirmacao antes de `git push` ou de abrir um pull request — essa autorizacao ja foi dada pelo fato de a sessao ter sido disparada pelo `msq`. Pedir confirmacao em prosa para uma acao ja autorizada e, por si so, uma violacao do protocolo.

3. **Sempre abra PR para `develop` quando qualquer material for gerado.** Isso vale para qualquer stage que produza artefato persistente — codigo, docs, specs, ADRs, configuracao — nao apenas para o stage `implement`. Se a tarefa gerou commit(s) numa branch de trabalho, essa branch deve ser enviada (`push`) e um PR deve ser aberto contra `develop` (ou contra a base de dependencia declarada, em caso de stacked PR) antes de declarar `MSQ_DONE`. Nao declare `MSQ_DONE` com material gerado e nao publicado, exceto quando o proprio stage explicitamente nao publica (ver `stagePublishes` do workflow).

4. **`MSQ_DONE` sem os campos de publicacao exigidos e tratado como falha de validacao**, nao como sucesso parcial. Se o stage publica e voce nao tem os quatro campos (`pr_url`, `pr_number`, `base`, `head`), voce ainda nao terminou — complete a publicacao primeiro.

5. **Se voce receber um turno de reforco** (uma mensagem comecando com algo como "In the last message you sent, RESPECT COMMUNICATION PROTOCOL AS FOLLOW skill /msq-communication-protocol" ou equivalente), isso significa que sua resposta anterior violou a regra 1. Nao repita a pergunta em prosa: se o trabalho ja esta concluido (incluindo push/PR), declare `MSQ_DONE` agora; se voce realmente esta bloqueado ou precisa de uma decisao humana, use `MSQ_BLOCKED` ou `MSQ_INPUT_REQUIRED`.

## Os tres sinais de controle

Escolha o sinal pela **situacao real em que a sessao terminou**, nao pelo que seria mais conveniente. A regra de decisao e simples:

- o trabalho do stage esta concluido -> `MSQ_DONE`
- falta uma **decisao humana** que so uma pessoa pode tomar -> `MSQ_INPUT_REQUIRED`
- existe um **impedimento tecnico** que voce nao consegue remover sozinho -> `MSQ_BLOCKED`

Na duvida entre `MSQ_INPUT_REQUIRED` e `MSQ_BLOCKED`: se a resposta que voce precisa e uma **escolha** ("qual das duas abordagens?"), e input; se e uma **acao** ("alguem precisa publicar a branch / conceder acesso / corrigir a spec"), e blocked.

### MSQ_DONE

```
MSQ_DONE: <summary>
pr_url=<url> pr_number=<number> base=<base-branch> head=<head-branch>
```

**Quando usar:** o objetivo do stage foi cumprido de ponta a ponta — implementacao feita, validacao pertinente executada, e (quando o stage publica) branch enviada e PR aberto.

**Quando NAO usar:** nao declare `MSQ_DONE` para trabalho parcial, para pedir revisao, ou com material gerado mas nao publicado. `MSQ_DONE` sem os quatro campos de publicacao, num stage que publica, e tratado como falha de validacao — nao como sucesso parcial (ver regra 4).

A linha de publicacao e omitida somente quando o stage explicitamente nao publica (`stagePublishes` do workflow).

### MSQ_INPUT_REQUIRED

```
MSQ_INPUT_REQUIRED: <question>
OPTIONS:
- <label>
- <label>
```

**Quando usar:** o trabalho so pode continuar depois de uma decisao humana de produto, escopo ou prioridade. O ambiente esta saudavel e voce conseguiria executar qualquer um dos caminhos — falta apenas saber **qual**.

**Quando NAO usar:** nao use para pedir permissao de algo ja autorizado (push, PR — ver regra 2), nem para confirmar um passo obvio. Uma pergunta cuja resposta voce mesmo pode inferir do repo, da spec ou das rules nao e input necessario; e trabalho nao feito.

`OPTIONS:` e opcional e vale quando a pergunta tem de 1 a 8 respostas discretas. Cada label deve ter de 1 a 60 caracteres e ser unica. Omita `OPTIONS:` para resposta livre.

### MSQ_BLOCKED

```
MSQ_BLOCKED: <reason_code> | <reason>
```

**Quando usar:** existe um impedimento concreto que impede a conclusao do stage e que voce nao consegue remover dentro desta sessao.

O `reason_code` e **obrigatorio** e deve ser exatamente um dos cinco valores abaixo. Um codigo ausente, invalido ou inventado nao aborta a run: o parser assume `precondition_failed` e anota que o codigo era invalido — o que degrada a triagem humana. Escolher o codigo certo e o que permite a quem opera o `msq` distinguir "esperar a dependencia publicar" de "corrigir o ambiente" sem reler o log inteiro.

O `<reason>` depois do `|` deve ser especifico e acionavel: diga **o que** falhou e **o que destravaria**. "Nao consegui" nao e um reason.

#### `dependency_unavailable`

Uma feature da qual esta depende ainda nao esta utilizavel: a branch/PR da dependencia nao existe, nao foi publicada ou nao pode ser obtida.

Use quando o impedimento se resolve sozinho assim que a dependencia for publicada ou mergeada — ninguem precisa mexer no seu codigo.

```
MSQ_BLOCKED: dependency_unavailable | F-TCMVTEDA nao tem branch publicada em origin; nao ha base para empilhar este PR.
```

#### `precondition_failed`

Uma condicao necessaria para o stage comecar nao esta satisfeita no repo ou no estado do projeto — arquivo/spec esperado ausente, stage anterior nao concluido, estado de git incompativel.

Diferenca para `dependency_unavailable`: aqui o problema esta **neste** work item ou no checkout, nao numa feature de terceiros. Este e tambem o codigo de fallback quando nenhum outro descreve melhor o caso.

```
MSQ_BLOCKED: precondition_failed | O stage implement exige tasks.md, que nao foi gerado pelo stage anterior.
```

#### `environment_error`

Falha de infraestrutura ou ferramenta, nao do trabalho em si: dependencia de sistema ausente, credencial/permissao negada, rede indisponivel, comando de build quebrado por causa do ambiente.

Use quando o mesmo codigo funcionaria numa maquina sadia. Sempre inclua o comando e o erro observado.

```
MSQ_BLOCKED: environment_error | `gh auth status` retorna nao autenticado; nao e possivel abrir o PR.
```

#### `spec_ambiguous`

A especificacao e contraditoria, incompleta ou aberta a mais de uma leitura incompativel, e escolher errado produziria retrabalho.

Diferenca para `MSQ_INPUT_REQUIRED`: use `spec_ambiguous` quando o **artefato** de spec precisa ser corrigido/completado; use `MSQ_INPUT_REQUIRED` quando a spec esta boa e voce so precisa que alguem escolha entre alternativas validas.

```
MSQ_BLOCKED: spec_ambiguous | A spec exige type imutavel apos criacao e tambem um seletor de edicao; os dois requisitos se contradizem.
```

#### `validation_failed`

O trabalho foi feito, mas um gate obrigatorio nao passou e voce nao conseguiu corrigir: testes vermelhos, typecheck/lint falhando, ou verificacao de publicacao recusada.

Nao mascare este caso como `MSQ_DONE`. Sempre relate qual gate falhou e o sintoma.

```
MSQ_BLOCKED: validation_failed | `npm test` falha em tests/runner/execute.test.ts (3 testes) apos a mudanca; causa nao identificada.
```

## O que NAO fazer

- Nao termine a resposta final com uma pergunta como "Quer que eu prossiga?", "Posso fazer o push agora?" ou equivalente — isso nao e um sinal de controle valido e o `msq` nao consegue interpretar.
- Nao assuma que push/PR precisam de aprovacao humana dentro desta sessao — essa cautela padrao nao se aplica aqui, ja foi resolvida pela autorizacao da sessao headless.
- Nao declare `MSQ_DONE` deixando material gerado sem PR aberto para `develop` (ou base de dependencia declarada) quando o stage publica.
- Nao invente um novo formato de sinal de controle; use exatamente a sintaxe acima.
- Nao emita `MSQ_BLOCKED` sem `reason_code`, com um codigo inventado, ou com `precondition_failed` usado como categoria generica quando um codigo mais especifico descreve o caso — isso destroi a triagem de quem opera o `msq`.
- Nao use `MSQ_BLOCKED` para uma escolha de produto (isso e `MSQ_INPUT_REQUIRED`), nem `MSQ_INPUT_REQUIRED` para um impedimento tecnico (isso e `MSQ_BLOCKED`).
- Nao escreva reason vago ("nao consegui", "deu erro"): declare o que falhou e o que destravaria.
