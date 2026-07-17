# Feature Specification: DefaultsTab editável

**Feature Branch**: `feat/set17-defaults-tab-editavel`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M4 (Projeto editável — defaults no DB)
**Origem no plano**: S16 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`tool`, `model`, `effort`, `thinking`, `skills`, `stageSkills`, `workflow`
> (mode/stages/autoAdvance/approvals.channel), `syncTasksToBacklog`, `maxTokens` editáveis →
> `action:updateProjectDefaults`."

Fecha o M4 na UI: a `DefaultsTab` da página Settings passa a editar os defaults do projeto, que
persistem no DB (SET-14/15/16) e afetam a resolução de features sem override.

## User Scenarios & Testing

### User Story 1 — Editar defaults do projeto pela web
Como administrador do projeto, quero editar os defaults (tool/model/effort/thinking/skills/
workflow/etc.) numa aba, para que features sem override herdem esses valores.

**Fluxo**: abre Settings → Defaults → edita `effort` → salva → dispara
`action:updateProjectDefaults` → persiste → features sem override passam a herdar o novo valor.

**Aceite**: editar defaults do projeto persiste no DB e afeta a resolução de features.

### Edge Cases
- Campo não suportado pela tool (thinking) segue o padrão ignore-with-warning (relaciona SET-25).
- Patch parcial não apaga defaults não tocados.
- `workflow.stages` editado no default é herdado por features novas (relaciona SET-37/SET-41).

## Requirements

### Functional Requirements
- **FR-001**: A `DefaultsTab` DEVE editar `tool`, `model`, `effort`, `thinking`, `skills`,
  `stageSkills`, `workflow` (mode/stages/autoAdvance/approvals.channel), `syncTasksToBacklog` e
  `maxTokens`.
- **FR-002**: O save DEVE disparar `action:updateProjectDefaults` com patch parcial.
- **FR-003**: A edição DEVE persistir no DB e afetar a resolução de features sem override.
- **FR-004**: A UI DEVE reutilizar os primitivos de SET-01.

### Key Entities
- **DefaultsTab**: aba de defaults do projeto na página Settings.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Mudar o `effort` default e salvar faz uma feature sem override herdar o novo valor
  (UI focada + `tests/backlog/load-prompt.test.ts`).
- **SC-002**: Patch parcial não apaga defaults não tocados.

## Dependencies & Open Decisions
- **Depende de**: SET-01, SET-15, SET-16.
- **Relaciona**: SET-25 (thinking/ignore-with-warning), SET-37/SET-41 (defaults como fonte única).

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/pages/ConfigPage.tsx` (`DefaultsTab`).
- **Validação**: UI focada + `rtk npx vitest run tests/backlog/load-prompt.test.ts`.
