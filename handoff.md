# Handoff

## Contexto

Usuario reportou que, apos o primeiro stage da `feat-08`, ele aprovou a continuidade mas nada mais aconteceu.

Diagnostico confirmado:

- O processo `msq` nao estava mais rodando.
- O banco global `~/.local/share/metal-squad/app.db` ficou com a pipeline `1` ainda em `running`.
- O `stage_request` de aprovacao do stage `specify` continuou `pending`.
- A TUI/visao principal estava enganosa porque o `run` do stage aparecia como `done`, mesmo com a pipeline ainda nao concluida.

## O que foi alterado no codigo

Arquivos modificados:

- `.specify/feature.json`
- `src/commands/status.ts`
- `src/core/runner/execute.ts`
- `src/db/repo.ts`
- `src/ui/App.tsx`
- `src/ui/components/MainPanel.tsx`
- `src/ui/components/RunTable.tsx`
- `src/ui/components/Sidebar.tsx`
- `src/ui/components/StatusBar.tsx`
- `src/ui/format.ts`
- `src/ui/hooks/useRuns.ts`
- `tests/commands/commands.test.ts`
- `tests/runner/execute.test.ts`

Resumo das mudancas:

- A TUI agora separa `rawStatus` do stage-run do status efetivo da pipeline.
- A TUI passou a exibir melhor `stage atual`, `awaiting approval`, `awaiting input` e contexto de pipeline.
- `msq status` agora mostra uma secao `Pipelines ativas/pendentes` com stage atual e pendencia de approval/input.
- Foi implementado resume por stage para staged workflows.
- O resume agora consegue avancar para o proximo stage quando a aprovacao do stage anterior ja foi persistida.
- Inputs humanos resolvidos por `stage_requests` passam a ser carregados de volta no resume.

## Validacao feita

Build:

```bash
rtk npm run build
```

Testes executados com sucesso:

```bash
rtk npx vitest run tests/runner/execute.test.ts tests/commands/commands.test.ts tests/ui/hooks.test.ts tests/ui/app.test.ts
```

Resultado:

- `4` arquivos de teste passaram
- `35` testes passaram

## Estado atual do banco

Nenhuma alteracao no banco foi aplicada ainda. O usuario interrompeu antes dessa etapa.

Estado atual confirmado em `~/.local/share/metal-squad/app.db`:

Pipeline `1`:

```text
1|c23e66ae4cb5|feat-08|running|specify|["feat-08"]|[]|[]|["feat-08"]|[]|0/1 done · active feat-08
```

Stage requests da pipeline `1`:

```text
1|1|1|feat-08|specify|approval|pending||Advance to stage plan?|2026-07-07 10:30:19|
```

Interpretacao:

- `specify` terminou com sucesso.
- A aprovacao para ir a `plan` existe logicamente, mas nao foi persistida.
- Como o processo morreu, precisa haver ajuste direto no banco para tornar a pipeline retomavel.

## Proximo passo esperado

O pedido do usuario foi:

- ajustar diretamente o banco da `feat-08`
- continuar os proximos stages de onde parou

Como o codigo de resume por stage ja foi implementado e validado, o proximo agente deve:

1. Resolver o `stage_request` `1` com `response = 'advance'`.
2. Marcar a pipeline `1` como `paused` e `current_stage = 'specify'` ou `current_stage = 'plan'`.
3. Manter `active_json = ["feat-08"]` para que `resumePipeline()` reconstrua `pending`.
4. Rodar o resume.

## SQL sugerido

Sugestao segura:

```sql
BEGIN;
UPDATE stage_requests
SET status = 'resolved',
    response = 'advance',
    resolved_at = datetime('now')
WHERE id = 1
  AND status = 'pending';

UPDATE pipelines
SET status = 'paused',
    current_stage = 'specify',
    updated_at = datetime('now'),
    ended_at = NULL
WHERE id = 1;
COMMIT;
```

Observacao:

- Mantive `current_stage = 'specify'` porque o novo resume por stage interpreta `approval resolved + advance` como sinal para comecar em `plan`.
- Se preferir, `current_stage = 'plan'` tambem deve funcionar com o codigo novo, mas `specify` deixa mais claro o checkpoint de origem.

## Comandos sugeridos apos o SQL

Dentro do repo:

```bash
rtk node dist/index.js status --limit 20
rtk node dist/index.js resume 1
```

Depois, validar se:

- foi criado um novo `run` para `stage = plan`
- a pipeline deixou de parecer concluida prematuramente na TUI/status
- o fluxo segue para `implement` e `validate` conforme a configuracao da `feat-08`

## Observacoes de risco

- Antes desta sessao, `resume` por pipeline em staged workflow reexecutava `specify`; isso foi corrigido no codigo atual.
- O banco usado pelo run observado foi o global `~/.local/share/metal-squad/app.db`, nao `./.metal-squad/app.db`.
- Ha worktree sujo no repo. Nao houve commit.
