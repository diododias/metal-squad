# Data Model: Remover visão "by workflow stage"

Esta feature é uma remoção de código de UI — não introduz, altera nem remove nenhuma entidade
persistida (SQLite) ou contrato de API. Não há novo estado de domínio.

## Entidades afetadas (estado local de componente, não persistido)

### BoardPage (estado de componente React)

Estado removido:

- `viewMode: 'status' | 'workflow-stage'` (ou equivalente) — REMOVIDO. Nenhum substituto.

Estado mantido (sem alteração de forma ou comportamento):

- Estado que já monta o board por status (`viewMode === 'status'` hoje) — passa a ser o único
  caminho de renderização, sem branch condicional em torno dele.

### Column (interface local do arquivo)

Sem alteração de forma — continua representando uma coluna do board por status
(TODO/IN PROGRESS/DONE/FALHA). A única mudança é que `Column[]` deixa de poder ser derivado de
`WORKFLOW_STAGES`; passa a ter uma única fonte (as 4 colunas de status).

## Constantes removidas

- `WORKFLOW_STAGES` — constante hardcoded com a lista de stages de workflow usada apenas pelo
  branch `else` (visão by stage). Removida sem substituto, conforme FR-004 e Assumptions da
  spec (steps por feature ficam fora de escopo — SET-08/SET-09).

## Validação de estado

Não há regra de transição de estado nova. A única invariante é negativa: nenhuma referência
remanescente a `viewMode` ou `WORKFLOW_STAGES` em `BoardPage.tsx` ou em qualquer outro arquivo
do repositório (FR-006, SC-003).
