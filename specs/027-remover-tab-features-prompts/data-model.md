# Data Model: Remover tab "Features & Prompts" do Config

Esta feature não introduz nem altera entidades persistidas.

## Entidades afetadas

- `ConfigPage`: entidade de apresentação que seleciona e renderiza uma sub-tab.
  Seu conjunto de tabs passa a conter apenas `runtime`, `defaults`, `skills`,
  `notifications` e `budget`.
- `FeatureConfigDetail`: componente compartilhado de apresentação/edição. Não
  sofre alteração; continua sendo o ponto de edição no card de detalhe.

## Persistência e transições

Não há campos novos, validações de dados, relacionamentos, migrações ou
transições de estado persistido. A seleção de tab continua sendo estado local da
UI, inicializado em `runtime`; o estado `features` deixa de ser uma opção válida
porque a tab correspondente é removida.
