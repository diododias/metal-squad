# Feature Specification: Render "Environment / Sources"

**Feature Branch**: `feat/set13-render-environment-sources`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M3 ("Resolved sources" enriquecido)
**Origem no plano**: S12 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "Novos `Row` para database (+origem/gravável), data dir, config dir (+gravável), repo (+repoId),
> catalog = 'DB (importado via backlog load)', web `host:port/auth`, secrets `configured/empty`,
> versão. Renomear card p/ 'Environment / Sources'." (design §3.13)

Renderiza no `RuntimeTab` os dados coletados em SET-12. Read-only: o objetivo é diagnóstico —
mostrar de onde vem cada configuração e o estado do ambiente, sem nunca exibir valor de segredo.

## User Scenarios & Testing

### User Story 1 — Diagnosticar o ambiente pela UI
Como usuário, quero abrir Settings → Runtime e ver o caminho do banco, se é override, se é
gravável, data dir, config dir, repo/repoId, versão e quais segredos estão configurados, para
diagnosticar o ambiente sem ler variáveis de ambiente à mão.

**Fluxo**: abre Settings → Runtime → a seção "Environment / Sources" lista os `Row` com os
valores vindos do state (SET-12).

**Aceite**: a seção mostra o caminho do banco e o ambiente; segredos aparecem só como
`configured`/`empty`, nunca o valor.

### Edge Cases
- Segredo ausente → `empty`; presente → `configured` (sem o valor).
- `databaseSource = override` sinalizado visualmente (ex.: badge).
- Banco/config não gravável exibido como não-gravável.

## Requirements

### Functional Requirements
- **FR-001**: O `RuntimeTab` DEVE renderizar `Row` para: database (+origem/gravável), data dir,
  config dir (+gravável), repo (+repoId), catalog (`DB (importado via backlog load)`), web
  (`host:port/auth`), secrets (`configured/empty`) e versão.
- **FR-002**: O card DEVE ser renomeado para "Environment / Sources".
- **FR-003**: Segredos DEVEM aparecer só como `configured`/`empty`, nunca o valor.
- **FR-004**: A seção é read-only (sem edição neste marco).

### Key Entities
- **RuntimeTab**: aba de runtime da página Settings.
- **Environment / Sources card**: bloco de diagnóstico.

## Success Criteria

### Measurable Outcomes
- **SC-001**: A seção mostra o caminho do `app.db`, origem, writability, repo/repoId e versão (UI focada).
- **SC-002**: Nenhum valor de segredo aparece — só `configured`/`empty`.

## Dependencies & Open Decisions
- **Depende de**: SET-12.

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/pages/ConfigPage.tsx` (`RuntimeTab`).
- **Validação**: UI focada.
