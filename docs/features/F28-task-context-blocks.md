# F28 — Task Context Blocks (packing + token analytics)

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F04 (task sizer), F15 (event system), F16/F17 (analytics)

## Problema

Depois da etapa `tasks` (speckit gera `tasks.md`), as tasks ficam soltas: sao
sincronizadas para o backlog mas nao ha nocao de **quanto contexto** elas
consomem nem de como agrupa-las em execucoes que caibam na janela do modelo. Sem
isso:

- sessoes de implementacao estouram contexto ou desperdicam a janela;
- nao da para medir tokens por task/bloco para analytics.

## Solucao

Empacotar as tasks em **blocos** que cabem na janela de contexto do modelo que
vai implementar, consumindo no maximo **70% da sessao** (folga para tool
output, heartbeat e resposta), e medir tokens por bloco/task.

### Modulo `src/core/tasks/blocks.ts`

Funcoes puras (testaveis, sem I/O):

- `resolveContextWindow({ model, tool })` — janela por modelo (match por
  substring, ex.: `claude-opus-4-8` → 200k) com fallback por tool e default.
- `estimateTokens(text)` — heuristica ~4 chars/token.
- `estimateTaskTokens(task, baseTokens)` — custo base + titulo/corpo.
- `planTaskBlocks(tasks, { contextWindow, budgetRatio, baseTokensPerTask })` —
  empacota preservando a ordem topologica; budget = `contextWindow * ratio`
  (ratio default `0.70`). Tasks maiores que o budget ficam isoladas e sao
  marcadas como `oversizedTasks`.
- `planFeatureTaskBlocks(feature, options)` — resolve a janela pelo
  `model`/`tool` da feature e estima cada task.

O plano (`BlockPlan`) ja carrega `budgetTokens`, `totalTokens` por bloco e por
plano, `totalTasks` e `oversizedTasks` — pronto para analytics.

### Skill `task-blocks`

`.claude/skills/task-blocks/SKILL.md` descreve o fluxo operacional: apos a etapa
`tasks`, dividir em blocos com o modulo acima, medir tokens e carregar as tasks
no `msq` para acompanhamento por task (`task_runs` + `token_usage`).

## Fluxo de uso

1. `speckit-tasks` gera `tasks.md`.
2. `syncFeatureTasksToBacklog` popula `feature.tasks` no backlog.
3. `planFeatureTaskBlocks(feature)` produz os blocos (≤ 70% da janela).
4. Cada bloco vira unidade de execucao; tokens sao registrados por task via
   eventos `tokens:update` (ver F15) → `token_usage` (ver F16/F17).

## Criterios de aceite

- [x] Modulo `blocks.ts` com packing por janela de contexto e budget de 70%
- [x] Estimativa de tokens por task e por bloco (analytics-ready)
- [x] Resolucao de janela por modelo/tool com default seguro
- [x] Tasks oversized isoladas e sinalizadas
- [x] Skill `task-blocks` documenta o fluxo pos-`tasks`
- [ ] Integracao do runner para executar bloco a bloco (fase seguinte)
