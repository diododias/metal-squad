# metal-squad — Roadmap

## Estado atual (v0.0.1)

O que ja funciona:
- CLI com `msq init`, `msq run`, `msq status`, `msq ui`
- Backlog YAML com epics → features → tasks + dependencias
- Scheduler com topological ordering e concurrency limit
- Adapters para claude, codex, opencode (spawn headless)
- TUI basica (tabela de runs + painel de gates)
- SQLite DB (repos, runs, token_usage, gates)
- Secrets via OS keychain
- Notifications via Telegram
- ~~Retry, pause, resume, abort~~ (F11/F12 entregues)
- ~~Analytics/dashboard de custos~~ (F16/F17/F18 entregues)
- ~~Controle de budget~~ (F14 entregue)
- ~~Decomposicao automatica de tasks~~ (F04 entregue)
- ~~Workflow por etapas com sessoes isoladas~~ (F27 entregue)

O que ainda falta:
- Acoplado ao spec-kit (prompt hardcoded) → F01/F02/F03
- TUI muito simples vs opencode/claude-code/codex → F05–F09/F24
- Adapters hardcoded (3 tools fixos) → F20
- Sem streaming de output em tempo real → F06
- Sem arquivos associados a features/tasks → F01
- Sem event system interno → F15
- Resume de pipeline a partir do estado persistido → F26
- Hardening do fluxo `msq-develop` → F25

---

## Progresso por fase

| Fase | Total | Entregues | Pendentes |
|------|-------|-----------|-----------|
| Fase 1 — Fundacao | 4 | 0 | 4 |
| Fase 2 — TUI moderna | 6 | 0 | 6 |
| Fase 3 — Orquestracao robusta | 5 | 5 | 0 |
| Fase 4 — Observability & DX | 6 | 3 | 3 |
| Fase 5 — Extensibilidade | 4 | 0 | 4 |
| Backlog operacional | 2 | 0 | 2 |

---

## Fase 1 — Fundacao (skills + event system)

**Objetivo**: desacoplar do spec-kit, criar infraestrutura reativa

| Feature | Esforco | Prioridade | Status |
|---------|---------|------------|--------|
| [F01 — YAML Schema v2](features/F01-yaml-schema-v2.md) | Medium | Critica | Pendente |
| [F02 — Skill Registry](features/F02-skill-registry.md) | Medium | Critica | Pendente |
| [F03 — Dynamic Prompt Builder](features/F03-dynamic-prompt-builder.md) | Medium | Critica | Pendente |
| [F15 — Event System](features/F15-event-system.md) | Medium | Critica | Pendente |

**Entrega**: msq funciona com skills parametrizadas, arquivos associados, e emite eventos internos.

---

## Fase 2 — TUI moderna

**Objetivo**: interface de controle equivalente a opencode/claude-code

| Feature | Esforco | Prioridade | Status |
|---------|---------|------------|--------|
| [F05 — Layout Multi-Painel](features/F05-layout-multi-panel.md) | High | Critica | Pendente |
| [F06 — Log Streaming](features/F06-log-streaming.md) | High | Alta | Pendente |
| [F07 — Status Bar](features/F07-status-bar.md) | Low | Alta | Pendente |
| [F08 — Session Navigation](features/F08-session-navigation.md) | Medium | Media | Pendente |
| [F09 — Command Palette](features/F09-command-palette.md) | Medium | Media | Pendente |
| [F24 — Task & Stage Progress](features/F24-task-stage-progress.md) | Medium | Alta | Pendente |

**Entrega**: TUI multi-painel com streaming, status bar, navegacao rica, e progresso granular por task/stage.

---

## Fase 3 — Orquestracao robusta ✅

**Objetivo**: pipeline confiavel para uso em producao

| Feature | Esforco | Prioridade | Status |
|---------|---------|------------|--------|
| [F11 — Retry Policies](features/F11-retry-policies.md) | Medium | Alta | Entregue |
| [F12 — Pause/Resume/Abort](features/F12-pause-resume-abort.md) | Medium | Alta | Entregue |
| [F14 — Budget Caps](features/F14-budget-caps.md) | Medium | Alta | Entregue |
| [F04 — Skill Task Sizer](features/F04-skill-task-sizer.md) | Medium | Alta | Entregue |
| [F27 — Workflow por etapas com sessoes isoladas](features/F27-stage-sessions-telegram.md) | High | Alta | Entregue |

**Entrega**: retry, pause/resume, budget caps, decomposicao automatica de tasks.

---

## Fase 4 — Observability & DX

**Objetivo**: visibilidade e facilidade de uso

