# Feature Specification: WS `action:resumeWithOverride`

**Feature Branch**: `feat/set18-ws-resume-with-override`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M5 (Resume com troca de tool no web)
**Origem no plano**: S17 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Action `{ pipelineId, featureId, tool?, model?, effort? }` → `executeBacklog` com
> `resumeOverride` (espelhar `src/commands/resume.ts`); validar `getAdapter(tool).isAvailable()`;
> `ui:notice` se indisponível, sem criar run." (design §3.10(b))

O CLI já retoma com troca de tool (`msq resume --tool`). Esta feature expõe o mesmo no web como
uma action WS que monta o override e chama a execução, sem alterar o backlog.

## User Scenarios & Testing

### User Story 1 — Retomar pela web com override de tool
Como cliente web, quero enviar `action:resumeWithOverride` para retomar uma pipeline com outra
tool/model/effort, sem editar o backlog.

**Fluxo**: cliente envia `{ pipelineId, featureId, tool?, model?, effort? }` → o servidor valida
`getAdapter(tool).isAvailable()` → se disponível, chama `executeBacklog` com `resumeOverride` →
cria run nova; se indisponível, retorna `ui:notice` sem criar run.

**Aceite**: retomada com tool disponível cria run com override; tool indisponível é bloqueada;
backlog **inalterado**.

### Edge Cases
- Tool indisponível → `ui:notice`, nenhuma run criada.
- `pipelineId`/`featureId` inválidos → erro acionável.
- Override vazio (sem tool/model/effort) → retoma com a config original.

## Requirements

### Functional Requirements
- **FR-001**: DEVE existir a action `resumeWithOverride` com `{ pipelineId, featureId, tool?,
  model?, effort? }`.
- **FR-002**: O handler DEVE validar `getAdapter(tool).isAvailable()` antes de executar.
- **FR-003**: Tool disponível → `executeBacklog` com `resumeOverride`, criando run; tool
  indisponível → `ui:notice`, sem run.
- **FR-004**: O backlog NÃO DEVE ser alterado pela retomada com override.
- **FR-005**: A lógica DEVE espelhar `src/commands/resume.ts` (sem duplicar regra divergente).

### Key Entities
- **resumeOverride**: override efêmero de execução (não persiste no backlog).

## Success Criteria

### Measurable Outcomes
- **SC-001**: Retomada com tool disponível cria run com override (unit do handler).
- **SC-002**: Tool indisponível é bloqueada sem criar run.
- **SC-003**: Backlog permanece inalterado após a retomada.

## Dependencies & Open Decisions
- **Depende de**: —.
- **Habilita**: SET-19 (RunDetail), SET-20 (ApprovalBanner).

## Technical Notes (do plano)
- **Arquivos**: `src/web/types.ts`, `src/web/server.ts`.
- **Validação**: unit do handler (monta override; bloqueia indisponível).
