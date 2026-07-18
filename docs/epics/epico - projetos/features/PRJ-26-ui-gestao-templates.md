# Feature Specification: UI de gestão de Workflow Templates

**Feature Branch**: `feat/prj26-workflow-templates-ui`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M5
**Depende de**: PRJ-23, PRJ-24, PRJ-25

## Objetivo

Entregar a tela de **gestão de Workflow Templates** dentro do Project: builtins
read-only duplicáveis, CRUD lógico de templates custom, mapeamento
`feature|bug → template` e validação por repo (matriz repo×skill) antes de
salvar/mapear. Reusa os primitivos de edição de workflow já existentes, adaptados
ao contrato `definition.workflow + definition.stageSkills` (PRJ-23).

## Contexto de execução

Os primitivos de edição de workflow **já existem** por feature em
`FeatureConfigDetail` (`src/web/client/components/FeatureConfigDetail.tsx:97`):
edição de `stages` com draft e reordenação (`draftStages`, `:106`; remoção com
`pendingRemovedStage`, `:109`), `mode` e demais campos via `EditableSelectField`/
`EditableTextField`/`EditableToggleField` (`:3-5`), e o `workflowDraftFrom`
(`:39`) que monta o draft a partir de `feature.workflow`. Esta feature **extrai/
adapta** esses primitivos para operar sobre `WorkflowTemplateDefinition`
(`workflow` + `stageSkills`, PRJ-23) em vez de sobre uma feature — sem reinventar
o editor de stages.

Ações e dados: as ações WS de template (create/update/duplicate/archive/
setTypeTemplate) nascem em PRJ-24; o state leva só summaries/mappings e a
`definition` completa é carregada sob demanda (PRJ-24). A UI vive no
detalhe/Settings do Project (`ProjectDetailPage`, PRJ-12).

Validação por repo: antes de salvar/mapear, o template é validado contra **todos os
repos ativos do Project** via `createSkillRegistry().validate(names, cwd)`
(`src/core/skills/registry.ts:140`) por repo alvo — a UI mostra uma **matriz
repo×skill** identificando exatamente qual skill falta em qual repo (nunca erro
genérico). Builtins (`builtin:feature-spec-kit`, `builtin:bug-standard`, PRJ-23)
aparecem read-only e só podem ser duplicados para customização.

Concorrência e versão: update mostra versão atual, diff e o efeito "somente novos
Work Items" (o snapshot dos existentes é imutável, PRJ-24). Ações usam
`requestId`/`expectedRevision`; conflito preserva o draft. Arquivar template
mapeado é bloqueado, oferecendo reassociação explícita (PRJ-23).

## Modelo técnico

- `WorkflowTemplatesSection` no `ProjectDetailPage`/Settings do Project:
  lista (builtins read-only + custom), CRUD, mapping `feature|bug`.
- Editor reusando primitivos de `FeatureConfigDetail` (`:97`) adaptados a
  `definition.workflow` + `definition.stageSkills`.
- Painel de validação: matriz repo×skill (verde/vermelho por repo ativo).
- Diff de update + selo "afeta apenas novas criações".

## Requirements

- Gestão dentro do detalhe/Settings do Project; builtins aparecem read-only e podem ser duplicados.
- CRUD lógico de templates custom: nome, workflow, stageSkills, guidance, session policy e mode.
- Reusar primitivos atuais de edição de workflow, adaptados ao contrato `definition.workflow + definition.stageSkills`.
- Mapear feature/bug para template e mostrar fallback builtin quando não há override.
- Antes de salvar/mapear, validar template contra todos os repos ativos do Project e mostrar matriz repo×skill.
- Update mostra versão atual, diff e efeito "somente novos Work Items".
- Archive mapeado é bloqueado e oferece reassociação explícita.
- Ações usam requestId/revision e preservam draft em conflito.

## Arquivos afetados

- `src/web/client/pages/ProjectDetailPage.tsx` / `WorkflowTemplatesSection.tsx` (novo)
  — lista, CRUD, mapping, matriz de validação.
- `src/web/client/components/FeatureConfigDetail.tsx` — extrair/adaptar primitivos
  de edição de stages/mode (`:97-109`) para o editor de template.
- `src/web/client/components/core/*` — `EditableSelectField`/`TextField`/`ToggleField`.
- `src/web/types.ts` — ações de template (PRJ-24).
- `src/core/skills/registry.ts` — `validate` por repo ativo (`:140`).
- `tests/web/*` — CRUD lógico, mapping, fallback, diff/version, matriz de skills.

## Success Criteria

- Duplicar builtin, editar e mapear a bug altera apenas novas criações.
- Template inválido em um repo é claramente identificado; não há erro genérico.
- Concorrência de edição não perde mudanças silenciosamente.
- Testes cobrem CRUD lógico, mapping, fallback, diff/version e matriz de skills.
