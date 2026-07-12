# Contrato: `retry.fallback` no schema do backlog

Extensao de `RetrySchema` (`src/core/backlog/schema.ts`), consumida por `src/core/backlog/load.ts` (v1 e v2) e persistida em `catalog_features` (via `loadBacklogFromCatalog`).

## Shape (Zod, adicao)

```ts
export const FallbackAlternativeSchema = z.object({
  tool: ToolSchema,
  model: z.string().optional(),
  effort: EffortSchema.optional(),
  maxAttempts: z.number().int().min(1).max(10).default(1),
});

export const RetrySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(1),
  backoffMs: z.number().int().min(0).default(5000),
  onFail: OnFailSchema.default('stop'),
  fallback: z.array(FallbackAlternativeSchema).default([]), // NOVO
});

export type FallbackAlternative = z.infer<typeof FallbackAlternativeSchema>;
```

## Exemplo YAML (backlog v2)

```yaml
version: 2
repo: metal-squad
epics:
  - id: epic-01
    title: Exemplo
    features:
      - id: feat-01
        title: Feature com fallback
        tool: claude
        model: sonnet
        effort: medium
        retry:
          maxAttempts: 3
          backoffMs: 5000
          onFail: gate
          fallback:
            - tool: codex
              maxAttempts: 2
            - tool: opencode
              model: gpt-4o
              maxAttempts: 1
```

## Comportamento garantido

1. `fallback` ausente ou `[]` ⇒ comportamento identico ao atual (sem mudanca observavel) — regressao coberta por `tests/backlog/load-prompt.test.ts` e `tests/runner/execute.test.ts` existentes.
2. `fallback` presente ⇒ apos a ferramenta primaria esgotar `retry.maxAttempts`, o runner tenta cada entrada de `fallback`, na ordem declarada, cada uma pelo seu proprio `maxAttempts` (default `1`), antes de aplicar `retry.onFail`.
3. Campos `model`/`effort` de uma alternativa, quando omitidos, herdam o valor da `Feature` (`feature.model`/`feature.effort`), nao um default fixo.
4. Nenhuma escrita em `backlog.yaml`/`catalog_features` decorre de uma execucao usar fallback — a lista e so lida, nunca reordenada/mutada em runtime.

## Compatibilidade v1

`BacklogV1Schema` usa `epics[].features[].retry?: RetrySchema` da mesma forma que v2 — a extensao se aplica identicamente a v1, sem migracao de dado necessaria (campo novo com default `[]`).
