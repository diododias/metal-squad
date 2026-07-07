---
name: "task-blocks"
description: "Apos a etapa de tasks, separa as tasks em blocos que cabem na janela de contexto do modelo (consumindo ate 70% da sessao) e mede tokens por bloco/task para analytics."
compatibility: "Requer metal-squad (msq). Consome tasks.md gerado pelo speckit-tasks."
---

# Skill: Task Blocks

Fonte canonica desta skill: este arquivo em `.claude/skills/task-blocks/`.

Use esta skill **depois da etapa `tasks`** do fluxo speckit/msq, para transformar
uma lista de tasks solta em **blocos executaveis** que cabem na janela de
contexto do modelo que vai implementar, e para **medir tokens por bloco/task**.

Feature de referencia: [`../../../docs/features/F28-task-context-blocks.md`](../../../docs/features/F28-task-context-blocks.md).

## Quando usar

- Logo apos `speckit-tasks` gerar `tasks.md` e o backlog ter `feature.tasks`.
- Antes de disparar a implementacao, para dimensionar quantas sessoes serao
  necessarias e nao estourar (nem desperdicar) a janela de contexto.
- Quando quiser analytics de consumo estimado por bloco/task.

## Principio

Cada bloco deve caber na janela de contexto do modelo, consumindo no maximo
**70%** dela. A folga de 30% cobre tool output, heartbeat, thinking e a resposta
do agente. Tasks maiores que o budget ficam isoladas e sinalizadas como
`oversized` — candidatas a nova decomposicao via `decompose`/F04.

## Fluxo

1. Garanta que `tasks.md` foi sincronizado para o backlog
   (`syncFeatureTasksToBacklog` / `workflow.syncTasksToBacklog`).
2. Resolva a janela de contexto do modelo/tool da feature e planeje os blocos:

   ```ts
   import { planFeatureTaskBlocks } from '../../../src/core/tasks/blocks.js';

   const plan = planFeatureTaskBlocks(feature); // ratio default 0.70
   // plan.budgetTokens, plan.blocks[].totalTokens, plan.oversizedTasks
   ```

3. Para cada `oversizedTask`, volte um passo e quebre a task antes de executar.
4. Carregue as tasks no `msq` para medir tokens por task de verdade: cada task
   emite `tokens:update` (F15) que persiste em `token_usage`/`task_runs`
   (F16/F17). O consumo em tempo real aparece na TUI por run.

## Analytics

O `BlockPlan` ja e analytics-ready:

- `budgetTokens` — teto por bloco (`contextWindow * 0.70`).
- `blocks[].totalTokens` — custo estimado do bloco.
- `totalTokens` / `totalTasks` — agregados do plano.
- `oversizedTasks` — tasks que nao cabem no budget.

Compare o estimado (plano) com o real (`token_usage`) para calibrar o custo base
por task ao longo do tempo.

## Nao faca

- Nao use esta skill para decompor uma feature em tasks — isso e a `decompose`
  (F04). Aqui as tasks ja existem; o foco e empacotar e medir.
- Nao chute a janela de contexto: use `resolveContextWindow` (modelo → tool →
  default) para manter o budget correto por modelo.
- Nao ignore `oversizedTasks`: rodar uma task que nao cabe no budget derrota o
  proposito do bloco.
