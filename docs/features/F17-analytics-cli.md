# F17 — Analytics CLI (msq stats)

**Epic**: [E04 — Observability](../epics/E04-observability.md)
**Prioridade**: Media
**Esforco**: Low

## Problema

`msq status` mostra apenas uma tabela simples de runs. Nao ha analytics agregados via CLI.

## Solucao

### Novo comando `msq stats`

```bash
msq stats                    # resumo geral
msq stats --period 7d        # ultimos 7 dias
msq stats --repo metal-squad # filtro por repo
msq stats --tool claude      # filtro por tool
msq stats --format json      # output JSON para integracao
```

### Output

```
metal-squad — last 7 days
  Runs: 12 total (9 done, 2 failed, 1 running)
  Tokens: 346.3k (245.2k input, 101.1k output)
  Cost: ~$5.08
  Avg duration: 4m32s
  Success rate: 75%
  
  Top features by cost:
    feat-01  $1.17  (3 runs)
    feat-02  $0.51  (1 run)
```

## Criterios de aceite

- [x] `msq stats` com output formatado
- [x] Filtros por periodo, repo, tool
- [x] Metricas: runs, tokens, custo, duracao, success rate
- [x] `--format json` para integracao
