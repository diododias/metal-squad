# Feature Specification: ADR de métricas, escopo e semântica de tokens

**Feature Branch**: `feat/ana00-analytics-metrics-adr`  
**Created**: 2026-07-23  
**Status**: Ready for planning  
**Roadmap**: Analytics — M0  
**Depende de**: nenhuma

## Objetivo

Publicar uma ADR curta que feche a semântica das métricas de Analytics antes de
implementar agregações e gráficos. A entrega evita que a UI apresente números
visualmente ricos, mas tecnicamente ambíguos.

## Contexto de execução

A página atual usa `state.dashboard.rows` e soma `totalTokens` no cliente. O DB
possui `runs.total_tokens`, componentes de token e snapshots em `token_usage`,
mas há lacunas históricas: runs sem `project_id`, sem snapshot de modelo e casos
com componente de input negativo.

### Estado atual no código (verificado 2026-07-23)

- `runs` tem `input_tokens`, `cached_input_tokens`, `output_tokens`,
  `total_tokens`, `context_window_tokens`, `context_window_percent`; `project_id`
  entra por migração (`ensureRunColumn`). **Não há coluna `model`/`effort`** na
  `runs` — só `retry_history` recebeu `model`/`tool` por migração.
- `token_usage` guarda snapshots por `run_id` com colunas `input`, `cached_input`,
  `output`, `total` (nomes diferentes de `runs`); a leitura usa o snapshot de
  `MAX(id)` por run.
- `listRunsForStats` (`src/db/repo.ts`) já marca `integrityIssue = "Run has no
  Project snapshot."` quando falta `project_id` — a ADR deve tratar esse sinal
  como fonte de `unknown/unscoped`, não escondê-lo.
- Precedência de leitura hoje: `COALESCE(runs.*, token_usage.*)`. A ADR precisa
  declarar qual é autoritativo quando os dois divergem.

## Requirements

- Definir a métrica primária: `total_tokens` por run.
- Definir breakdown: `input_tokens`, `cached_input_tokens`, `output_tokens`,
  `cache_ratio` e `context_window_percent`.
- Definir como classificar dados históricos: `exact`, `derived`, `unknown`.
- Definir escopos oficiais: all projects, Project, Epic, Repository, Work Item,
  stage, tool, model, status e período.
- Definir `waste`: tokens de runs `failed`, `aborted`, `blocked`, retries e
  retomadas sem entrega terminal.
- Definir que valores ausentes não podem virar zero silencioso quando isso muda
  interpretação do gráfico.
- Definir nomenclatura UI: usar Work Item no domínio; `feature_id` apenas como
  compatibilidade técnica.

## Decisões da ADR (resolvidas)

Estas são as decisões normativas que as specs seguintes devem seguir como contrato.

### D1 — `cache_ratio`

`cache_ratio = cached_input / (input + cached_input)`. Mede a fração do input
servida do cache; `output` não entra. Denominador `0` ⇒ `cache_ratio = null`
(não `0`).

### D2 — Relação `total` × breakdown

`total_tokens` é autoritativo para ranking e budget e **nunca** é recalculado a
partir dos componentes. `input + cached_input + output` são parcelas que somam
`≤ total`; o restante é exposto como `other/unaccounted` (ex.: thinking/reasoning).
Se `|total − (input + cached_input + output)|` exceder tolerância definida, marcar
`dataQuality`, sem corrigir silenciosamente.

### D3 — Precedência `runs.*_tokens` × `token_usage`

`runs.*_tokens` é autoritativo (valor normalizado gravado no fim da run, ver
[[ANA-01]]); `token_usage` é trilha append-only de auditoria e **fallback**. Se
`runs` estiver ausente ou inválido, usar o último snapshot válido de `token_usage`
(`MAX(id)` por `run_id`). Formaliza o `COALESCE(runs.*, token_usage.*)` já existente.

### D4 — `waste` sem dupla contagem

Cada run/tentativa física conta uma vez, com os tokens que realmente gastou. A
classificação é por resultado, agrupada por `pipeline_id`:

- **útil**: tokens da(s) run(s) que entregou (`done`);
- **waste**: tudo no mesmo pipeline que não entregou — `failed`/`aborted`/`blocked`,
  retries e resumes sem sucesso, superseded.

Nenhuma tentativa entra em "útil" e "waste" ao mesmo tempo; não se soma um `total`
que agregue todas as tentativas.

### D5 — `unknown` vs `unscoped` (dois eixos distintos)

- **Escopo**: `scoped` vs `unscoped` — `unscoped` é run sem Project/Epic atribuível
  (o `integrityIssue = "Run has no Project snapshot."` já emitido).
- **Confiança de classificação**: `exact | derived | unknown` — para model/tool
  (ver [[ANA-02]]).

São dimensões independentes: uma run pode ser `scoped` e `unknown model`. Nos
gráficos, `unscoped` aparece como grupo rotulado; a confiança aparece como badge.

## Arquivos afetados

- `docs/adr/ADR-002-metricas-tokens-analytics.md` — nova ADR (segue a convenção
  `ADR-NNN-kebab.md`; hoje existe apenas `ADR-001-governanca-fonte-de-verdade-terminologia.md`).
- `docs/adr/ADR-001-governanca-fonte-de-verdade-terminologia.md` — referenciar
  como ADR relacionada (terminologia Work Item/Project herda dela).

## Fora de escopo

- Definir schema/migração (fica em ANA-01/ANA-02); a ADR só fixa semântica.
- Tabela de preços monetários (opcional, ver ANA-10).

## Success Criteria

- ADR publicada e referenciada pelo roadmap/specs.
- Métricas primárias e secundárias têm fórmula explícita, incluindo denominador
  de `cache_ratio` e relação `total`×breakdown.
- As decisões D1–D5 estão publicadas na ADR e referenciáveis pelas specs.
- Dados antigos incompletos têm tratamento definido (`exact|derived|unknown`),
  coerente com o `integrityIssue` já emitido por `listRunsForStats`.
- O aceite das specs seguintes pode apontar para esta ADR como contrato.

## Validação

Item só de docs (ver `testing.md` → "quando tocar somente docs/skills/rules"):
conferir links da ADR no ROADMAP e nas specs `ANA-*`, consistência com
`ADR-001` e ausência de contradição com `repo-context.md`. Sem suíte de código.
