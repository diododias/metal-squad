# metal-squad — Roadmap

## Estado atual (v0.0.1)

O que ja funciona:
- CLI com `msq init`, `msq run`, `msq status`, `msq ui`, `msq web`
- Backlog YAML com epics → features → tasks + dependencias
- Scheduler com topological ordering e concurrency limit
- Adapters para claude, codex, opencode (spawn headless)
- TUI basica (tabela de runs + painel de gates)
- SQLite DB (repos, runs, token_usage, gates)
- Secrets via OS keychain
- Notifications via Telegram, incluindo botoes interativos para perguntas
- Dashboard web (React/JSX, multi-pagina) com auth por cookie/senha
- ~~Retry, pause, resume, abort~~ (F11/F12 entregues)
- ~~Analytics/dashboard de custos~~ (F16/F17/F18 entregues)
- ~~Controle de budget~~ (F14 entregue)
- ~~Decomposicao automatica de tasks~~ (F04 entregue)
- ~~Workflow por etapas com sessoes isoladas~~ (F27 entregue)
- ~~Event system interno (pub/sub)~~ (F15 entregue)
- ~~Command palette & shortcuts~~ (F09 entregue)
- ~~Resume de pipeline a partir do estado persistido~~ (F26 entregue)
- ~~Hardening do fluxo `msq-develop`~~ (F25 entregue)
- ~~Overview em colunas kanban com foco unificado~~ (F31 entregue)
- ~~Web dashboard acessível pelo navegador~~ (F32 entregue)
- ~~Polimento de UX do modo web (detalhe de run, kanban, preview de feature)~~ (F34 entregue)
- ~~Persistencia de config de feature/task no catalogo do banco~~ (F36 entregue)
- ~~Production hardening (budget persistence, ws heartbeat, telegram resume)~~ (F33 entregue)
- ~~Remocao do override pontual de execucao~~ (F37 entregue)
- ~~Hierarquia visual do Live Output (web)~~ (F38 entregue — TUI e auto-scroll ficaram de fora, ver H13)
- ~~Fallback de tool/model em retry + resume no step que falhou~~ (F39 entregue)
- ~~Reaproveitamento adaptativo de sessao entre steps~~ (F41 entregue)
- ~~Prompt/skill customizado por step~~ (F46 entregue)
- ~~Perguntas interativas via Telegram (botoes)~~ (F47 entregue)
- ~~Web v2 redesign (React/JSX, multi-pagina)~~ (F50 entregue)
- ~~Web auth hardening (cookie session, senha, guard de origin/host)~~ (F51 entregue)

O que ainda falta:
- Acoplado ao spec-kit (prompt hardcoded) → F01/F02/F03
- TUI ainda precisa de mais capacidade estrutural em streaming e navegacao → F05/F06/F08
- TUI nao tem a mesma hierarquia visual/auto-scroll do Live Output que o web ja tem (F38) → H13
- Adapters hardcoded (3 tools fixos) → F20
- Sem streaming de output em tempo real na TUI → F06
- Sem arquivos associados a features/tasks → F01
- Telemetria de tokens ainda tem pontos de confusao reportados pelo usuario → H15
- Catalogo de epics/features/tasks so existe no `backlog.yaml`, runtime nao le do banco → F35
- Visualizacao por step e workflow customizavel por projeto → F40
- Tela de detalhe de runs/analytics com tempo total somado → F42
- Editar tool/effort por step + resume com outro agente via UI → F43
- Central de configuracoes de projeto (multi-projeto/multi-repo) → F44
- Card de demanda enriquecido na tela principal → F48
- Continuidade de sessao ao responder pergunta da IA (depende de F41 ✅ e F40) → F49
- Bugs pequenos ainda nao triados a fundo: gate persistente (H16), toast que nao some (H17), mapeamento de tasks incorreto (H18)

---

## Progresso por fase

| Fase | Total | Entregues | Pendentes |
|------|-------|-----------|-----------|
| Fase 1 — Fundacao | 5 | 1 | 4 |
| Fase 2 — TUI moderna | 7 | 3 | 4 |
| Fase 3 — Orquestracao robusta | 5 | 5 | 0 |
| Fase 4 — Observability & DX | 7 | 5 | 2 |
| Fase 5 — Extensibilidade | 4 | 0 | 4 |
| Fase 6 — Web & Remote Control | 5 | 5 | 0 |
| Backlog operacional (harness/hardening) | 8 | 8 | 0 |
| Backlog de feedback — novas funcionalidades | 12 | 6 | 6 |
| Backlog de feedback — melhorias/bugs | 10 | 4 | 6 |

---

## Fase 1 — Fundacao (skills + event system)

**Objetivo**: desacoplar do spec-kit, criar infraestrutura reativa

