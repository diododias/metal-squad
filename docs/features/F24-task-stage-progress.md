# F24 — Task & Stage Progress na TUI

**Epic**: [E02 — Modern TUI](../epics/E02-modern-tui.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F05, F15

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

- [ ] TUI mostra qual task dentro da feature esta rodando
- [ ] TUI mostra em qual stage (specify/plan/implement) o agente esta
- [ ] Status bar inclui task ativa + stage
- [ ] Sidebar lista todas as tasks da feature com status individual
- [ ] Pipeline visual mostra progresso dos stages
- [ ] Historico de tasks/stages persiste no DB para consulta posterior
