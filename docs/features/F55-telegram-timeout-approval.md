# Feature Specification: Aprovação via Telegram ao atingir timeout

**Feature Branch**: `feat/f55-telegram-timeout-approval`
**Created**: 2026-07-13
**Status**: Draft
**Roadmap**: V1 — Marco 1 (Fundação + Quick Wins)

## Input

> "Telegram: aprovação no timeout — sessão excedendo timeout passa a pedir
> aprovação via Telegram antes de encerrar (não encerra automático); timeout vira
> alerta, não gate direto. Configurável para manter o comportamento atual
> (encerrar automático) quando desejado."

Hoje o timeout (`spawn.ts`) é um `setTimeout` rígido: ao estourar `toolTimeoutMs`
(default 600s), o processo recebe `SIGKILL` e a run falha com `CliTimeoutError`,
sem chance de o humano decidir. Muitas vezes a sessão só está lenta, e matar
descarta trabalho útil.

## User Scenarios & Testing

### User Story 1 — Decidir continuar ou encerrar no timeout
Como usuário, quero receber um alerta no Telegram quando uma sessão excede o
timeout, com a opção de estender/continuar ou encerrar, para não perder trabalho
de uma sessão que está apenas demorando.

**Fluxo**: `toolTimeoutMs` estoura → em vez de matar, o sistema pausa a decisão,
emite alerta no Telegram ("timeout atingido — continuar ou encerrar?") →
usuário responde → continuar estende a janela; encerrar mata graciosamente.

**Aceite**: nenhum processo é morto automaticamente no timeout quando o modo de
aprovação está ativo; a decisão do humano é aplicada.

### User Story 2 — Manter encerramento automático (opt-out)
Como usuário que prefere o comportamento antigo, quero poder configurar o timeout
para encerrar automaticamente, para runs desassistidas não ficarem penduradas
esperando aprovação.

**Fluxo**: config `timeout.mode = "auto-kill"` → ao estourar, mantém o
comportamento atual (SIGKILL + `CliTimeoutError`), sem pedir aprovação.

**Aceite**: com opt-out ativo, o comportamento é idêntico ao atual; o default e o
modo são explicitamente configuráveis.

### User Story 3 — Timeout como alerta, não gate imediato
Como usuário, quero que o timeout apareça como um alerta de estado (não um gate
que já parou tudo), para diferenciar "está demorando" de "falhou de fato".

**Fluxo**: timeout atingido → estado da sessão vira "alerta: timeout, aguardando
decisão" (relaciona F53) → só vira falha se o usuário encerrar ou se a janela de
aprovação expirar sem resposta.

**Aceite**: o timeout é visível como alerta distinto na UI web e não é
contabilizado como falha até a decisão.

### Edge Cases
- **Sem resposta à aprovação**: definir uma janela máxima de espera pela
  aprovação; ao expirar, aplicar uma ação default configurável (encerrar ou
  estender mais uma vez).
- **Telegram indisponível** (sem token/chat): se o modo é aprovação mas não há
  canal, cair para a ação default configurável em vez de travar indefinidamente.
- **Múltiplos timeouts na mesma sessão**: cada extensão reinicia a contagem; deve
  haver limite de extensões para evitar loop infinito.
- **Abort manual durante a espera**: abort do usuário tem precedência sobre a
  aprovação pendente.
- **Processo realmente travado (idle)**: combinar com o sinal de ociosidade (F53)
  para dar contexto na mensagem de aprovação (ex.: "ocioso há Xs").

## Requirements

### Functional Requirements
- **FR-001**: A decisão de timeout DEVE ser implementada como um **hook assíncrono
  no runner** (ex.: `onTimeout(): Promise<'extend' | 'kill'>`), NÃO dentro de
  `spawn.ts`. O `spawn` hoje faz `SIGKILL` + `reject(CliTimeoutError)` de forma
  síncrona e, por `architecture.md`, adapters/spawn não devem conhecer
  notificação — o seam de espera/decisão fica na camada do runner.