| Feature | Esforco | Prioridade | Status |
|---------|---------|------------|--------|
| [F16 — Cost Dashboard](features/F16-cost-dashboard.md) | Medium | Alta | Entregue |
| [F17 — Analytics CLI](features/F17-analytics-cli.md) | Low | Media | Entregue |
| [F18 — Duration Tracking](features/F18-duration-tracking.md) | Low | Media | Entregue |
| [F19 — Notifications v2](features/F19-notifications-v2.md) | Medium | Media | Pendente |
| [F13 — Execution Graph](features/F13-execution-graph.md) | Medium | Media | Pendente |
| [F10 — Theme System](features/F10-theme-system.md) | Low | Baixa | Pendente |

**Entrega**: dashboard de custos, analytics CLI, multi-channel notifications.

---

## Fase 5 — Extensibilidade

**Objetivo**: msq como plataforma extensivel

| Feature | Esforco | Prioridade | Status |
|---------|---------|------------|--------|
| [F20 — Plugin Adapters](features/F20-plugin-adapters.md) | High | Media | Pendente |
| [F21 — Setup Wizard](features/F21-setup-wizard.md) | Medium | Media | Pendente |
| [F22 — Per-Repo Config](features/F22-per-repo-config.md) | Low | Media | Pendente |
| [F23 — Agent Config Gen](features/F23-agent-config-gen.md) | Low | Baixa | Pendente |

**Entrega**: plugin system, setup interativo, config hierarquica.

---

## Hotfixes descobertos em validacao

| Item | Status | Prioridade |
|------|--------|------------|
| [H01 — `msq run --feature` com dependencias insatisfeitas encerra em falso positivo](hotfixes/H01-run-feature-dependency-deadlock.md) | Resolvido | Critica |
| [H02 — timeout do adapter `codex` precisa expor progresso e estado parcial](hotfixes/H02-codex-adapter-timeout-observability.md) | Resolvido | Alta |
| [H03 — `msq run` precisa diagnosticar banco global em modo somente leitura](hotfixes/H03-run-readonly-db-path.md) | Resolvido | Alta |
| [H04 — adapter `claude` precisa expor heartbeat e progresso incremental](hotfixes/H04-claude-adapter-progress-observability.md) | Resolvido | Alta |
| [H05 — prompt do `msq-develop` pode induzir recursao de `msq run` dentro da propria run](hotfixes/H05-msq-develop-run-recursion.md) | Resolvido | Alta |
| [H06 — adapter `claude` usa `-p` com contrato incorreto e quebra prompts com front matter](hotfixes/H06-claude-adapter-print-flag-contract.md) | Resolvido | Critica |
| [H07 — adapter `codex` passa o prompt antes das opcoes e a CLI aborta o parse](hotfixes/H07-codex-exec-prompt-order.md) | Resolvido | Critica |
| [H08 — `dev-flow` SKILL.md sem YAML frontmatter quebra `codex exec` no startup](hotfixes/H08-codex-dev-flow-skill-missing-frontmatter.md) | Resolvido | Alta |

---

## Backlog operacional pendente

| Item | Tipo | Prioridade | Status |
|------|------|------------|--------|
| [F25 — Hardening do fluxo `msq-develop`](features/F25-msq-develop-harness-hardening.md) | Feature | Alta | Pendente |
| [F26 — Resume de pipeline a partir do estado persistido](features/F26-resume-pipeline-from-state.md) | Feature | Alta | Pendente |
| [F28 — Task Context Blocks (packing + token analytics)](features/F28-task-context-blocks.md) | Feature | Alta | Em progresso |

---

## Grafo de dependencias

```
F01 (schema v2)
 ├→ F02 (skill registry)
 │   ├→ F03 (dynamic prompt)
 │   └→ F04 (task sizer) ✅
 └→ F22 (per-repo config)

F15 (event system)
 ├→ F06 (log streaming)
 ├→ F12 (pause/resume) ✅
 ├→ F14 (budget caps) ✅
 └→ F19 (notifications v2)

F05 (layout multi-panel)
 ├→ F06 (log streaming)
 ├→ F07 (status bar)
 ├→ F08 (session nav)
 ├→ F09 (command palette)
 ├→ F13 (execution graph)
 ├→ F16 (cost dashboard) ✅
 └→ F24 (task & stage progress)

F07 (status bar)
 └→ F16 (cost dashboard) ✅

Independentes:
 F10 (theme), F11 (retry) ✅, F17 (analytics) ✅, F18 (duration) ✅,
 F20 (plugins), F21 (wizard), F23 (config gen), F27 (stage sessions) ✅
```
