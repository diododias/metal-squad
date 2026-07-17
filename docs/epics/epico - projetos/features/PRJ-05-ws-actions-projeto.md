# Feature Specification: WS create/update de Project

**Feature Branch**: `feat/prj05-ws-project-create-update`
**Created**: 2026-07-17
**Status**: Ready for planning
**Roadmap**: Projetos — M2
**Depende de**: PRJ-03, PRJ-03B

## Objetivo

Expor criação e edição de Project pela web sem replicar regra de negócio: as ações
WS delegam ao mesmo application service da CLI (PRJ-03B) e devolvem um resultado
tipado ao cliente originador, além de reconciliar o estado empurrado.

## Contexto de execução

A web é **state-push, não REST**. O cliente envia mensagens do union
`WebSocketClientMessage` (`src/web/types.ts:210`) e o servidor despacha em
`handleClientMessage(message, client, featureCwd)` (`src/web/server.ts:701`) por
um `switch (message.type)`.

O padrão de resposta ao **cliente originador** já existe em
`action:updateFeatureConfig` (`src/web/server.ts:712-724`): o handler chama o
service, monta um payload `{ ok, … }` e faz `sendTo(client, result)`; em sucesso
chama `reconcileWebState(featureCwd)`, que termina em
`broadcast({ type: 'state:full', payload: latestState })`
(`src/web/server.ts:372` / `:411`). `broadcast` só atinge sockets
`client.authenticated` (`:278`). Sockets não autenticados são fechados
(`:662-663`).

O que **não** existe hoje e nasce aqui:

- O union servidor `WebSocketServerMessage` (`src/web/types.ts:249`) só tem
  `{ type: 'error'; payload: { message } }` (`:257`). Falta uma resposta tipada
  por requisição — introduzir `action:result { requestId, ok, entity?, error? }`.
- `MsqWebState` (`src/web/types.ts:77`) **não** tem `projects[]` nem `revision`.
  A projeção completa de `projects[]` no state é de **PRJ-07 (M3)**; este item
  entrega a ação, a resposta tipada e o gatilho de reconcile, incrementando a
  `revision` do state quando ela for introduzida.

Validação de payload é **runtime**, com schema Zod discriminado por `type` (mesma
disciplina Zod já usada no backlog); `as` do TypeScript não conta como validação.
O handler delega a `projectService.create/update` (PRJ-03B → `createProject` /
`updateProject(…, expectedRevision)` de PRJ-03, que já sinalizam
`REVISION_CONFLICT` e `PROJECT_NOT_FOUND`).

## Contrato WS

```
// cliente → servidor (WebSocketClientMessage)
action:createProject { requestId, name, description? }
action:updateProject { requestId, projectId, expectedRevision, patch: { name?, description?, position? } }

// servidor → cliente originador (WebSocketServerMessage, novo)
action:result { requestId, ok, entity?, error?: { code, message } }
```

## Requirements

- Adicionar `action:createProject` e `action:updateProject` ao union cliente, com
  `requestId`, e `action:result` ao union servidor.
- Validar o payload em runtime com schema discriminado; cast de TS não conta.
- Delegar aos mesmos application services usados pela CLI (PRJ-03B).
- `update` recebe `expectedRevision` e um patch allowlisted (nome, descrição, posição).
- Responder ao cliente originador com `action:result { requestId, ok, entity?, error? }`.
- Após sucesso, reconciliar e publicar o estado (incrementando `revision` quando existir).
- Não incluir archive/delete; pertencem a PRJ-17.
- Erro não vira apenas notificação global nem vaza detalhe interno de persistência.

## Arquivos afetados

- `src/web/types.ts` — `action:createProject`/`action:updateProject` no union cliente;
  `action:result` no union servidor.
- `src/web/server.ts` — dois `case` em `handleClientMessage` delegando ao service,
  `sendTo(client, result)` e `reconcileWebState`.
- `src/web/schemas.ts` (novo ou existente) — schema Zod discriminado das ações.
- `tests/web/…` — sucesso, payload inválido, conflito de revisão e resposta ao originador.

## Success Criteria

- Payload inválido não toca o DB e retorna código estável via `action:result`.
- Create/update via WS produzem o mesmo resultado do CLI/service (PRJ-03B).
- Dois updates com a mesma `expectedRevision` detectam concorrência (`REVISION_CONFLICT`).
- Testes autenticados cobrem sucesso, validação, autorização e conflito.
