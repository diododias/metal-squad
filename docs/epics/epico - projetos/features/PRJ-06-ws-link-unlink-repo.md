# Feature Specification: WS link/move/unlink Repository

**Feature Branch**: `feat/prj06-ws-repository-links`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M2
**Depende de**: PRJ-03, PRJ-03B, PRJ-05

## Objetivo

Vincular, transferir e desvincular repos de um Project pela web, com saneamento de
path na fronteira e transferência atômica, reusando os services de vínculo de
PRJ-03 sem reimplementar regra no handler.

## Contexto de execução

Mesmo pipeline WS de PRJ-05: mensagens do union `WebSocketClientMessage`
(`src/web/types.ts:210`), despacho em `handleClientMessage` (`src/web/server.ts:701`),
resposta ao originador via `sendTo` + `action:result`, e reconcile via
`reconcileWebState` → `broadcast('state:full')` (`src/web/server.ts:372`/`:411`).

**Identidade e registro de repo.** `resolveRepo(cwd)` (`src/core/repo.ts:12`)
retorna `{ repoId, path }` com `repo_id = sha1(origin remoto || path)[:12]`;
`registerRepo` grava o repo (`src/db/repo.ts:23`). Para link **por path**, a
fronteira deve canonicalizar com `realpath`, confirmar que existe e é diretório,
validar contra uma **allowlist configurável** e exigir confirmação explícita antes
de registrar. Não registrar “com aviso”: path inexistente, symlink para fora da
allowlist ou diretório não autorizado é **recusado**.

**Services de vínculo (de PRJ-03).** `linkRepo`, `moveRepo`, `unlinkRepo` já
encapsulam as regras: `linkRepo` nunca sobrescreve vínculo existente
(`REPO_ALREADY_LINKED`); `moveRepo` é atômico e preserva o snapshot `project_id`
das runs históricas; `unlink`/`move` respeitam `REPO_IN_USE`, checando Work Items
em `backlog_features.repo_id` (`src/db/index.ts:328`). A PK `project_repos.repo_id`
garante “um repo → no máximo 1 Project”.

**Exposição de path no state.** Paths de repo são sensíveis; seguir a disciplina
já aplicada a credenciais em `MsqWebState.runtimeConfig` (`src/web/types.ts:77`,
comentário sobre não vazar bearer credentials): o state expõe health/label do
vínculo, não o path absoluto para clientes não autenticados.

## Contrato WS

```
action:linkRepo   { requestId, projectId, repoId? , path?, confirm? }
action:moveRepo   { requestId, repoId, toProjectId, expectedRevision? }
action:unlinkRepo { requestId, projectId, repoId }
// resposta: action:result { requestId, ok, entity?, error?: { code, message } }
```

## Requirements

- Ações `action:linkRepo`, `action:moveRepo`, `action:unlinkRepo`, todas com
  `requestId` e resposta tipada via `action:result`.
- Por `repoId`, exigir repo já registrado. Por `path`, aplicar `realpath`,
  confirmar existência/diretório, validar allowlist e pedir confirmação explícita
  antes do registro (`resolveRepo` + `registerRepo`).
- Path inexistente, symlink fora da allowlist ou diretório não autorizado é
  recusado; não registrar “com aviso”.
- `moveRepo` usa o service transacional e preserva os snapshots históricos.
- `linkRepo` não substitui vínculo existente; `unlink`/`move` respeitam `REPO_IN_USE`.
- State expõe health do vínculo sem revelar paths a clientes não autenticados.
- Toda operação gera audit event (via service de PRJ-03).

## Arquivos afetados

- `src/web/types.ts` — três ações no union cliente (reuso de `action:result`).
- `src/web/server.ts` — três `case` em `handleClientMessage` delegando ao service.
- `src/web/schemas.ts` — schema Zod discriminado das três ações.
- `src/core/repo.ts` — helper de saneamento de path (realpath + allowlist) para link por path.
- `src/db/repo.ts` — reuso de `linkRepo`/`moveRepo`/`unlinkRepo` de PRJ-03.
- `tests/web/…` e `tests/core/repo.test.ts` — link por id/path, path inseguro, move concorrente.

## Success Criteria

- Repo válido pode ser vinculado por ID e por path canonicalizado.
- Path inseguro é recusado **antes** de escrever em `repos`.
- Move concorrente tem resultado determinístico (um vencedor, erro tipado ao outro).
- Falha de domínio aparece no cliente correto, sem broadcast de dados sensíveis.
