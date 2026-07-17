# Features — Épico Settings

Specs no formato Spec-Kit derivadas do plano de implementação
`cowork/metal-squad-novos-settings-plano-implementacao.md`. Cada `SET-nn` mapeia 1:1 para o
`Snn` do plano e é dimensionada para uma run de IA. Ver o agrupamento por marco e os critérios
de validação em [`../ROADMAP.md`](../ROADMAP.md).

## M1 — Restaurar edição de Feature
- [SET-01 — Primitivos de edição reutilizáveis](SET-01-primitivos-edicao-reutilizaveis.md)
- [SET-02 — Card "Execução" editável](SET-02-card-execucao-editavel.md)
- [SET-03 — Card "Workflow" editável](SET-03-card-workflow-editavel.md)
- [SET-04 — Steps: adicionar step + skill guia](SET-04-steps-adicionar-step.md)
- [SET-05 — Steps: remover step com limpeza](SET-05-steps-remover-step-limpeza.md)
- [SET-06 — Steps: reordenar](SET-06-steps-reordenar.md)

## M2 — Board por workflow + limpeza do Config
- [SET-07 — Remover visão "by workflow stage"](SET-07-remover-visao-by-workflow-stage.md)
- [SET-08 — KanbanCard exibe steps](SET-08-kanbancard-exibe-steps.md)
- [SET-09 — BoardPage passa `stages` aos cards](SET-09-boardpage-passa-stages.md)
- [SET-10 — Remover tab "Features & Prompts"](SET-10-remover-tab-features-prompts.md)
- [SET-10b — Renomear "Config" → "Settings"](SET-10b-renomear-config-para-settings.md)

## M3 — "Resolved sources" enriquecido
- [SET-12 — Coletor de ambiente no backend/state](SET-12-coletor-ambiente-state.md)
- [SET-13 — Render "Environment / Sources"](SET-13-render-environment-sources.md)

## M4 — Projeto editável (defaults no DB)
- [SET-14 — `updateCatalogDefaults` (db)](SET-14-update-catalog-defaults-db.md)
- [SET-15 — WS `action:updateProjectDefaults`](SET-15-ws-update-project-defaults.md)
- [SET-16 — state expõe `projectDefaults` editável](SET-16-state-project-defaults-editavel.md)
- [SET-17 — DefaultsTab editável](SET-17-defaults-tab-editavel.md)

## M5 — Resume com troca de tool no web
- [SET-18 — WS `action:resumeWithOverride`](SET-18-ws-resume-with-override.md)
- [SET-19 — Botão "retomar com outra tool" (RunDetail)](SET-19-botao-retomar-outra-tool.md)
- [SET-20 — "Aprovar e continuar com tool X" (ApprovalBanner)](SET-20-aprovar-continuar-tool.md)

## M6 — `model`/`effort`/`thinking` reais por adapter
- [SET-21 — schema: campo `thinking`](SET-21-schema-campo-thinking.md)
- [SET-22 — adapter claude: coexistir model+effort+thinking](SET-22-adapter-claude-coexistir.md)
- [SET-23 — adapter codex: effort nativo, thinking=false](SET-23-adapter-codex-effort-nativo.md)
- [SET-24 — adapter opencode: limpar hardcodes](SET-24-adapter-opencode-limpar-hardcodes.md)
- [SET-25 — UI thinking + ignore-with-warning](SET-25-ui-thinking-ignore-with-warning.md)

## M7 — Registro de tools no App
- [SET-26 — schema `tools[]` no App](SET-26-schema-tools-no-app.md)
- [SET-27 — spawn resolve do registro](SET-27-spawn-resolve-do-registro.md)
- [SET-28 — `tool` = referência a id](SET-28-tool-referencia-a-id.md)
- [SET-29 — capabilities/thinkingBudget/minTimeoutMs migram p/ registro](SET-29-capabilities-migram-para-registro.md)
- [SET-30 — TabTools (CRUD) + selects por id](SET-30-tab-tools-crud.md)

## M8 — App editável + segredos write-only
- [SET-31 — `saveAppConfigPatch` + writability](SET-31-save-app-config-patch.md)
- [SET-32 — WS actions App + segredos](SET-32-ws-actions-app-segredos.md)
- [SET-33 — state: `configured` + `writability`](SET-33-state-configured-writability.md)
- [SET-34 — RuntimeTab editável (App)](SET-34-runtime-tab-editavel.md)
- [SET-35 — NotificationsTab editável (App)](SET-35-notifications-tab-editavel.md)
- [SET-36 — BudgetTab editável (App)](SET-36-budget-tab-editavel.md)

## M9 — Consolidação, limpeza e docs
- [SET-37 — Defaults no Projeto; YAML como asset](SET-37-defaults-no-projeto-yaml-asset.md)
- [SET-38 — `autoAdvance` unificado](SET-38-autoadvance-unificado.md)
- [SET-39 — App enxuto + migração](SET-39-app-enxuto-migracao.md)
- [SET-40 — Canal de aprovação plugável](SET-40-canal-aprovacao-plugavel.md)
- [SET-41 — Herança única Feature→Projeto](SET-41-heranca-unica-feature-projeto.md)
- [SET-42 — Hardcodes → config](SET-42-hardcodes-para-config.md)
- [SET-43 — Docs/README alinhados ao schema](SET-43-docs-readme-alinhados.md)
- [SET-44 — Regressão end-to-end dos settings](SET-44-regressao-e2e-settings.md)

---

> Os IDs `SET-nn` são organização documental deste épico; `SET-10b` preserva o `S10b` do plano.
> O caminho crítico é `M6 → M7 → M8 → M9`; M1–M3 e M5 podem andar em paralelo.
