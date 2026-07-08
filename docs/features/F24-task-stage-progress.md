# F24 — Task & Stage Progress na TUI

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F05, F15
**Status**: Em progresso (branch `feat/f24-tui-dashboard-progress`)

## Nota de escopo (dashboard + detail progress)

Este item foi retomado numa rodada de trabalho focada em dashboard/detail da
TUI (grouping do dashboard principal, expansao inline de workflow, tasks em
progresso, e limpeza do detail screen). Essa rodada tocou diretamente os
criterios de aceite deste doc — task-level e stage-level progress ja
existiam parcialmente no codigo (tabela `task_runs`, `useTaskRuns`,
`summarizeTaskRuns`) antes desta rodada; o que faltava era expor isso de
forma nao duplicada no dashboard principal e no detail screen. Ver secao
"Progresso desta rodada" abaixo para o que foi entregue e o que ainda falta.

Uma decisao deliberada desta rodada: o mockup original de "Sidebar — Task
list com stage indicators" abaixo foi **superado**. O board de workflow
agora vive exclusivamente no detail screen (run detail), nao mais duplicado
na sidebar — a sidebar mostra apenas Runs/Gates/Skills/Notifications. Isso
evita o board de workflow divergir entre dois lugares.

## Problema

A TUI atual mostra apenas o status de features (running/done/failed), mas nao indica qual task especifica dentro da feature esta sendo executada, nem em qual estagio do pipeline (specify, plan, implement, etc.) o agente se encontra. O usuario nao tem visibilidade granular do progresso.

## Solucao

### Modelo de dados

Estender o tracking de runs para incluir task-level e stage-level progress:

```typescript
interface TaskProgress {
  taskId: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  stage?: string;       // 'specify' | 'plan' | 'implement' | custom skill
  startedAt?: string;
  endedAt?: string;
}

interface RunProgress {
  featureId: string;
  currentTask?: TaskProgress;
  tasks: TaskProgress[];
  currentStage?: string;
}
```

### UI Components

#### Sidebar — Task list com stage indicators

```
Runs
  ▶ feat-01 (implement)
    ✓ task-01 specify    2m
    ✓ task-02 plan       1m
    ⟳ task-03 implement  ···
    ○ task-04
    ○ task-05
  ○ feat-02 (pending)
```

#### Status Bar — Task ativa com stage

```
▶ feat-01 > task-03 (implement) | claude/opus | 12.3k tokens | 2m34s
```

#### Stage Pipeline — Indicador visual do pipeline

```
  specify ──✓──→ plan ──✓──→ implement ──⟳──→ test ──○──→ done
```

### Deteccao de stage

Para cada adapter, parsear o output do agente para detectar mudancas de stage:
- **Claude**: detectar chamadas a skills (`/speckit-specify`, `/speckit-plan`, `/speckit-implement`)
- **Codex/OpenCode**: heuristicas baseadas em output

Fallback: task-level tracking via backlog.yaml (campo `status` do TaskSchema).

### Persistencia

- TaskProgress salvo no SQLite (nova tabela `task_runs`)
- Stage atual propagado via Event System (F15) para a TUI
- Atualizado em tempo real via Log Streaming (F06)

## Criterios de aceite

- [x] TUI mostra qual task dentro da feature esta rodando — dashboard principal (`In Progress Tasks`, cross-run via `listRunningTaskRuns`) e detail screen (`Workflow` + `Tasks` sections)
- [x] TUI mostra em qual stage (specify/plan/implement) o agente esta — expansao inline no bloco EXECUTION/BLOCKED do dashboard (`feat-xxxx > |_ specify done > |_ plan done > |_ tasks executing`) e no detail screen
- [x] Status bar inclui task ativa + stage — ja implementado antes desta rodada (`StatusBar` consome `currentStage`)
- [ ] Sidebar lista todas as tasks da feature com status individual — decisao revertida nesta rodada: a sidebar nao duplica mais o board de workflow (ver "Nota de escopo"); a lista de tasks fica no dashboard principal e no detail screen
- [ ] Pipeline visual mostra progresso dos stages — implementado como lista textual indentada (`|_ stage status`), nao como diagrama ASCII horizontal (`specify ──✓──→ plan ...`); suficiente para o terminal atual, mas o diagrama horizontal do mockup original nao foi construido
- [x] Historico de tasks/stages persiste no DB para consulta posterior — tabela `task_runs` (pre-existente) + nova query `listRunningTaskRuns` para o feed cross-run

## Progresso desta rodada (dashboard + detail progress)

Entregue nesta rodada (branch `feat/f24-tui-dashboard-progress`):

- Dashboard principal reagrupado em blocos ordenados fixos: `EXECUTION/BLOCKED`, `TODO`, `DONE`, `CANCELED`
- Expansao inline do workflow stage tree quando um item em execucao esta selecionado no bloco EXECUTION/BLOCKED
- Feed "In Progress Tasks" cross-run direto no dashboard principal (nao so no detail screen)
- Remocao do board de workflow duplicado na sidebar (agora vive so no detail screen)
- Detail screen: descricao completa do spec/feature (`spec`/`specFile`), separacao Tool vs Model, breakdown de tasks declaradas no backlog
- Log de execucao: prefixos `AI>`/`TOOL>` ocultos, saida de `tool` renderizada em bloco (estilo code block), heartbeat reformatado (corrige mensagens truncadas/ilegiveis tipo `...[msq] codex feat-10 em excecu.....`)

Fora de escopo desta rodada (nao e F24, mas foi entregue no mesmo PR por
overlap de arquivos): comando de force-bypass de gate (F1, ver
`docs/hotfixes/` ou changelog do PR).

Ainda pendente para fechar F24 por completo: diagrama horizontal de pipeline
(`specify ──✓──→ plan ...`) e deteccao de stage por parsing de output do
agente (Claude skills / heuristicas Codex/OpenCode) alem do fallback via
`backlog.yaml`/`task_runs` ja existente.
