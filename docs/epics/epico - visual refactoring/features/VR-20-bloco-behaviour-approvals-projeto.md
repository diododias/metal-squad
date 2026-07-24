# Feature Specification: Bloco Behaviour + Approvals Channel migra para o Projeto

**Feature Branch**: `feat/vr20-bloco-behaviour-approvals-projeto`
**Created**: 2026-07-24
**Status**: Draft
**Roadmap**: Visual Refactoring — M5 (Tema E)
**Depende de**: VR-19

## Objetivo

Criar o bloco **Behaviour** do Work Item — `Auto Advance` (visível **só quando
mode = staged**) e `Auto Start`, com o papel de cada um explícito — e mover
**Approvals Channel** do Work Item para a configuração do Projeto.

## Contexto de execução

- `components/FeatureConfigDetail.tsx` já tem os campos: `autoStart` no draft de
  execução (`:35`), e no draft de workflow `mode` (`:41`), `approvalChannel`
  (`:43`, `feature.workflow.approvals.channel`) e `autoAdvance` (`:44`). O
  `sameWorkflow` compara `mode`/`approvalChannel`/`autoAdvance` (`:49-52`).
- Hoje `autoAdvance` **não** é condicionado a `mode`; o `plan.md` pede exibi-lo
  só em `mode = staged`.
- `approvalChannel` está no nível do workflow do Work Item; o `plan.md` (e o
  épico Settings, `SET-40` canal plugável) apontam para configuração no Projeto.
  `ConfigPage`/`ProjectDefaults` já carregam `approvalChannel` nos defaults
  (`ConfigPage.tsx:203`).

O que **falta**: (1) montar o bloco Behaviour com `autoAdvance` condicional a
`mode==='staged'` e `autoStart`, com labels/tooltips (liga com VR-30); (2) tirar
`approvalChannel` do Work Item e passar a herdá-lo do Projeto (Repository
defaults / project config).

## Modelo técnico

- Bloco `BehaviourBlock` em `FeatureConfigDetail`: `autoStart` (movido de
  execução) + `autoAdvance` renderizado só quando `draftWorkflow.mode ===
  'staged'`. Rótulos claros (VR-30).
- Approvals: remover o campo `approvalChannel` do editor do Work Item; o valor
  efetivo passa a vir da config do Projeto (herança Work Item → Repository
  defaults, conforme `repo-context.md`). Ajustar `sameWorkflow`/patch para não
  enviar `approvalChannel` do item.

## Requirements

- Bloco "Behaviour" contém `Auto Advance` (só em `mode = staged`) e `Auto Start`.
- Approvals Channel deixa de ser editável no Work Item e passa a vir do Projeto.
- O papel de cada toggle é explícito na UI.

## Arquivos afetados

- `src/web/client/components/FeatureConfigDetail.tsx`,
  `pages/BacklogItemDetail.tsx`.
- Config do Projeto (herança de `approvalChannel`): `ConfigPage.tsx`/project
  defaults; coordenar com o épico Settings (`SET-40`).
- `tests/web/` — auto advance condicional; ausência de approvals no item.

## Success Criteria

- **SC-001**: `Auto Advance` só aparece quando `mode = staged`.
- **SC-002**: o Work Item não edita mais Approvals Channel; o valor vem do
  Projeto.
- **SC-003**: `Auto Start`/`Auto Advance` têm rótulos que explicam seu papel.
