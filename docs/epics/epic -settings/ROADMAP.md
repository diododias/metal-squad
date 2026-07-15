# Épico Settings — Roadmap

> Ciclo de trabalho derivado de `cowork/metal-squad-novos-settings-plano-implementacao.md`
> (do estado atual ao modelo-alvo de `metal-squad-novos-settings.md`, Partes 1–3).
> Cada item `SET-nn` é uma **spec Spec-Kit** em `features/`, dimensionada para **uma run de IA**,
> com aceite validável. Os IDs `SET-nn` espelham os `Snn` do plano (rastreabilidade direta).
> Atualizado em 2026-07-14.

---

## Como usar este roadmap

- **Feature (`SET-nn`)** = unidade de implementação/PR, com spec própria em `features/SET-nn-*.md`.
- **Marco (`Mn`)** = agrupamento entregável com um **critério de validação de marco** ao final.
- **Rastreabilidade**: cada `SET-nn` mapeia 1:1 para o `Snn` do plano de implementação. `SET-10b` = `S10b`.
- **AI-friendly**: cada spec é pequena e com aceite objetivo. Preferir uma branch por feature.
- **Regras do repo** (valem para toda feature): branch a partir de `develop` (sem worktree, sem
  commit direto em `develop`), skill `/dev-flow`, PR para `develop`. Validação por feature que
  toca `src/`: `rtk npm run build && rtk npm test && rtk npm run typecheck` (+ `rtk npm run lint`
  em TS relevante).

### Grafo de marcos

```
M1 → M2 → M3        (regressões de front + diagnóstico — backend já pronto)
M5                  (resume com tool no web — independente)
M4                  (Projeto editável — usa padrão do M1)
M6 → M7 → M8        (execução real → registro de tools → App editável)
M9                  (consolidação/limpeza/docs)
```

Caminho crítico do refactor: **M6 → M7 → M8 → M9**. As regressões de front (M1–M3) e o
resume (M5) **não** dependem do refactor de backend (M6–M8) e podem andar em paralelo.

---

## M1 — Restaurar edição de Feature (regressão)

Backend pronto (`FeatureConfigPatch` + `updateCatalogFeature`). Recupera o que o remodel
derrubou (design §3.9, §3.11). Só front.

- [SET-01 — Primitivos de edição reutilizáveis](features/SET-01-primitivos-edicao-reutilizaveis.md)
- [SET-02 — Card "Execução" editável](features/SET-02-card-execucao-editavel.md)
- [SET-03 — Card "Workflow" editável](features/SET-03-card-workflow-editavel.md)
- [SET-04 — Steps: adicionar step + skill guia](features/SET-04-steps-adicionar-step.md)
- [SET-05 — Steps: remover step com limpeza](features/SET-05-steps-remover-step-limpeza.md)
- [SET-06 — Steps: reordenar (desejável)](features/SET-06-steps-reordenar.md)

**✅ Validação M1:** por um card de backlog e um de execução, editar tool/model/effort/workflow/steps
de uma feature e ver persistir no DB e refletir no board/detalhe.

---

## M2 — Board por workflow de feature + limpeza do Config

Design §3.12 e ponto 1 (§3.5). Só front.

- [SET-07 — Remover visão "by workflow stage"](features/SET-07-remover-visao-by-workflow-stage.md)
- [SET-08 — KanbanCard exibe steps](features/SET-08-kanbancard-exibe-steps.md)
- [SET-09 — BoardPage passa `stages` aos cards](features/SET-09-boardpage-passa-stages.md)
- [SET-10 — Remover tab "Features & Prompts" do Config](features/SET-10-remover-tab-features-prompts.md)
- [SET-10b — Renomear "Config" → "Settings"](features/SET-10b-renomear-config-para-settings.md)

**✅ Validação M2:** um item de bug com `[reproduce, fix, verify]` e uma feature com
`[specify, plan, tasks, implement, validate]` convivem no board por status, cada card com seus
steps; Config sem tab de features.

---

## M3 — "Resolved sources" enriquecido (diagnóstico)

Design §3.13. Read-only.

- [SET-12 — Coletor de ambiente no backend/state](features/SET-12-coletor-ambiente-state.md)
- [SET-13 — Render "Environment / Sources"](features/SET-13-render-environment-sources.md)

**✅ Validação M3:** abrir Settings → Runtime e ver o caminho do `app.db`, se é override, se é
gravável, repo/repoId e versão.

---

## M4 — Projeto editável (defaults no DB)

Design §3.2/§3.5. Persistência em `backlog_catalog_meta`.

- [SET-14 — `updateCatalogDefaults` (db)](features/SET-14-update-catalog-defaults-db.md)
- [SET-15 — WS `action:updateProjectDefaults`](features/SET-15-ws-update-project-defaults.md)
- [SET-16 — state expõe `projectDefaults` editável](features/SET-16-state-project-defaults-editavel.md)
- [SET-17 — DefaultsTab editável](features/SET-17-defaults-tab-editavel.md)

**✅ Validação M4:** mudar o `effort` default do projeto pela web e ver uma feature sem override
herdar o novo valor.

---

## M5 — Resume com troca de tool no web

Design §3.10(b). CLI (`msq resume --tool`) já existe; expor no web.

