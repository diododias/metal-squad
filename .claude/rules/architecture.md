# Architecture Rules

## Principio central

Cada camada do `msq` deve continuar pequena, previsivel e com responsabilidade clara. Evite espalhar regras de negocio entre CLI, adapters, DB e UI.

## Ownership por pasta

- `src/commands/`
  - define argumentos e chama services/core
  - nao deve conter logica de negocio relevante nem acesso SQL inline

- `src/core/backlog/`
  - schema YAML, defaults, loader e montagem de prompt
  - nao deve conhecer detalhes de UI

- `src/core/orchestrator/`
  - ordenacao topologica, scheduler e execucao do plano
  - nao deve embutir parsing de CLI

- `src/core/skills/`
  - discovery, precedence, resolve e validate
  - repo > global > external > builtin e o contrato atual observado no codigo

- `src/core/adapters/`
  - traduz o prompt para cada tool e normaliza retorno
  - deve reaproveitar helper de spawn/heartbeat em vez de reinventar processo por adapter

- `src/core/events/`
  - event bus e wiring de observabilidade/notificacao
  - prefira eventos para acoplar runner, logs e UI

- `src/db/`
  - ownership de SQLite, migracoes e queries
  - mensagens de erro de persistencia precisam ser acionaveis

- `src/ui/`
  - composicao Ink, hooks e formatacao
  - nao deve acessar filesystem ou spawnar processos diretamente

## Regras praticas

- Reaproveite erros tipados quando o problema for operacional, como `DbAccessError`.
- Se um adapter precisa heartbeat, resumo parcial ou parsing de arquivos tocados, implemente no helper comum quando fizer sentido.
- Quando uma mudanca altera contrato do backlog, ajuste schema, loader, prompt builder e testes correspondentes juntos.
- Quando uma mudanca altera comportamento observavel do produto, atualize o doc de feature/hotfix correspondente.

## Antipadronoes

- misturar detalhes de SQLite dentro de UI ou commands
- duplicar regras de precedence de skills em mais de um modulo
- acoplar validacao de harness dentro de fluxo normal de implementacao
- usar docs placeholder como desculpa para inventar arquitetura paralela
