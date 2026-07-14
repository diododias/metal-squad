# F52 — Registro de Features com ID Gerado Automaticamente

## Implementation status

The batch registration boundary now accepts omitted feature IDs, validates
explicit IDs, allocates canonical `F-<8>` values from the fixed alphabet, and
publishes the materialized YAML and SQLite catalog together. Existing legacy
and manual IDs remain opaque and unchanged; Epic IDs are not part of this
contract. The web board prefers the persisted catalog identity and retains the
short hash only for unmatched legacy run payloads.

YAML publication is staged with a recoverable backup around the catalog
transaction. A catalog ownership conflict or publication failure restores the
source YAML and reports that no catalog update was committed. Archived catalog
rows remain occupied so historical IDs cannot be reused.

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

Fazer com que toda feature nova sem ID explícito receba um ID persistente no
formato `F-<8>`, único globalmente e estável entre cargas, runs, notificações e
board. IDs legados e manuais válidos continuam funcionando sem migração
destrutiva. O cadastro batch e o futuro cadastro online devem compartilhar a
mesma regra de geração.

Esta execução começa em `plan`: o stage `specify` foi concluído na spec
detalhada e não deve ser disparado novamente para esta feature.

## Solução

### Geração e validação

- Criar uma única regra de geração aleatória de `F-` + oito caracteres do
  alfabeto definido na spec detalhada.
- Verificar o candidato contra os IDs já registrados antes da confirmação.
- Preservar IDs `feat-N` e IDs manuais válidos; rejeitar duplicados e valores
  malformados no ponto de entrada.
- Garantir que dependências, histórico e notificações comparem IDs como valores
  opacos, sem depender do prefixo ou do formato.

### Persistência e concorrência

- Atribuir o ID somente no primeiro cadastro de uma feature sem `id`.
- Persistir a associação de forma idempotente, sem alterar o ID em recargas,
  reordenações ou renomeações.
- Garantir que cadastros concorrentes não confirmem o mesmo ID para features
  diferentes e que YAML e catálogo não fiquem divergentes.

### Board web

- Exibir o ID persistido recebido pela feature.
- Manter a identificação derivada no cliente apenas como fallback para dados
  legados sem ID persistido; o fallback não pode virar a identidade da feature.

## Escopo técnico

- `src/core/backlog/schema.ts`: contrato e validação do ID de `Feature`; não
  alterar `EpicSchema.id`.
- `src/core/backlog/load.ts`: atribuição idempotente durante o carregamento e
  validação de referências do backlog.
- `src/db/backlogCatalog.ts`: unicidade, persistência e operação atômica do
  catálogo.
- `src/core/orchestrator/graph.ts`: preservar resolução independente do
  formato do ID; a implementação atual usa o ID apenas como chave opaca
  ([src/core/orchestrator/graph.ts:3-25](../../src/core/orchestrator/graph.ts#L3-L25)).
- `src/web/client/components/data/KanbanCard.tsx`: preferir o ID persistido e
  limitar `toShortFeatureId` ao fallback legado.
- Testes de schema, loader, catálogo, grafo, runs/notificações e board cobrindo
  formato, idempotência, 200 IDs, colisão, concorrência e compatibilidade.

## Critérios de aceite

- [x] Uma feature nova sem ID recebe um `F-` válido com oito caracteres e o
      valor persiste após duas cargas consecutivas.
- [x] Um lote de pelo menos 200 features não produz IDs repetidos.
- [x] Uma colisão simulada é detectada antes da persistência e resulta em outro
      ID.
- [x] Dois cadastros concorrentes não atribuem o mesmo ID a features distintas.
- [x] IDs `feat-N` e manuais válidos são preservados; IDs duplicados ou
      malformados são rejeitados.
- [x] Dependências, histórico e notificações continuam localizando a feature
      correta para IDs novos e legados.
- [x] O board exibe o ID persistido e não o hash quando ambos estão disponíveis.
- [x] Alterar `title`, `specFile` ou posição não altera o ID.
- [x] `EpicSchema.id` permanece fora do escopo e sem alteração.