- [SET-18 — WS `action:resumeWithOverride`](features/SET-18-ws-resume-with-override.md)
- [SET-19 — Botão "retomar com outra tool" (RunDetail)](features/SET-19-botao-retomar-outra-tool.md)
- [SET-20 — "Aprovar e continuar com tool X" (ApprovalBanner)](features/SET-20-aprovar-continuar-tool.md)

**✅ Validação M5:** pausar uma pipeline no meio, retomar pelo web escolhendo outra tool,
confirmar run nova e backlog inalterado.

---

## M6 — `model`/`effort`/`thinking` reais por adapter

Parte 2 §B. Mudança central de execução.

- [SET-21 — schema: campo `thinking`](features/SET-21-schema-campo-thinking.md)
- [SET-22 — adapter claude: coexistir model+effort+thinking](features/SET-22-adapter-claude-coexistir.md)
- [SET-23 — adapter codex: effort nativo, thinking=false](features/SET-23-adapter-codex-effort-nativo.md)
- [SET-24 — adapter opencode: limpar hardcodes](features/SET-24-adapter-opencode-limpar-hardcodes.md)
- [SET-25 — UI thinking + ignore-with-warning](features/SET-25-ui-thinking-ignore-with-warning.md)

**✅ Validação M6:** rodar (harness externo) uma feature no claude com model+effort+thinking e
confirmar `MAX_THINKING_TOKENS`; codex com effort nativo; opencode sem `--thinking`.

---

## M7 — Registro de tools no App

Parte 2 §A. `tool` vira referência a `id` registrado.

- [SET-26 — schema `tools[]` no App](features/SET-26-schema-tools-no-app.md)
- [SET-27 — spawn resolve do registro](features/SET-27-spawn-resolve-do-registro.md)
- [SET-28 — `tool` = referência a id](features/SET-28-tool-referencia-a-id.md)
- [SET-29 — capabilities/thinkingBudget/minTimeoutMs migram p/ registro](features/SET-29-capabilities-migram-para-registro.md)
- [SET-30 — TabTools (CRUD) + selects por id](features/SET-30-tab-tools-crud.md)

**✅ Validação M7:** registrar `codex-canary` apontando p/ binário custom, selecioná-lo numa
feature e ver o spawn usar o `command` correto.

---

## M8 — App editável + segredos write-only

Design §3.3–3.6.

- [SET-31 — `saveAppConfigPatch` + writability](features/SET-31-save-app-config-patch.md)
- [SET-32 — WS actions App + segredos](features/SET-32-ws-actions-app-segredos.md)
- [SET-33 — state: `configured` + `writability`](features/SET-33-state-configured-writability.md)
- [SET-34 — RuntimeTab editável (App)](features/SET-34-runtime-tab-editavel.md)
- [SET-35 — NotificationsTab editável (App)](features/SET-35-notifications-tab-editavel.md)
- [SET-36 — BudgetTab editável (App)](features/SET-36-budget-tab-editavel.md)

**✅ Validação M8:** editar `concurrency` e a porta do web pela UI e ver `config.json` atualizado;
cadastrar um webhook e confirmar que só `configured` volta ao cliente.

---

## M9 — Consolidação, limpeza e docs

Parte 2 §C/D/E/F/G/H/I/J. Pode virar 2–3 PRs.

- [SET-37 — Defaults no Projeto; YAML como asset](features/SET-37-defaults-no-projeto-yaml-asset.md)
- [SET-38 — `autoAdvance` unificado](features/SET-38-autoadvance-unificado.md)
- [SET-39 — App enxuto + migração](features/SET-39-app-enxuto-migracao.md)
- [SET-40 — Canal de aprovação plugável](features/SET-40-canal-aprovacao-plugavel.md)
- [SET-41 — Herança única Feature→Projeto](features/SET-41-heranca-unica-feature-projeto.md)
- [SET-42 — Hardcodes → config](features/SET-42-hardcodes-para-config.md)
- [SET-43 — Docs/README alinhados ao schema](features/SET-43-docs-readme-alinhados.md)
- [SET-44 — Regressão end-to-end dos settings](features/SET-44-regressao-e2e-settings.md)

**✅ Validação M9:** `msq config show --feature <id> --json` mostra a resolução final coerente
(um dono por config, herança única, YAML só import).

---

## Checklist transversal (toda feature)

- Branch a partir de `develop`; sem worktree; sem commit direto em `develop`; skill `/dev-flow`.
- `rtk npm run build && rtk npm test && rtk npm run typecheck` (+ `lint` em TS de `src/`).
- `git status` limpo antes/depois; PR para `develop` com o template `.claude/skills/dev-flow/pr-template.md`.
- Escritas de DB guardadas por `assertWritableDbPath()`; escrita de `config.json` com merge sobre `loadConfig()`.
- Segredos nunca cruzam o WebSocket na leitura (só `configured`).
- Tocou comportamento observável → atualizar doc de feature/hotfix.

## Resumo de contagem

- **9 marcos**, **44 features** (`SET-01`–`SET-44`, incluindo `SET-10b`).
- Regressões de front (M1–M3) e resume (M5) não dependem do refactor de backend (M6–M8).
- Caminho crítico do refactor: **M6 → M7 → M8 → M9**.
