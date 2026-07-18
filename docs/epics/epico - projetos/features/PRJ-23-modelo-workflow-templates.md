# Feature Specification: Modelo versionado de Workflow Templates

**Feature Branch**: `feat/prj23-workflow-templates-model`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M5
**Depende de**: PRJ-03, PRJ-22

## Objetivo

Promover o workflow default hoje hardcoded a **templates nomeados, versionados e
persistidos**, com defaults builtin por tipo (`feature`/`bug`) e um mapa
`tipo → template` por Project. Entrega o **modelo e a resolução** determinística;
a materialização do snapshot na criação do Work Item é PRJ-24 e a UI de gestão é
PRJ-26.

## Contexto de execução

O workflow default hoje é **constante hardcoded**: `DEFAULT_PROJECT_TEMPLATE`
(`src/core/workflow/stageSkills.ts:2-11`) declara `stages: ['specify','plan',
'tasks','implement','validate']` e o mapa `stageSkills` por stage (specify →
`speckit-specify`, implement → `speckit-implement`+`dev-flow`, validate →
`review`). `collectEffectiveStageSkills` (`:13`) mescla defaults com overrides.

Ponto crítico de contrato: **`WorkflowSchema` não contém `stageSkills`**. O shape
(`src/core/backlog/schema.ts:77-86`, `WorkflowSchemaShape`) tem `mode`, `stages`,
`stepGuidance`, `approvals`, `sessionPolicy` — e `stageSkills` vive **separado**,
em `DefaultsSchema.stageSkills` (`schema.ts:139`) e em
`DEFAULT_PROJECT_TEMPLATE.stageSkills`. Por isso `WorkflowTemplateDefinition`
precisa combinar os dois (`workflow` + `stageSkills`), como abaixo.

Persistência nova segue os padrões de PRJ-01: `CREATE TABLE IF NOT EXISTS` em
`migrate()` (`src/db/index.ts`), UUID v4 opaco como `template_id`, `revision`, e
seed idempotente para builtins. Queries/services na camada de `src/db/`
(PRJ-03), sem SQL em handler. Validação de skills usa
`createSkillRegistry().validate(names, cwd)` (`src/core/skills/registry.ts:140`)
contra o **repo alvo**, não o cwd do servidor.

Precedência da resolução: mapping do Project → builtin do type. **Não** existe
fallback de App nem de Repository defaults (ROADMAP §Herança). O Work Item herda
Repository defaults para execução, mas o **template** vem do Project.

## Contrato

`WorkflowSchema` não contém `stageSkills`; portanto `WorkflowTemplateDefinition`
é um contrato próprio:

```ts
type WorkflowTemplateDefinition = {
  workflow: Workflow;                       // WorkflowSchema (schema.ts:88)
  stageSkills: Record<string, string[]>;    // separado, como em DefaultsSchema (:139)
};
```

## Persistência

```sql
CREATE TABLE workflow_templates (
  template_id     TEXT PRIMARY KEY,
  scope_project_id TEXT REFERENCES projects(project_id),
  name            TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  builtin         INTEGER NOT NULL DEFAULT 0,
  archived_at     TEXT,
  revision        INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE project_work_item_templates (
  project_id   TEXT NOT NULL REFERENCES projects(project_id),
  work_item_type TEXT NOT NULL,
  template_id  TEXT NOT NULL REFERENCES workflow_templates(template_id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, work_item_type),
  CHECK (work_item_type IN ('feature','bug'))
);
```

## Defaults

- `builtin:feature-spec-kit`: stages atuais e stageSkills atuais
  (= `DEFAULT_PROJECT_TEMPLATE`, `stageSkills.ts:2-11`, sem regressão).
- `builtin:bug-standard`: `reproduce → fix → verify`, usando nova skill builtin
  `bug-reproduce`, `dev-flow` em fix e `review` em verify.
- Builtins são seed idempotente e imutáveis; usuário duplica para customizar.

## Requirements

- `resolveTemplate(projectId,type,repoId)` retorna definição, templateId, version e origem.
- Precedência: mapping do Project → builtin do type. Não existe fallback de App nem de Repository defaults.
- Template custom pertence a um Project; compartilhamento global editável fica fora de escopo.
- Update incrementa version/revision; snapshots antigos não mudam.
- Validação cobre stages únicas/não vazias, guidance/session refs, skills existentes no repo alvo e modo suportado.
- Template mapeado não pode ser arquivado antes de reassociação.
- Auditoria registra create/update/duplicate/archive/map.

## Arquivos afetados

- `src/db/index.ts` — `migrate()`: `workflow_templates`, `project_work_item_templates`
  (padrão `CREATE TABLE IF NOT EXISTS`); seed idempotente de builtins.
- `src/db/repo.ts` (ou novo `src/db/workflowTemplates.ts`) — CRUD lógico,
  `resolveTemplate(projectId,type,repoId)`, mapping e auditoria (PRJ-03).
- `src/core/workflow/stageSkills.ts` — `DEFAULT_PROJECT_TEMPLATE` (`:2`) vira a
  base do builtin `feature-spec-kit`; novo builtin `bug-standard`.
- `src/core/backlog/schema.ts` — `WorkflowTemplateDefinition`; reuso de
  `WorkflowSchema` (`:88`).
- `src/core/skills/registry.ts` — `validate(names, cwd)` (`:140`) por repo alvo.
- `tests/db/*`, `tests/workflow/*` — seed 2×, versionamento, mapping, validação
  por repo, concorrência.

## Success Criteria

- Resolução é determinística e informa origem.
- Builtins reproduzem feature atual e bug padrão sem skill ausente.
- Update de template não altera definition_json armazenado em Work Item existente.
- Testes cobrem seed 2×, versionamento, mapping, validação por repo e concorrência.
