# F25 — Hardening do fluxo `msq-develop`

**Epic**: [E05 — Developer Experience](../epics/E05-dx-improvements.md)  
**Prioridade**: Alta  
**Esforco**: Low

## Problema

A skill `msq-develop` hoje assume que basta trocar o `backlog.yaml` para a proxima feature e rodar `msq run`. No teste de 2026-07-06 isso produziu um falso positivo:

- o backlog isolado ficou com uma feature dependente sem a cadeia completa de dependencias
- o `msq run` retornou `0` sem output util
- a skill nao tinha um passo obrigatorio para confirmar que uma `run` foi criada, que houve output do executor ou que houve commits novos

## Objetivo

Tornar `msq-develop` um harness de validacao do proprio `msq`, com evidencias objetivas de execucao e com documentacao imediata de falhas operacionais, sem cair na tentacao de implementar manualmente a feature alvo.

## Escopo

- Preservar ou reconstruir a cadeia de dependencias minima no backlog temporario usado pelo teste.
- Validar antes do run se a feature selecionada depende de IDs ausentes no backlog temporario.
- Nao criar worktree automaticamente no fluxo do `msq-develop`; se isolamento for desejado, a IA/operador cria o worktree antes de iniciar a execucao.
- Exigir verificacao pos-run com pelo menos:
  - nova linha em `msq status` ou no banco `runs`
  - output do executor
  - diff/commits produzidos pelo agente
- Se o run falhar ou nao gerar evidencias, parar o fluxo e abrir item em `docs/` em vez de implementar a feature manualmente.
- Registrar no proprio output da skill a diferenca entre:
  - falha do `msq`
  - falha do adapter
  - falha da feature/spec

## Criterios de aceite

- A skill detecta backlog temporario invalido antes de rodar o `msq`.
- A skill trata run sem `runs` novas e sem output como falha do produto, nao como sucesso.
- A skill documenta automaticamente o problema encontrado em `docs/features` ou `docs/hotfixes`.
- A skill instrui explicitamente a nao corrigir manualmente a feature alvo quando o problema estiver no fluxo `msq`.
