# Feature Specification: Card "Execução" editável

**Feature Branch**: `feat/set02-card-execucao-editavel`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M1 (Restaurar edição de Feature)
**Origem no plano**: S02 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`tool` (select claude|codex|opencode), `model`, `effort`, `maxTokens`, `autoStart` editáveis +
> botão *save* → `onSaveConfig(patch)` no `FeatureConfigDetail.tsx`."

O backend de edição de feature já existe (`FeatureConfigPatch` + `updateCatalogFeature`). Falta
religar a UI: o card "Execução" do detalhe de feature precisa voltar a ser editável, agora usando
os primitivos de SET-01, persistindo via patch parcial sem apagar campos não tocados.

## User Scenarios & Testing

### User Story 1 — Editar parâmetros de execução de uma feature
Como usuário, quero editar `tool`, `model`, `effort`, `maxTokens` e `autoStart` de uma feature
direto no card "Execução" e salvar, para ajustar a execução sem editar o `backlog.yaml`.

**Fluxo**: abre o detalhe da feature → altera `effort` no `EditableSelect` → clica *save* →
`onSaveConfig(patch)` envia só os campos alterados → `updateCatalogFeature` persiste em
`backlog_features.data_json` → o state reflete o novo valor.

**Aceite**: editar e salvar persiste no DB e reflete no state; campos não incluídos no patch
permanecem intactos (merge parcial, não overwrite).

### Edge Cases
- Salvar sem nenhuma mudança não deve gerar patch nem escrita.
- `tool` inexistente/indisponível deve ser barrado (alinha com o registro de tools, M7).
- `maxTokens` inválido (negativo/não numérico) é rejeitado com mensagem acionável.

## Requirements

### Functional Requirements
- **FR-001**: O card "Execução" em `FeatureConfigDetail.tsx` DEVE permitir editar `tool`
  (select), `model`, `effort`, `maxTokens` e `autoStart`.
- **FR-002**: O *save* DEVE emitir `onSaveConfig(patch)` contendo **apenas** os campos alterados.
- **FR-003**: A persistência DEVE usar `updateCatalogFeature`, gravando em
  `backlog_features.data_json` e preservando campos não tocados.
- **FR-004**: A UI DEVE reutilizar os primitivos de SET-01 (sem reimplementar controle/estado).
- **FR-005**: Após salvar, o state DEVE refletir o novo valor sem restart nem reload manual.

### Key Entities
- **FeatureConfigPatch**: patch parcial já existente no backend.
- **Card Execução**: seção do `FeatureConfigDetail` que edita os campos de execução.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Editar `effort` e salvar altera `data_json` da feature no DB (teste de repo).
- **SC-002**: Um patch que só toca `effort` não altera `model`/`maxTokens`/`autoStart`.
- **SC-003**: O board/detalhe mostra o valor novo imediatamente após salvar.

## Dependencies & Open Decisions
- **Depende de**: SET-01.
- **Nota**: o select de `tool` ainda usa o enum atual; migra para ids do registro em M7 (SET-30).

## Technical Notes (do plano)
- **Arquivos**: `src/web/client/components/FeatureConfigDetail.tsx`.
- **Validação**: UI focada + `rtk npx vitest run tests/db/repo.test.ts`.