| Feature | Esforco | Prioridade | Status |
|---------|---------|------------|--------|
| [F01 — YAML Schema v2](features/F01-yaml-schema-v2.md) | Medium | Critica | Pendente |
| [F02 — Skill Registry](features/F02-skill-registry.md) | Medium | Critica | Pendente |
| [F03 — Dynamic Prompt Builder](features/F03-dynamic-prompt-builder.md) | Medium | Critica | Pendente |
| [F35 — Backlog Catalog Import (banco como fonte de verdade em runtime)](features/F35-backlog-catalog-import.md) | Medium | Alta | Pendente |
| [F15 — Event System](features/F15-event-system.md) | Medium | Critica | Entregue |

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
| [F09 — Command Palette](features/F09-command-palette.md) | Medium | Media | Entregue |
| [F24 — Task & Stage Progress](features/F24-task-stage-progress.md) | Medium | Alta | Em progresso |
| [F29 — TUI Shell Polish](features/F29-tui-shell-polish.md) | Medium | Alta | Entregue |
| [F31 — Dashboard Kanban Overview](features/F31-dashboard-kanban-overview.md) | High | Alta | Entregue |

**Entrega**: TUI multi-painel com streaming, status bar, navegacao rica,
progresso granular por task/stage, casca operacional mais polida e overview
em colunas kanban com modelo de foco unificado.

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
| [F10 — Theme System](features/F10-theme-system.md) | Low | Baixa | Entregue |
| [F30 — Token & Context Telemetry Refinement](features/F30-token-context-telemetry.md) | Medium | Alta | Entregue |

**Entrega**: analytics de tokens/duracao, notificacoes multi-canal e leitura de
contexto por sessao/step.

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

## Fase 6 — Web & Remote Control ✅

**Objetivo**: acompanhar e controlar o `msq` pelo navegador

| Feature | Esforco | Prioridade | Status |
|---------|---------|------------|--------|
| [F32 — Web Mode](features/F32-web-mode.md) | High | Alta | Entregue |
| [F34 — Web Run Detail & Control Polish](features/F34-web-run-detail-and-control-polish.md) | High | Alta | Entregue |
| [F36 — Web Feature/Task Config Persistence](features/F36-web-feature-config-persistence.md) | Medium | Alta | Entregue |
| [F50 — Web v2 Redesign (React/JSX, multi-pagina)](features/F50-web-v2-redesign.md) | High | Alta | Entregue |
| [F51 — Web auth hardening (cookie session + password login + origin guard)](features/F51-web-auth-hardening.md) | Medium | Alta | Entregue |

**Entrega**: servidor HTTP/WebSocket com autenticação por token, dashboard kanban,
gates, detalhe de run, command palette e daemon em background. F34 adiciona
historico completo de runs por feature, aba de mudancas de codigo no detalhe de
run, resolucao de gate/stage-request inline e telemetria ao vivo no kanban,
busca/filtro no kanban, indicador de conexao claro e uma tela de preview de
feature com paridade de layout, tentativas anteriores, dependencias e
estimativa de custo. F36 torna o form de config da feature (tool/model/effort/
maxTokens/workflow/retry/skills) e das tasks (status/skills/title/dependsOn)
editavel e persistente no catalogo do banco. F37 remove o override pontual
de execucao, deixando o "Save Config" como unica forma de customizacao. F50
reescreve o frontend web inteiro em React/JSX multi-pagina. F51 troca o login
por ticket-na-URL por sessao via cookie + senha, com guard de Host/Origin
(hardened em H22 para nao bloquear acesso por LAN/mDNS/Tailscale MagicDNS).

---

## Backlog operacional (harness/hardening) ✅

