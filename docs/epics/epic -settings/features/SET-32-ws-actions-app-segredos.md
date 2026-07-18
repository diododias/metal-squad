# Feature Specification: WS actions App + segredos

**Feature Branch**: `feat/set32-ws-actions-app-segredos`
**Created**: 2026-07-14
**Status**: Draft
**Roadmap**: Settings — M8 (App editável + segredos write-only)
**Origem no plano**: S31 (`metal-squad-novos-settings-plano-implementacao.md`)

## Input

> "`AppConfigPatch`, `SecretPatch` + actions `updateAppConfig`, `setSecret`/`clearSecret`;
> segredos write-only no keychain; exigir sessão autenticada p/ sensíveis (segredos,
> `web.auth/host/port`)." (design §3.3–3.6)

Expõe a escrita do App (SET-31) pelo WebSocket, incluindo o tratamento write-only de segredos: o
segredo vai para o keychain e nunca retorna na leitura. Operações sensíveis exigem sessão
autenticada.

## User Scenarios & Testing

### User Story 1 — Editar App e gravar segredo pela web
Como cliente autenticado, quero enviar `updateAppConfig` e `setSecret`/`clearSecret`, para
configurar o App e credenciais pela UI sem expor valores.

**Fluxo**: cliente autenticado envia `setSecret` → o segredo vai para o keychain (write-only) → a
leitura devolve só `configured`; `updateAppConfig` aplica `AppConfigPatch` via `saveAppConfigPatch`.

**Aceite**: segredo é gravado no keychain e nunca retorna na leitura.

### Edge Cases
- Sessão não autenticada em action sensível → rejeitada.
- `clearSecret` remove a credencial e volta a `empty`.
- Patch sensível (`web.auth/host/port`) exige autenticação.

## Requirements

### Functional Requirements
- **FR-001**: DEVEM existir os tipos `AppConfigPatch` e `SecretPatch` e as actions
  `updateAppConfig`, `setSecret` e `clearSecret`.
- **FR-002**: Segredos DEVEM ser write-only no keychain — nunca retornam na leitura.
- **FR-003**: Actions sensíveis (segredos, `web.auth/host/port`) DEVEM exigir sessão autenticada.
- **FR-004**: `updateAppConfig` DEVE usar `saveAppConfigPatch` (merge/validação de SET-31).

### Key Entities
- **AppConfigPatch / SecretPatch**: contratos das actions.
- **Keychain**: destino write-only dos segredos.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Segredo gravado no keychain nunca retorna na leitura (unit do handler; checar sanitização).
- **SC-002**: Action sensível sem autenticação é rejeitada.

## Dependencies & Open Decisions
- **Depende de**: SET-31.

## Technical Notes (do plano)
- **Arquivos**: `src/web/types.ts`, `src/web/server.ts`, `src/security/secrets.ts`.
- **Validação**: unit do handler; checar sanitização.
