# Quickstart: KanbanCard exibe steps da feature

## Pré-requisitos

- Node.js `>=20.17`, dependências instaladas (`npm install` já rodado no repo).
- Nenhum banco/adapter real necessário — esta feature é puramente de componente React
  (`renderToStaticMarkup`), sem tocar `src/db`, `src/core/orchestrator` ou adapters.

## Rodar a suite focada

```bash
rtk npx vitest run tests/web/kanban-card.test.tsx
```

Se o `WorkflowStepper` ganhar um teste dedicado para `size`/`allPending`, inclua o arquivo
correspondente (ex.: `tests/web/workflow-stepper.test.tsx`, se vier a existir) na mesma chamada.

## Baseline completa (mudança em `src/`)

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

## Cenários de validação (derivados das Acceptance Scenarios do spec)

1. **Sequência com step atual destacado**
   - Render `KanbanCard` com `run.stages = ["plan", "implement", "review"]`, `run.stage = "implement"`,
     `run.status` != `'done'`/`'todo'`.
   - Esperado: `plan` marcado `done`, `implement` marcado `current`, `review` marcado `next`.

2. **Status DONE força tudo concluído**
   - Mesmo `stages`, `run.status = 'done'`, `run.stage` qualquer (inclusive divergente da lista).
   - Esperado: todos os steps renderizam como `done`.

3. **Status TODO força tudo pendente**
   - Mesmo `stages`, `run.status = 'todo'`.
   - Esperado: todos os steps renderizam como `next`/pendente.

4. **Sem `stages` (ausente ou vazio)**
   - `run.stages` `undefined` ou `[]`.
   - Esperado: nenhuma exceção; nenhuma seção de steps renderizada.

5. **`stage` não encontrado em `stages`**
   - `run.stages = ["plan", "implement"]`, `run.stage = "unknown"`.
   - Esperado: nenhum step marcado `current`; sem erro.

6. **Lista longa (8+ stages)**
   - `run.stages` com 8+ itens, render dentro da largura padrão de coluna do board.
   - Esperado: quebra de linha controlada (sem novo CSS de overflow), sem estourar o card
     (validação visual manual via `msq web`, já que `renderToStaticMarkup` não mede layout).

## Validação visual manual (opcional, quando o board estiver acessível)

```bash
msq web
```

Abrir o board, localizar um card com `stages` populado (dependente de dado real vindo de uma feature
subsequente — SET-09) e conferir visualmente a sequência compacta dentro da coluna.
