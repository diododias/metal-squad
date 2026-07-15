# F52 — Registro de Features com ID Gerado Automaticamente

## Implementation status

The batch registration boundary now ignores every source feature ID and always
generates a new canonical `F-<8>` value from the fixed alphabet and publishes
it to the SQLite catalog. `backlog.yaml` is an input queue: features are
removed only after catalog publication succeeds. Epic IDs remain unchanged.
YAML consumption is staged with a recoverable backup around the catalog
transaction. A catalog conflict or publication failure restores the source
YAML and rolls back ID rekeying and catalog writes. Catalog rows remain
available after their source entries are consumed.

**Epic**: V1 — Marco 1 (Fundação + Quick Wins)

**Prioridade**: P1

**Esforço**: high

**Depende de**: nenhuma

**Spec detalhada**: [specs/017-feature-id-generation/spec.md](../../specs/017-feature-id-generation/spec.md)

## Problema

Features ainda usam IDs livres, normalmente `feat-N`, definidos manualmente no
backlog. Isso permite colisões entre projetos, torna a identidade sensível à
manutenção do YAML e faz o board gerar um `F-XXXXXXXX` derivado por hash em vez
de exibir um identificador persistido.

O contrato atual aceita qualquer string em `FeatureSchema.id`
([src/core/backlog/schema.ts:100-116](../../src/core/backlog/schema.ts#L100-L116)).
O catálogo usa o ID como chave de upsert
([src/db/backlogCatalog.ts:226-240](../../src/db/backlogCatalog.ts#L226-L240)),
enquanto o carregamento do runtime reconstrói as features a partir do catálogo
([src/core/backlog/load.ts:168-205](../../src/core/backlog/load.ts#L168-L205)).
No board, `KanbanCard` ainda chama `toShortFeatureId` para renderizar um hash
determinístico
([src/web/client/components/data/KanbanCard.tsx:6-15](../../src/web/client/components/data/KanbanCard.tsx#L6-L15)
e [src/web/client/components/data/KanbanCard.tsx:65-69](../../src/web/client/components/data/KanbanCard.tsx#L65-L69)).

## Objetivo

Fazer com que toda feature carregada receba um novo ID persistente no formato
`F-<8>`, único globalmente, usado pelo catálogo, runs, notificações e board.
Qualquer ID escrito na fonte é descartado. O cadastro batch consome o item do
`backlog.yaml` somente depois de uma publicação bem-sucedida.

Esta execução começa em `plan`: o stage `specify` foi concluído na spec
detalhada e não deve ser disparado novamente para esta feature.

## Solução

### Geração e validação

- Criar uma única regra de geração aleatória de `F-` + oito caracteres do
  alfabeto definido na spec detalhada.
- Verificar o candidato contra os IDs já registrados antes da confirmação.
- Ignorar IDs fornecidos no YAML, inclusive duplicados ou malformados.
- Garantir que dependências, histórico e notificações comparem IDs como valores
  opacos, sem depender do prefixo ou do formato.

### Persistência e concorrência

- Atribuir um novo ID a cada feature presente no carregamento.
- Rekeyear as referências existentes do catálogo para o ID gerado quando a
  entrada já estiver registrada no banco.
- Remover a entrada do YAML dentro da mesma fronteira de commit; falhas devem
  restaurar o YAML e o catálogo ao estado anterior.
- Manter itens já consumidos no catálogo mesmo quando não aparecem na próxima
  carga da fila.

### Board web

- Exibir o ID gerado e persistido recebido pela feature.

## Escopo técnico

- `src/core/backlog/schema.ts`: contrato e validação do ID de `Feature`; não
  alterar `EpicSchema.id`.
- `src/core/backlog/load.ts`: geração durante o carregamento, consumo da fila e
  validação de referências do backlog.
- `src/db/backlogCatalog.ts`: unicidade, persistência e operação atômica do
  catálogo.
- `src/core/orchestrator/graph.ts`: preservar resolução independente do
  formato do ID; a implementação atual usa o ID apenas como chave opaca
  ([src/core/orchestrator/graph.ts:3-25](../../src/core/orchestrator/graph.ts#L3-L25)).
- `src/web/client/components/data/KanbanCard.tsx`: preferir o ID persistido e
  limitar `toShortFeatureId` ao fallback legado.
- Testes de schema, loader, catálogo, grafo, runs/notificações e board cobrindo
  formato, consumo, 200 IDs, colisão, reconciliação e rollback.

## Critérios de aceite

- [x] Toda feature carregada recebe um `F-` válido com oito caracteres e o
      item é removido do YAML após a publicação.
- [x] Um lote de pelo menos 200 features não produz IDs repetidos.
- [x] Uma colisão simulada é detectada antes da persistência e resulta em outro
      ID.
- [x] Dois cadastros concorrentes não atribuem o mesmo ID a features distintas.
- [x] IDs fornecidos no YAML são ignorados e não impedem a geração.
- [x] Dependências, histórico e notificações são rekeyeados para o ID gerado.
- [x] O board exibe o ID persistido e não o hash quando ambos estão disponíveis.
- [x] Falha de publicação restaura o YAML e não deixa rekey parcial no banco.
- [x] `EpicSchema.id` permanece fora do escopo e sem alteração.
