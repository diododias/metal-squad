# F35 — Backlog Catalog Import (carga em batch para o banco)

**Epic**: [E01 — Skills System](../epics/E01-skills-system.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F01 (schema v2)

## Problema

Hoje o banco SQLite (`src/db/index.ts`) so modela estado de execucao
(`repos`, `runs`, `gates`, `token_usage`, `pipelines`, etc). O catalogo de
epics/features/tasks vive exclusivamente em `backlog.yaml` e so e lido em
memoria no momento de um `msq run`. Nao existe forma de:

- carregar o `backlog.yaml` inteiro no banco como catalogo consultavel
  (TUI/web hoje nao conseguem listar features que ainda nao rodaram nenhuma
  vez, exceto lendo o YAML direto)
- repetir essa carga em batch depois de editar o YAML manualmente, sem
  precisar disparar `msq run`
- garantir que essa carga e **idempotente e nao destrutiva**: rodar de novo
  nao pode apagar/alterar `runs`, `gates`, `token_usage`, `pipelines` ou
  qualquer estado de execucao ja persistido

## Solucao

### Fonte de verdade em runtime: banco, nao o YAML

Depois desta feature, `backlog.yaml` deixa de ser lido diretamente por
`msq run`/`msq status`/`msq ui`/modo web em cada execucao. Ele passa a ser
**apenas o formato de entrada em batch**: o unico jeito de o catalogo mudar
e rodando `msq backlog load`, que valida o YAML e grava o resultado nas
tabelas `backlog_epics`/`backlog_features`/`backlog_tasks`. Todo o resto do
produto (scheduler, TUI, web, comandos de status) passa a ler o catalogo do
banco, do mesmo jeito que ja le estado de execucao de `runs`/`gates`. Isso
unifica a fonte de leitura (tudo vem do SQLite) e evita runtime divergir do
YAML por causa de edicoes manuais nao carregadas.

Implicacoes de arquitetura (`architecture.md`):

- `src/core/backlog/load.ts` continua validando o YAML (schema/contrato),
  mas quem hoje consome `loadBacklog()` para orquestrar um run
  (`src/core/orchestrator/`) passa a consumir uma query equivalente vinda de
  `src/db/repo.ts`, nao o arquivo direto
- `msq run --feature X` sem catalogo carregado no banco deve falhar com erro
  acionavel ("feature X nao encontrada no catalogo — rode `msq backlog
  load` primeiro"), nao tentar ler o YAML como fallback silencioso
- Essa migracao de fonte de verdade e o corpo principal do trabalho desta
  feature; o comando `msq backlog load` em si (abaixo) e a parte mais simples

### Novo comando

```bash
msq backlog load [--file backlog.yaml] [--dry-run]
```

- Le e valida `backlog.yaml` com o schema atual (`src/core/backlog/schema.ts`
  via `loadBacklog`)
- Faz upsert do catalogo (epics, features, tasks, dependsOn) em tabelas
  novas — nunca em `runs`/`gates`/`token_usage`/`pipelines`
- `--dry-run` so mostra o diff (features novas, removidas, alteradas) sem
  escrever no banco

### Novas tabelas (proposta)

```sql
CREATE TABLE IF NOT EXISTS backlog_epics (
  epic_id    TEXT PRIMARY KEY,
  repo_id    TEXT NOT NULL REFERENCES repos(repo_id),
  title      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backlog_features (
  feature_id  TEXT PRIMARY KEY,
  epic_id     TEXT NOT NULL REFERENCES backlog_epics(epic_id),
  title       TEXT NOT NULL,
  depends_on  TEXT NOT NULL DEFAULT '[]', -- JSON array de feature ids
  spec_file   TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backlog_tasks (
  task_id     TEXT NOT NULL,
  feature_id  TEXT NOT NULL REFERENCES backlog_features(feature_id),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, feature_id)
);
```

Ownership: schema/migracao em `src/db/`, leitura/validacao do YAML
reaproveitando `loadBacklog` de `src/core/backlog/`. O comando fica em
`src/commands/backlog.ts` (novo), sem logica de negocio alem de orquestrar
load + upsert (`architecture.md`).

### Regras de nao-destrutividade

- `msq backlog load` nunca faz `DELETE`/`DROP` em `runs`, `gates`,
  `token_usage`, `pipelines`, `run_output`, `stage_requests`,
  `retry_history`, `task_runs`
- Features/tasks removidas do YAML ficam marcadas (`archived_at` ou flag),
  nunca sao apagadas em cascata — para nao quebrar FK de runs historicos
  apontando para um `feature_id` que saiu do YAML
- Rodar o comando 2x seguidas com o mesmo YAML deve ser no-op (idempotente)

### Uso esperado

1. Editar/organizar `backlog.yaml` manualmente (ou via feature futura de
   "add feature")
2. Rodar `msq backlog load` para publicar esse catalogo no banco global
3. TUI/web passam a listar todas as features do catalogo (inclusive as que
   nunca rodaram), com o status real de execucao vindo do join com `runs`

## Criterios de aceite

- [ ] `msq backlog load` cria/atualiza `backlog_epics`, `backlog_features`,
      `backlog_tasks` a partir do `backlog.yaml` validado
- [ ] Comando e idempotente: rodar 2x com o mesmo YAML nao gera diff
- [ ] Comando nunca escreve/apaga em tabelas de estado de execucao
      (`runs`, `gates`, `token_usage`, `pipelines`, etc.)
- [ ] `--dry-run` mostra features adicionadas/removidas/alteradas sem gravar
- [ ] `msq run`, `msq status`, `msq ui` e o modo web passam a resolver o
      catalogo de epics/features/tasks a partir do banco, nao mais lendo
      `backlog.yaml` diretamente em runtime
- [ ] `msq run --feature X` para uma feature ausente do catalogo carregado
      falha com mensagem acionavel pedindo `msq backlog load`
- [ ] Testes cobrindo: carga inicial, recarga idempotente, feature removida
      do YAML (marcada, nao deletada), YAML invalido (erro claro), e runtime
      lendo do banco em vez do YAML
