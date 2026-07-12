# F48 — Card de Demanda Enriquecido na Tela Principal

**Tipo**: Feature
**Status**: Pendente — triagem
**Prioridade sugerida**: Media
**Relaciona**: F31 (Dashboard Kanban Overview)

## Relato do usuario (2026-07-11)

> Na tela principal mostrar: Numero feat / Descritivo da feature / Tool /
> Modelo / Effort / Ultima mensagem da IA / Consumo de Tokens / Tempo de
> execucao

## Problema

O card de feature no kanban (F31) hoje nao expõe todo esse conjunto de
informacoes de forma direta — usuario precisa entrar no detalhe para ver
tool/model/effort, ultima mensagem da IA, tokens e tempo.

## Escopo provavel

- `src/web/static/components/` — componente de card do kanban (F31)
- `src/db/` — confirmar que todos os campos (ultima mensagem, tokens, tempo)
  ja sao consultaveis em uma unica query de listagem sem N+1

## Proximo passo

Revisar o componente de card atual (`docs/features/F31-dashboard-kanban-overview.md`)
para ver quais desses campos ja existem em outro lugar da UI e so precisam
ser promovidos ao card, versus quais exigem nova query.
