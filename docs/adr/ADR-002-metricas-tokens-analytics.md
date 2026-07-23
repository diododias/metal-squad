# ADR-002 — Métricas, escopo e semântica de tokens para Analytics

- **Status**: Accepted
- **Date**: 2026-07-23
- **Scope**: Analytics — M0 / ANA-00
- **Related**: [ADR-001 — Governança, fonte de verdade e terminologia](ADR-001-governanca-fonte-de-verdade-terminologia.md)

## Contexto

Analytics hoje recebe `state.dashboard.rows` e soma `totalTokens` no cliente.
O banco, porém, preserva valores normalizados em `runs` e snapshots append-only
em `token_usage`; dados históricos também podem não ter Project, modelo ou
componentes válidos. Antes de adicionar agregações e gráficos, esta ADR fixa o
significado dos valores e como a interface deve expor suas lacunas.

Esta decisão herda de ADR-001 o vocabulário `Project`, `Epic`, `Repository` e
**Work Item**. `feature_id` é somente o identificador técnico legado de
compatibilidade e não deve aparecer como nome de domínio na UI nova.

## Decisões

### 1. Métrica primária e componentes

`total_tokens` por run é a métrica primária para ranking, orçamento, totais e
agregações. É o valor autoritativo e nunca é recalculado a partir de outros
componentes.

O breakdown por run expõe, quando disponível:

| Campo | Semântica |
|---|---|
| `input_tokens` | Tokens de entrada não servidos do cache. |
| `cached_input_tokens` | Tokens de entrada servidos do cache. |
| `output_tokens` | Tokens de saída. |
| `cache_ratio` | `cached_input_tokens / (input_tokens + cached_input_tokens)`. Mede apenas a fração de entrada servida do cache. |
| `context_window_percent` | Percentual da janela de contexto usado no instante registrado pela run; não é percentual do budget de tokens. |
| `other_unaccounted_tokens` | `total_tokens - (input_tokens + cached_input_tokens + output_tokens)`, quando os quatro valores forem conhecidos. Pode representar, por exemplo, thinking/reasoning. |

Se o denominador de `cache_ratio` for `0`, ou se algum componente necessário
estiver ausente ou inválido, `cache_ratio` é `null`, nunca `0`. `output_tokens`
não participa do denominador.

Os componentes podem somar menos que `total_tokens`; essa diferença deve ser
mostrada como `other/unaccounted`, sem alterar o total. Se
`|total_tokens - (input_tokens + cached_input_tokens + output_tokens)|`
ultrapassar a tolerância de qualidade adotada pela implementação, a run recebe
`dataQuality`; a apresentação não corrige nem distribui a diferença em silêncio.
Componentes negativos ou uma soma acima de `total_tokens` também são inválidos
para breakdown e devem receber `dataQuality`.

### 2. Fonte autoritativa e fallback histórico

`runs.*_tokens` é o valor normalizado gravado ao fim da run e é autoritativo.
`token_usage` é uma trilha de auditoria append-only e funciona exclusivamente
como fallback: se o campo correspondente de `runs` estiver ausente ou inválido,
usar o último snapshot válido de `token_usage`, isto é, o de maior `id` para o
mesmo `run_id`.

Essa regra formaliza a precedência já expressa por
`COALESCE(runs.*, token_usage.*)`, sem transformar o snapshot em substituto de
um valor normalizado presente. Divergência entre as duas fontes é sinal de
qualidade/auditoria, não motivo para reescrever `runs` nem para escolher o
snapshot silenciosamente.

### 3. Completude e confiança da classificação

Toda dimensão ou métrica exibida deve preservar a origem da sua classificação:

| Classificação | Significado |
|---|---|
| `exact` | Valor ou atributo registrado diretamente e válido na run. |
| `derived` | Valor inferido de dado histórico confiável ou de regra explícita, com origem rastreável. |
| `unknown` | Não há dado suficiente ou válido para classificar; não é equivalente a zero, string vazia ou “não aplicável”. |

Essa confiança é especialmente obrigatória para `model` e `tool`, cujos dados
históricos podem ser incompletos. A interface usa badge de confiança e mantém
o grupo `unknown` visível quando houver runs nele. Valores ausentes só podem
ser convertidos em zero quando zero for um fato preservado pela fonte e a
conversão não mudar a interpretação do gráfico.

### 4. Escopos oficiais

As agregações e filtros de Analytics têm os seguintes escopos oficiais:

- all projects;
- Project;
- Epic;
- Repository;
- Work Item;
- stage;
- tool;
- model;
- status; e
- período.

Uma run é `scoped` quando pode ser atribuída a Project/Epic pelos snapshots e
relacionamentos disponíveis. É `unscoped` quando não tem Project ou Epic
atribuível; em particular, o sinal existente
`integrityIssue = "Run has no Project snapshot."` é a origem desse grupo. A UI
mostra `unscoped` como grupo rotulado; ela não o omite nem o inclui
silenciosamente em outro Project.

Escopo e confiança são eixos independentes: uma run pode ser `scoped` e ter
`unknown` model, ou ser `unscoped` e ter tool `exact`.

### 5. Waste sem dupla contagem

`waste` mede os tokens de tentativas físicas que não produziram entrega. Cada
run conta exatamente uma vez, com os tokens que ela efetivamente gastou, e a
classificação é resolvida no grupo de `pipeline_id`:

- **útil**: tokens da(s) run(s) que entregaram com status `done`;
- **waste**: tokens de runs `failed`, `aborted` ou `blocked`, retries, resumes
  sem sucesso e tentativas superseded no mesmo pipeline que não entregaram.

Uma tentativa nunca aparece simultaneamente em útil e waste. Em especial, uma
linha de total agregada de pipeline não deve ser somada de novo sobre as runs
que a compõem. Quando não houver informação suficiente para saber se houve
entrega terminal, a classificação de waste é `unknown`, não útil por omissão.

## Consequências

ANA-01 e ANA-02 devem implementar schema, normalização e classificação sem
mudar estas semânticas. Consultas e gráficos futuros devem transportar
ausência, `dataQuality`, `scoped/unscoped` e `exact/derived/unknown` até a UI;
um número visualmente completo não pode ocultar uma lacuna histórica.

Preços monetários e conversão de tokens em custo permanecem fora de escopo e
serão tratados separadamente, se necessários (ANA-10).

## Fora de escopo

- Schema, migrações e backfill de runs ou snapshots.
- Tolerância numérica concreta e política de remediação para `dataQuality`.
- Tabela de preços monetários.
