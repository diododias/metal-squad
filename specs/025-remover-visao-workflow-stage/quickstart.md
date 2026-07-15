# Quickstart: Validar remoção da visão "by workflow stage"

## Pré-requisitos

- Node.js `>=20.17`
- Dependências instaladas (`npm install`, se ainda não feito)
- Branch de trabalho a partir de `develop` (ver `.claude/rules/git-workflow.md`)

## Setup

```bash
rtk npm run build
```

## Validação automatizada (obrigatória)

```bash
rtk npx vitest run tests/web/board-page.test.tsx
rtk npm test
rtk npm run typecheck
rtk npm run lint
```

Resultado esperado:

- `tests/web/board-page.test.tsx` (novo, criado na Fase de implementação) prova que `BoardPage`
  renderiza exatamente as colunas TODO/IN PROGRESS/DONE/FALHA e que nenhum controle de toggle de
  visão está presente no retorno do componente — cobre SC-001.
- `rtk npm run typecheck` passa sem erro relacionado a `viewMode` ou `WORKFLOW_STAGES` — cobre
  SC-002.

## Validação de ausência de referências (SC-003)

```bash
grep -rn "viewMode\|WORKFLOW_STAGES" --include="*.ts" --include="*.tsx" src tests
```

Resultado esperado: nenhuma ocorrência.

## Validação visual opcional (não substitui os testes acima)

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js web
```

Abrir o dashboard web, navegar até o board e confirmar visualmente:

- Colunas exibidas: TODO, IN PROGRESS, DONE, FALHA, nessa ordem.
- Nenhum controle de alternância "status vs workflow stage" na tela.

Não usar este passo live como substituto da suite automatizada — apenas como confirmação
adicional, conforme `.claude/rules/harness.md`.