- **FR-002**: Ao atingir o timeout no modo aprovação, o sistema NÃO DEVE encerrar
  o processo automaticamente; DEVE solicitar decisão humana via Telegram.
- **FR-003**: A solicitação DEVE oferecer ao menos "continuar/estender" e
  "encerrar", e aplicar a resposta.
- **FR-004**: "Continuar" DEVE estender a janela de execução por um incremento
  configurável, reiniciando a contagem de timeout.
- **FR-005**: O sistema DEVE oferecer um modo `auto-kill` que preserva o
  comportamento atual (SIGKILL + `CliTimeoutError`). O default de fábrica DEVE ser
  `auto-kill` (seguro para runs desassistidas), com `approval` como opt-in.
- **FR-006**: O timeout DEVE ser representado como estado de alerta na UI (reusar
  o enum de estado de F53), e só virar falha após decisão de encerrar ou expiração
  da janela de aprovação.
- **FR-007**: DEVE existir uma janela máxima de espera pela aprovação e uma ação
  default aplicada quando ela expira.
- **FR-008**: Se o canal de aprovação estiver indisponível (sem token/chat), o
  sistema DEVE aplicar a ação default em vez de esperar indefinidamente.
- **FR-009**: DEVE haver um limite configurável de extensões por sessão; ao
  estender, o sistema DEVE detectar se houve progresso (reusar o sinal de
  ociosidade de F53) para não estender indefinidamente um processo travado.
- **FR-010**: A aprovação de timeout é um **novo tipo de request interativo** —
  distinto de gate/stage/input. Reutilizar o `telegram-poller` implica adicionar
  um novo padrão de comando, um novo estado/tabela no DB e o `reply_markup`
  correspondente; "reutilizar" NÃO significa que o mecanismo atual já cobre este
  caso.
- **FR-011**: O sistema DEVE notificar o **resultado** da decisão
  (estendido / encerrado / expirado) de volta ao tópico da feature (F54) e à UI.

### Key Entities
- **Timeout Policy**: modo (`approval` | `auto-kill`), incremento de extensão,
  janela de espera, ação default, limite de extensões.
- **Approval Request**: solicitação pendente vinculada à sessão/feature, com
  opções e prazo.
- **Session Status**: ganha o estado "alerta de timeout, aguardando decisão"
  (compartilhado com F53).

## Success Criteria

### Measurable Outcomes
- **SC-001**: No modo aprovação, 0% das sessões são mortas automaticamente no
  timeout sem decisão humana ou expiração da janela.
- **SC-002**: "Continuar" estende a sessão e ela conclui com sucesso em cenários
  de teste onde antes falharia por timeout.
- **SC-003**: No modo `auto-kill`, o comportamento é byte-a-byte equivalente ao
  atual (mesma `CliTimeoutError`), verificado por teste de regressão.
- **SC-004**: 100% das solicitações sem resposta aplicam a ação default dentro da
  janela configurada (sem sessão pendurada indefinidamente).

## Dependencies & Open Decisions
- **Reestruturação do timeout como hook no runner (FR-001) é a mudança central** e
  precisa entrar no plan — não é ajuste no `spawn.ts`.
- **O `telegram-poller` NÃO cobre este request hoje** (só gate/stage/input);
  FR-010 exige novo comando + estado no DB. Dimensionar como trabalho novo.
- Consome o enum de estado de F53 (alerta de timeout).

## Assumptions
- Existe canal interativo de Telegram (`telegram-poller.ts`) e gates aprováveis; a
  feature estende esse mecanismo (não apenas reaproveita) para a decisão de
  timeout.
- Default de fábrica: `auto-kill` (FR-005); `approval` é opt-in.
- O incremento de extensão e a janela de espera são configuráveis por
  runtime/feature.
