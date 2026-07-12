# Data Model: Adapter Fallback em Retry + Resume no Step que Falhou

## Entidades

### 1. FallbackAlternative (config, dentro do backlog YAML/catalogo)

Nao e uma tabela — vive no schema Zod de `RetrySchema` (`src/core/backlog/schema.ts`) e e serializada junto do `backlog.yaml`/`catalog_features`.

| Campo | Tipo | Obrigatorio | Default | Descricao |
|---|---|---|---|---|
| `tool` | `Tool` (`'claude'\|'codex'\|'opencode'`) | sim | — | Ferramenta alternativa a tentar |
| `model` | `string` | nao | herda `feature.model` | Override de modelo so para esta alternativa |
| `effort` | `Effort` (`'low'\|'medium'\|'high'`) | nao | herda `feature.effort` | Override de esforco so para esta alternativa |
| `maxAttempts` | `number` (1-10) | nao | `1` | Tentativas dessa alternativa antes de avancar para a proxima |

`RetrySchema.fallback: FallbackAlternativeSchema[]` (default `[]`) — lista ordenada; ordem = ordem de tentativa (FR-002).

**Validacao**: `maxAttempts` segue o mesmo range de `RetrySchema.maxAttempts` (1-10). Lista vazia = comportamento identico ao atual (edge case spec.md linha 63).

### 2. RetryHistory (tabela `retry_history`, estendida)

| Coluna | Tipo | Novo? | Descricao |
|---|---|---|---|
| `id` | INTEGER PK | nao | — |
| `run_id` | INTEGER FK `runs(id)` | nao | — |
| `attempt` | INTEGER | nao | Contador global crescente ao longo de **todos** os candidatos (primaria + fallbacks), nao reinicia por candidato (ver research.md D2/riscos) |
| `error` | TEXT | nao | Resumo do erro dessa tentativa |
| `retried_at` | TEXT | nao | Timestamp |
| `tool` | TEXT nullable | **sim** | Ferramenta usada nessa tentativa especifica |
| `model` | TEXT nullable | **sim** | Modelo usado nessa tentativa (se aplicavel) |

**Migracao**: `ALTER TABLE retry_history ADD COLUMN tool TEXT` / `ADD COLUMN model TEXT`, seguindo o idioma condicional ja usado em `src/db/index.ts` para colunas novas (checar `PRAGMA table_info` antes de `ALTER TABLE` para migracoes idempotentes, como as demais em `migrate()`).

**Retrocompatibilidade**: linhas antigas tem `tool`/`model` = `NULL`. UI/queries devem exibir isso como "nao registrado" (edge case spec.md linha 66), nunca como erro ou como "n/a" ambiguo com "nao aplicavel".

### 3. Run (tabela `runs`, uso existente estendido)

Nenhuma coluna nova obrigatoria. Mudanca de **comportamento**: quando a tentativa vencedora (ou a ultima, se todas falharem) usa uma ferramenta/modelo diferente do `feature.tool`/`feature.model` original gravado na criacao da run, `runs.tool` deve refletir a ferramenta **efetivamente usada** nessa run (hoje e gravado uma vez em `createRun` e nunca atualizado). Isso mantem `runs.tool` como "a ferramenta que decidiu o resultado desta run", consistente com FR-011.

Opcional (se necessario para FR-011 sem depender de JOIN complexo): coluna nullable `resumed_with_tool TEXT` / `resumed_with_model TEXT` em `runs`, preenchida apenas quando a run nasce de um `msq resume --tool/--model` — marca visualmente que aquela run especifica usou override pontual (nao persistido no backlog). Avaliar em Phase 2 (tasks) se e realmente necessario ou se `retry_history`/`runs.tool` ja bastam para as telas de status previstas.

### 4. TokenUsage (tabela `token_usage`, sem mudanca de schema)

Ja e append-only por `run_id`. **Nao precisa de coluna nova** — a soma `SELECT SUM(total) FROM token_usage WHERE run_id = ?` ja acumula todas as tentativas internas daquele run (FR-009 na granularidade "run"). Se a UI/queries de status precisarem separar consumo por tentativa individual dentro do mesmo run, isso exigiria uma coluna `attempt` nullable em `token_usage` — so adicionar se `tasks.md` confirmar que a UI precisa desse nivel de granularidade (nao esta nos FRs explicitamente, que pedem soma total por execucao).

### 5. ResumeOverride (parametro efêmero, nao persistido)

Nao e uma tabela — e um valor passado em memoria de `commands/resume.ts` para `executeBacklog`/`runWithRetry` durante uma unica invocacao do processo.

| Campo | Tipo | Descricao |
|---|---|---|
| `featureId` | `string` | Feature-alvo da retomada dentro do pipeline (a que estava ativa/bloqueada/em gate) |
| `tool` | `Tool` opcional | Override pontual de ferramenta |
| `model` | `string` opcional | Override pontual de modelo |
| `effort` | `Effort` opcional | Override pontual de esforco |

**Regra**: aplica-se apenas ao candidato inicial do proximo `runWithRetry` daquela `featureId`; qualquer outra feature `pending` no mesmo pipeline continua usando a config persistida do backlog (FR-007). Nunca e escrito em `backlog.yaml` nem em `catalog_features`.

## Relacionamentos

```
Feature (backlog/catalog)
  └── retry: RetrySchema
        ├── maxAttempts, backoffMs, onFail   (existente)
        └── fallback: FallbackAlternative[]  (novo)

Pipeline (1) ──< Run (N)              [pipeline_id em runs]
Run (1) ──< RetryHistory (N)          [run_id, attempt crescente global]
Run (1) ──< TokenUsage (N)            [run_id, soma = uso total do run]
Run (1) ──o Gate (0..1)               [existente: onFail=gate OU budget violation]

ResumeOverride (efêmero) ──aplica-se-a──> proxima Run daquela featureId
```

## Transicoes de estado relevantes (sem mudanca no modelo existente)

- `run.status`: `running → done | blocked | failed | aborted` — inalterado; `blocked` continua significando "aguardando gate", agora tambem alcancavel apos esgotar fallback inteiro (nao so a ferramenta primaria).
- `pipeline.status`: `running ↔ paused → aborting/done` — inalterado; resume com override entra pelo mesmo caminho de `resumePipeline()` ja existente.
- `gate.decision`: preenchido por `resolveGate` (Telegram) ou agora tambem implicitamente por `msq resume --tool/--model` bem-sucedido (a run seguinte concluindo substitui a necessidade de decisao manual, mas o registro do gate original permanece `resolved_at`/`decision` conforme fluxo hoje).

## Regras de validacao adicionais

- FR-012: antes de criar qualquer run nova a partir do resume, validar `getAdapter(overrideTool)` existe no registry E que a ferramenta esta de fato disponivel no ambiente (binario/credencial) — falha aqui aborta o comando com mensagem, sem tocar em `pausePipeline`/`resumePipeline`/criar `run`.
- FR-013: se `findResumablePipeline(target)` encontrar uma pipeline mas o snapshot resultante (`pending+active+aborted`) for vazio, informar "nada pendente para retomar" em vez de rodar `executeBacklog` sobre um plano vazio.
