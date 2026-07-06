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

O que falta / problemas:
- Acoplado ao spec-kit (prompt hardcoded)
- TUI muito simples vs opencode/claude-code/codex
- Sem retry, pause, resume, abort
- Sem analytics/dashboard de custos
- Adapters hardcoded (3 tools fixos)
- Sem streaming de output em tempo real
- Sem controle de budget
- Sem arquivos associados a features/tasks

---

## Fase 1 — Fundacao (skills + event system)

**Objetivo**: desacoplar do spec-kit, criar infraestrutura reativa

| Feature | Esforco | Prioridade |
|---------|---------|------------|
| [F01 — YAML Schema v2](features/F01-yaml-schema-v2.md) | Medium | Critica |
| [F02 — Skill Registry](features/F02-skill-registry.md) | Medium | Critica |
| [F03 — Dynamic Prompt Builder](features/F03-dynamic-prompt-builder.md) | Medium | Critica |
| [F15 — Event System](features/F15-event-system.md) | Medium | Critica |

**Entrega**: msq funciona com skills parametrizadas, arquivos associados, e emite eventos internos.

---

## Fase 2 — TUI moderna

**Objetivo**: interface de controle equivalente a opencode/claude-code

| Feature | Esforco | Prioridade |
|---------|---------|------------|
| [F05 — Layout Multi-Painel](features/F05-layout-multi-panel.md) | High | Critica |
| [F06 — Log Streaming](features/F06-log-streaming.md) | High | Alta |
| [F07 — Status Bar](features/F07-status-bar.md) | Low | Alta |
| [F08 — Session Navigation](features/F08-session-navigation.md) | Medium | Media |
| [F09 — Command Palette](features/F09-command-palette.md) | Medium | Media |

**Entrega**: TUI multi-painel com streaming, status bar, e navegacao rica.

---

## Fase 3 — Orquestracao robusta

**Objetivo**: pipeline confiavel para uso em producao

| Feature | Esforco | Prioridade |
|---------|---------|------------|
| [F11 — Retry Policies](features/F11-retry-policies.md) | Medium | Alta |
| [F12 — Pause/Resume/Abort](features/F12-pause-resume-abort.md) | Medium | Alta |
| [F14 — Budget Caps](features/F14-budget-caps.md) | Medium | Alta |
| [F04 — Skill Task Sizer](features/F04-skill-task-sizer.md) | Medium | Alta |

**Entrega**: retry, pause/resume, budget caps, decomposicao automatica de tasks.

---

## Fase 4 — Observability & DX

**Objetivo**: visibilidade e facilidade de uso

| Feature | Esforco | Prioridade |
|---------|---------|------------|
| [F16 — Cost Dashboard](features/F16-cost-dashboard.md) | Medium | Alta |
| [F17 — Analytics CLI](features/F17-analytics-cli.md) | Low | Media |
| [F18 — Duration Tracking](features/F18-duration-tracking.md) | Low | Media |
| [F19 — Notifications v2](features/F19-notifications-v2.md) | Medium | Media |
| [F13 — Execution Graph](features/F13-execution-graph.md) | Medium | Media |
| [F10 — Theme System](features/F10-theme-system.md) | Low | Baixa |

**Entrega**: dashboard de custos, analytics CLI, multi-channel notifications.

---

## Fase 5 — Extensibilidade

**Objetivo**: msq como plataforma extensivel

| Feature | Esforco | Prioridade |
|---------|---------|------------|
| [F20 — Plugin Adapters](features/F20-plugin-adapters.md) | High | Media |
| [F21 — Setup Wizard](features/F21-setup-wizard.md) | Medium | Media |
| [F22 — Per-Repo Config](features/F22-per-repo-config.md) | Low | Media |
| [F23 — Agent Config Gen](features/F23-agent-config-gen.md) | Low | Baixa |

**Entrega**: plugin system, setup interativo, config hierarquica.

---

## Grafo de dependencias

```
F01 (schema v2)
 ├→ F02 (skill registry)
 │   ├→ F03 (dynamic prompt)
 │   └→ F04 (task sizer)
 └→ F22 (per-repo config)

F15 (event system)
 ├→ F06 (log streaming)
 ├→ F12 (pause/resume)
 ├→ F14 (budget caps)
 └→ F19 (notifications v2)

F05 (layout multi-panel)
 ├→ F06 (log streaming)
 ├→ F07 (status bar)
 ├→ F08 (session nav)
 ├→ F09 (command palette)
 ├→ F13 (execution graph)
 └→ F16 (cost dashboard)

F07 (status bar)
 └→ F16 (cost dashboard)

Independentes:
 F10 (theme), F11 (retry), F17 (analytics), F18 (duration),
 F20 (plugins), F21 (wizard), F23 (config gen)
```