| Item | Tipo | Prioridade | Status |
|------|------|------------|--------|
| [F25 — Hardening do fluxo `msq-develop`](features/F25-msq-develop-harness-hardening.md) | Feature | Alta | Entregue |
| [F26 — Resume de pipeline a partir do estado persistido](features/F26-resume-pipeline-from-state.md) | Feature | Alta | Entregue |
| [F28 — Task Context Blocks (packing + token analytics)](features/F28-task-context-blocks.md) | Feature | Alta | Em progresso |
| [F33 — Production Hardening (budget persistence, ws heartbeat, telegram resume)](features/F33-production-hardening.md) | Feature | Alta | Entregue |
| [F37 — Remove OVERRIDE PONTUAL](features/F37-remove-override-pontual.md) | Feature | Media | Entregue |
| [F38 — Live Output: hierarquia visual (web)](features/F38-live-output-visual-hierarchy.md) | Feature | Media | Entregue (TUI/auto-scroll pendentes, ver H13) |
| [F39 — Fallback de tool/model em retry + resume no step que falhou](features/F39-adapter-fallback-resume.md) | Feature | Alta | Entregue |
| [F41 — Reaproveitamento Adaptativo de Sessao entre Steps](features/F41-adaptive-session-reuse.md) | Feature | Alta | Entregue |

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
| [H09 — TUI com chaves duplicadas provoca trepidacao visual e warnings do React/Ink](hotfixes/H09-ui-duplicate-keys-screen-jitter.md) | Resolvido | Critica |
| [H10 — TUI precisa de altura fixa e alternate screen buffer no terminal](hotfixes/H10-tui-fixed-height-terminal-fit.md) | Resolvido | Alta |
| [H11 — gate com `onFail: stop` nao pausava a pipeline](hotfixes/H11-onfail-gate-not-pausing-pipeline.md) | Resolvido | Alta |
| [H12 — resume hint ausente quando a run parava com `failed`](hotfixes/H12-resume-hint-missing-on-stop-failure.md) | Resolvido | Alta |
| [H20 — checkbox de autoAdvance ignorado em run no meio da execucao](hotfixes/H20-autoadvance-checkbox-ignored-mid-run.md) | Resolvido | Alta |
| [H21 — coercao de boolean da CLI derrota autoAdvance vindo do catalogo](hotfixes/H21-autoadvance-cli-boolean-coercion-defeats-catalog.md) | Resolvido | Alta |
| [H22 — guard de Host/Origin do `msq web` bloqueava LAN/mDNS/Tailscale MagicDNS](hotfixes/H22-web-host-guard-blocks-lan-access.md) | Resolvido | Alta |

---

## Grafo de dependencias

```
F01 (schema v2)
 ├→ F02 (skill registry)
 │   ├→ F03 (dynamic prompt)
 │   └→ F04 (task sizer) ✅
 ├→ F22 (per-repo config)
 └→ F35 (backlog catalog import — banco como fonte de verdade)

F15 (event system) ✅
 ├→ F06 (log streaming)
 ├→ F12 (pause/resume) ✅
 ├→ F14 (budget caps) ✅
 └→ F19 (notifications v2)

F05 (layout multi-panel)
 ├→ F06 (log streaming)
 ├→ F07 (status bar)
 ├→ F08 (session nav)
 ├→ F09 (command palette) ✅
 ├→ F13 (execution graph)
 ├→ F16 (cost dashboard) ✅
 ├→ F24 (task & stage progress)
 └→ F29 (tui shell polish) ✅

F07 (status bar)
 └→ F16 (cost dashboard) ✅

F24 (task & stage progress)
 └→ F30 (token/context telemetry) ✅

F28 (task context blocks)
 └→ F30 (token/context telemetry) ✅

F09 (command palette) ✅
 ├→ F24 (task & stage progress)
 ├→ F29 (tui shell polish) ✅
 └→ F31 (dashboard kanban overview) ✅

F31 (dashboard kanban overview) ✅
 └→ F32 (web mode) ✅

F32 (web mode) ✅
 ├→ F34 (web run detail & control polish) ✅
 └→ F50 (web v2 redesign) ✅
      └→ F51 (web auth hardening) ✅
           └→ H22 (LAN/mDNS/Tailscale guard fix) ✅

F27 (stage sessions telegram) ✅
 ├→ F30 (token/context telemetry) ✅
 ├→ F41 (adaptive session reuse) ✅
 │    └→ F49 (question-answer session continuity) — pendente
 └→ F47 (telegram interactive questions) ✅
      └→ H19 (specify questions misrouted) ✅ (dependencia bloqueante)

F19 (notifications v2)
 └→ F47 (telegram interactive questions) ✅

F02 (skill registry)
 └→ F46 (custom prompt/skill per step) ✅

F34 (web run detail) ✅
 └→ F38 (live output visual hierarchy) ✅ → H13 (estender p/ TUI + auto-scroll, pendente)

F40 (workflow step view per project) — pendente
 └→ F49 (question-answer session continuity) — pendente

Independentes:
 F10 (theme) ✅, F11 (retry) ✅, F17 (analytics) ✅, F18 (duration) ✅,
 F20 (plugins), F21 (wizard), F23 (config gen), F27 (stage sessions) ✅,
 F26 (resume pipeline) ✅, F25 (msq-develop hardening) ✅, F33 (production
 hardening) ✅, F37 (remove override pontual) ✅, F39 (adapter fallback +
 resume no step) ✅
```

---

## Backlog de feedback (triagem 2026-07-11 / 2026-07-12)

Triagem de um lote de feedback de uso real, separado em novas funcionalidades
e melhorias/bugs. Desde a triagem original, F41, F45, F46, F47, F50 e F51
saíram de "Pendente — triagem" e foram entregues (ver secoes acima). Os itens
abaixo continuam pendentes; os docs linkados descrevem o relato do usuario e
o escopo provavel, mas ainda precisam de investigacao de codigo antes de virar
trabalho executavel (ver "Proximo passo" em cada doc).

