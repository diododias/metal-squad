# Testing Rules

## Baseline para mudanca de codigo

Para alteracoes em `src/` ou `tests/`, a base minima e:

```bash
rtk npm run build
rtk npm test
rtk npm run typecheck
```

Rode tambem:

```bash
rtk npm run lint
```

quando tocar TypeScript relevante em `src/`.

## Gates canonicos dos hooks

- `rtk npm run gate:fast` — pre-commit: typecheck + lint + testes derivados dos arquivos staged (`vitest related`); pula testes quando so docs/skills/rules mudaram.
- `rtk npm run gate:full` — pre-push (e CI futuro): bateria completa dentro de um banco sandbox (`scripts/with-sandbox-db.mjs`); nunca toca `~/.local/share/metal-squad/app.db`.

Contratos dessa infraestrutura: `rtk npx vitest run tests/harness`.

Para dados deterministicos em E2E/Web (nunca no gate): `npm run db:fixture -- --scenario settings` com `MSQ_DB_PATH` sandbox (ver `harness.md`).

## Suites focadas por area

### Backlog / prompt / skills

```bash
rtk npx vitest run tests/backlog/load-prompt.test.ts tests/skills/registry.test.ts tests/commands/commands.test.ts
```

### Adapters / spawn / runner

```bash
rtk npx vitest run tests/adapters/codex.test.ts tests/adapters/misc.test.ts tests/runner/execute.test.ts
```

### DB / config / CLI

```bash
rtk npx vitest run tests/db/index.test.ts tests/db/repo.test.ts tests/config/index.test.ts tests/cli.test.ts tests/commands/commands.test.ts
```

### UI

```bash
rtk npx vitest run tests/ui/app.test.ts tests/ui/components.test.ts tests/ui/hooks.test.ts
```

## Quando tocar somente docs/skills/rules

Nao ha obrigacao de rodar a suite completa. Nesse caso, valide:

- caminhos e referencias de arquivos
- consistencia com `README.md`, `docs/ROADMAP.md` e comportamento atual
- ausencia de instrucoes contraditorias entre `.claude` e `.agents`

## Validacao live do produto

Se a mudanca precisa prova real de execucao do `msq`:

1. rode `rtk npm run build`
2. use `MSQ_DB_PATH` local
3. execute o menor comando que prove o comportamento
4. trate evidencias parciais com seriedade: run criada, summary, heartbeat, diff e arquivos tocados

Nao use `msq run` live como substituto automatico de testes unitarios quando suites focadas ja cobrem o caso.
