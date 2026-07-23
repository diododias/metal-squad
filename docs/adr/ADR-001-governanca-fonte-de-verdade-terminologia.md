# ADR-001 — Governança, fonte de verdade e terminologia

- **Status**: Accepted
- **Date**: 2026-07-17
- **Scope**: Épico Projetos / PRJ-00
- **Related**: [Roadmap Projetos](../epics/epico%20-%20projetos/ROADMAP.md), [PRJ-00](../epics/epico%20-%20projetos/features/PRJ-00-adr-governanca-terminologia.md), [ADR-002 — Métricas, escopo e semântica de tokens para Analytics](ADR-002-metricas-tokens-analytics.md)

## Contexto

O `msq` precisa evoluir de um catálogo operacional ancorado em um único
repositório para um modelo multi-repo. A migração não pode confundir o estado
que já foi executado com a intenção versionada que orienta mudanças futuras.
Também é necessário separar o novo agrupador **Project** dos defaults de
execução que hoje são armazenados por repositório.

O modelo adotado neste épico é:

```text
Project › Epic › Work Item (type: feature | bug, 1 Repository) › Task
```

## Decisões

### 1. Fontes de verdade

| Artefato | Papel | Regra |
|---|---|---|
| SQLite | Estado operacional autoritativo | Runs, status derivados, vínculos, revisões, tombstones, auditoria e configurações persistidas são lidos do DB. |
| Specs, ADRs e constituição versionados | Intenção e governança | Descrevem decisões, contratos e trabalho desejado; não substituem o estado já persistido. |
| `backlog.yaml` | Seed de importação | É carregado com dry-run, conflitos explícitos e sem reconciliação destrutiva ou arquivamento silencioso. |
| Backup/export | Recuperação e transporte | São parte do contrato operacional; migrações e mudanças de fonte de verdade devem preservar uma cópia recuperável. |

Uma importação posterior não sobrescreve nem arquiva entidades existentes por
diferença de YAML. O export explícito do DB é o mecanismo para representar o
estado operacional em um artefato transportável.

### 2. Vocabulário de domínio

- **Project** agrupa Repositories e Epics e é dono do mapa `WorkItemType` →
  workflow template.
- **Repository defaults** são os defaults de execução do Repository alvo. A
  herança de execução tem exatamente dois níveis: `Work Item → Repository defaults`.
  O Project não adiciona uma terceira camada.
- **Epic** pertence a um Project e não possui Repository operacional próprio.
- **Work Item** é a entidade de trabalho abaixo de Epic. `feature` e `bug` são
  valores de `WorkItemType`, não nomes alternativos da entidade.
- **Task** é uma decomposição de um Work Item.
- **Backlog** é uma visão/estado que contém Work Items; não é uma entidade
  concorrente no domínio.

Os nomes `Demand` e `Backlog Item` não são nomes de domínio. Novos contratos
não devem introduzir símbolos derivados desses termos.

### 3. Contratos novos e compatibilidade

Contratos de domínio, UI, CLI e WebSocket novos usam:

- `WorkItem` e `WorkItemCatalogEntry`;
- `workItemId`;
- `action:createWorkItem`;
- `msq work-items`.

Durante este épico, o adapter de compatibilidade pode continuar usando os
seguintes nomes internos sem rename destrutivo:

| Nome legado | Uso permitido |
|---|---|
| `backlog_features` | Tabela de persistência histórica para Work Items. |
| `feature_id` | Coluna de identidade histórica; recebe o valor de `workItemId` enquanto a tabela existir. |
| `FeatureSchema` e aliases `Feature*` | Tipos/schema internos de compatibilidade, sem aparecer em contratos novos. |
| `projectDefaults` | Alias de código/configuração legado para Repository defaults; não pode ser usado em contrato novo nem em texto de domínio sem a marcação “legado”. |
| páginas ou componentes `BacklogItem*` | Identificadores de implementação existentes; não definem a entidade pública. |

Compatibilidade preserva dados e APIs existentes enquanto as etapas PRJ-01 a
PRJ-26 migram os consumidores. Ela não autoriza ampliar a ambiguidade dos
nomes legados.

### 4. Cardinalidade, identidade e seleção

- IDs de Project, Epic, Work Item, Repository e template são UUID v4 opacos.
- Um Repository pertence a no máximo um Project por vez; transferência usa
  `moveRepo` transacional.
- Cada Work Item pertence a exatamente um Repository vinculado ao Project do
  seu Epic.
- Epic não recebe um Repository operacional artificial.
- Dependências entre Repositories são recusadas antes da criação de pipeline e
  permanecem fora de escopo neste épico.
- `activeProjectId` é seleção por cliente em `localStorage`, não preferência
  global do servidor.
- Nomes e slugs são editáveis e nunca são chaves relacionais.

### 5. Ciclo de vida e templates

Delete é lógico e usa tombstone/`deleted_at`, preservando o ID. Só entidades
pristine podem ser deletadas; entidades com run terminal podem ser arquivadas,
e uma entidade running precisa ser cancelada antes de archive ou delete.

Um workflow template versionado combina `Workflow` e `stageSkills`. O Work Item
grava `templateId`, `templateVersion` e um snapshot na criação. Alterar o
template não altera Work Items existentes; skills são validadas no Repository
alvo antes da criação.

### 6. Contratos de mutação

Payloads WebSocket são validados em runtime. Ações mutáveis incluem
`requestId`, retornam resposta tipada e carregam `revision` para detectar
concorrência. Toda mutação relacionada usa uma transação única e gera audit
event com ator/sessão, entidade, operação e timestamp. Erros de domínio são
codificados e não são representados por `DbAccessError`.

## Estratégia de compatibilidade e rollback

1. A publicação deste ADR e das specs é somente documental e pode ser revertida
   por commit sem alterar o DB.
2. Migrações de schema são aditivas e idempotentes antes de qualquer
   reconstrução controlada. Cada migração cria backup/export verificável.
3. Se uma migração ou backfill falhar, interromper o avanço, preservar o DB
   original, restaurar o backup validado e corrigir a etapa antes de repetir.
4. Durante a transição, manter `backlog_features`, `feature_id` e aliases
   `Feature*`; remover esses nomes só em uma decisão posterior com plano de
   migração e rollback próprio.
5. Se o import seed produzir conflitos, não aplicar a escrita conflitante;
   corrigir o seed ou usar o serviço de domínio/edição apropriado.

Rollback não reclassifica runs históricas nem reutiliza IDs tombstonados.

## Consequências

O DB deixa de ser tratado como uma projeção descartável do YAML. O sistema
precisa investir em backup, export, auditoria, relatórios de conflito e
queries com escopo explícito de Project/Repository. Em contrapartida, o estado
operacional sobrevive a edições de specs e a importações repetidas, enquanto a
compatibilidade reduz o risco da migração histórica.

## Fora de escopo neste épico

- Um Work Item executando em múltiplos Repositories.
- Dependências ou scheduler cross-repo.
- Multiusuário/RBAC.
- Reconciliação automática bidirecional YAML ↔ DB.
- Work Item types além de `feature` e `bug`.