### Novas funcionalidades

| Item | Area | Status | Prioridade sugerida |
|------|------|--------|----------------------|
| [F40 — Visualizacao por Step + Workflow por Projeto](features/F40-workflow-step-view-per-project.md) | Stages / Workflow | Pendente — triagem | Alta |
| [F41 — Reaproveitamento Adaptativo de Sessao entre Steps](features/F41-adaptive-session-reuse.md) | Controle de sessao | Entregue | Alta |
| [F42 — Tela de Detalhe de Runs / Analytics](features/F42-runs-analytics-detail-screen.md) | Analytics | Pendente — triagem | Media |
| [F43 — Editar Tool/Effort por Step + Resume com Outro Agente (UI)](features/F43-per-step-config-and-resume-agent-switch.md) | Configuracoes | Pendente — triagem | Media |
| [F44 — Central de Configuracoes do Projeto (multi-projeto/multi-repo)](features/F44-project-settings-hub.md) | Projeto / Configuracoes | Pendente — triagem | Alta |
| [F45 — Piloto Automatico](features/F45-piloto-automatico.md) | Modo Automatico | Entregue | Alta |
| [F46 — Prompt/Skill Customizado por Step](features/F46-custom-prompt-per-step.md) | Skills | Entregue | Media |
| [F47 — Perguntas Interativas via Telegram (Botoes)](features/F47-telegram-interactive-questions.md) | Notificacoes | Entregue | Alta |
| [F48 — Card de Demanda Enriquecido](features/F48-enhanced-feature-card.md) | Tela principal | Pendente — triagem | Media |
| [F49 — Continuidade de Sessao ao Responder Pergunta da IA](features/F49-question-answer-session-continuity.md) | Controle de sessao | Pendente — depende de F40 | Alta |
| [F50 — Web v2 Redesign (React/JSX, multi-pagina)](features/F50-web-v2-redesign.md) | Web | Entregue | Alta |
| [F51 — Web auth hardening (cookie session + password login + origin guard)](features/F51-web-auth-hardening.md) | Web | Entregue | Alta |

### Melhorias / Bugs

| Item | Area | Status | Prioridade sugerida |
|------|------|--------|----------------------|
| [H13 — Live Output / Tool Execution: hierarquia visual e auto scroll (TUI + Web)](hotfixes/H13-tui-live-output-visual-hierarchy.md) | Tela de detalhe / Live Output | Pendente — web feito via F38, falta TUI + auto-scroll | Media |
| [H14 — Etapa atual nao fica visivel](hotfixes/H14-current-stage-not-visible.md) | Stages | Pendente — triagem | Alta |
| [H15 — Contagem de tokens confusa e aparentemente errada](hotfixes/H15-token-accounting-confusion-and-bug.md) | Controle de sessao | Pendente — triagem | Alta |
| [H16 — Gate continua aparecendo apos avancado](hotfixes/H16-gate-persists-after-resolved.md) | Gates | Pendente — triagem | Alta |
| [H17 — Toast nao some depois de aparecer](hotfixes/H17-toast-not-dismissing.md) | UI | Pendente — triagem | Baixa |
| [H18 — Mapeamento de tasks incorreto (duplicada/fora de ordem/nao carrega)](hotfixes/H18-task-mapping-incorrect.md) | Tasks | Pendente — triagem | Critica |
| [H19 — Perguntas do specify tratadas como aprovacao + Telegram truncado](hotfixes/H19-specify-questions-misrouted-as-approve.md) | Specify / Telegram | Resolvido | Critica |
| [H20 — checkbox de autoAdvance ignorado em run no meio da execucao](hotfixes/H20-autoadvance-checkbox-ignored-mid-run.md) | Automacao | Resolvido | Alta |
| [H21 — coercao de boolean da CLI derrota autoAdvance do catalogo](hotfixes/H21-autoadvance-cli-boolean-coercion-defeats-catalog.md) | Automacao | Resolvido | Alta |
| [H22 — guard de Host/Origin do `msq web` bloqueava LAN/mDNS/Tailscale MagicDNS](hotfixes/H22-web-host-guard-blocks-lan-access.md) | Web | Resolvido | Alta |

**Sugestao de ordem de ataque**: H18 primeiro (risco de corromper o mapeamento
de tasks), depois H15/H16 (confiabilidade de dados exibidos), depois H14 e o
restante dos bugs pequenos (H13/H17), e por fim as novas funcionalidades ainda
pendentes — F44 e F40 sao as maiores em escopo e provavelmente merecem quebra
em sub-itens antes de entrar em execucao. F49 fica bloqueada ate F40 avancar.
