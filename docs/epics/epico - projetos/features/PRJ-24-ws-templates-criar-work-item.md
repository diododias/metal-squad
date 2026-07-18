# Feature Specification: WS/state de templates e snapshot na criação de Work Item

**Feature Branch**: `feat/prj24-work-item-templates-ws`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M5
**Depende de**: PRJ-07, PRJ-14, PRJ-23

## Objetivo

Ligar o modelo de templates (PRJ-23) ao fluxo de criação de Work Item: estender
`action:createWorkItem` com `type`, resolver o template no servidor e
**materializar o snapshot** (workflow + stageSkills + `templateId`/`templateVersion`)
no ato da criação, além de expor as ações WS de gestão de templates. Editar o
template depois **não** reescreve itens já criados.

## Contexto de execução

`action:createWorkItem` nasce em PRJ-14 (handler novo em `handleClientMessage`,
`src/web/server.ts:701`, com validação de repo∈Project e reserva de ID). Esta
feature **estende** essa ação com `type` e insere a resolução de template
(`resolveTemplate(projectId, type, repoId)`, PRJ-23) antes do insert, gravando o
snapshot nas colunas/`data_json` do Work Item.

Snapshot é imutável por design (SPEC §11.2 e ROADMAP §Workflow templates): o Work
Item grava `definition_json` snapshot + `templateId` + `templateVersion`; um
update posterior do template incrementa `version` mas **não** toca o `data_json`
já persistido. Isso é o inverso do comportamento de reconciliação do YAML — aqui
o que vale é o snapshot no momento da criação.

Estado (WS push): `MsqWebState` (PRJ-07) leva apenas **summaries e mappings** de
template — a `definition` completa é pesada e é carregada **sob demanda** (mesmo
princípio de custo por tick de `collectSkillsCatalog`, `src/web/state.ts:247`, e
da regra "não colocar specs/transcripts completos em state:full").

Validação antes de criar: erro de skill ausente no repo alvo
(`createSkillRegistry().validate`, `src/core/skills/registry.ts:140`) ou template
inválido é retornado **antes** de criar o Work Item — nada de run/insert órfão.
Todas as ações carregam `requestId` + `revision`; arquivar template mapeado é
bloqueado até reassociação (PRJ-23).

Compatibilidade de nomes: request/response/eventos usam `workItemId`; o adapter
interno pode traduzir para `feature_id` enquanto durar a persistência legada
(ROADMAP §Compatibilidade).

## Contrato WS

```
action:createWorkItem { requestId, epicId, repoId, type, title, description?, dependsOn? }
  → resolve template (Project,type,repoId) → snapshot → insert → { workItem, revision }

action:createWorkflowTemplate  { requestId, projectId, name, definition }
action:updateWorkflowTemplate  { requestId, templateId, patch, expectedRevision }  // ++version
action:duplicateWorkflowTemplate { requestId, templateId, name }
action:archiveWorkflowTemplate { requestId, templateId }        // bloqueado se mapeado
action:setTypeTemplate         { requestId, projectId, type, templateId }
action:changeWorkItemType      { requestId, workItemId, type, expectedRevision }
  // pristine: preview + confirmação, novo snapshot atômico; com histórico: recusado
```

Persistir no Work Item: `type`, `workflow` snapshot, `stageSkills` snapshot,
`templateId`, `templateVersion`, origem.

## Requirements

- Estender `action:createWorkItem` com `type`; o servidor resolve o template usando Project, tipo e Repository alvo.
- Persistir no Work Item: `type`, workflow snapshot, stageSkills snapshot, `templateId`, `templateVersion` e origem.
- Ações com `requestId` e `revision`: create, update, duplicate e archive template, além de set Project/type mapping.
- Template editado incrementa version; Work Items existentes permanecem byte a byte iguais.
- Alterar o tipo de Work Item pristine exige preview e confirmação, aplicando o novo snapshot atomicamente. Com histórico, a alteração é recusada.
- `MsqWebState` leva apenas summaries e mappings; a definition completa é carregada sob demanda.
- Erros de skill ou template são retornados antes de criar o Work Item.
- Arquivar template mapeado é bloqueado até reassociação.
- Request, response e eventos públicos usam `workItemId`; o adapter interno pode traduzir para `feature_id` enquanto durar a compatibilidade de persistência.

## Arquivos afetados

- `src/web/types.ts` — estender `action:createWorkItem` com `type`; novas ações de
  template (`createWorkflowTemplate`/`update`/`duplicate`/`archive`/`setTypeTemplate`/
  `changeWorkItemType`) no union (`:210-248`).
- `src/web/server.ts` — `case` de `createWorkItem` (PRJ-14) chama `resolveTemplate`
  e grava snapshot; novos `case`s de template em `handleClientMessage` (`:701`).
- `src/web/state.ts` — `buildMsqWebState` (`:261`) projeta summaries/mappings; loader
  sob demanda da definition completa.
- `src/db/workflowTemplates.ts` / `repo.ts` — reuso de `resolveTemplate` (PRJ-23).
- `tests/web/*` — `requestId`, runtime validation, revision, mapping, snapshot,
  nomes canônicos.

## Success Criteria

- Work Items `bug` e `feature` recebem snapshots distintos e auditáveis.
- Update do template afeta somente criações posteriores.
- State não cresce com todas as definitions completas.
- Testes WS cobrem `requestId`, runtime validation, revision, mapping, snapshot e nomes canônicos do contrato.
