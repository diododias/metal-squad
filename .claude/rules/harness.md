# Harness Rules

## Quando estas regras importam

Use estas regras sempre que a tarefa envolver:

- `msq run`, `msq status`, `msq ui` ou `node dist/index.js`
- validacao de adapters
- backlog temporario para exercitar o produto
- observabilidade, timeout, heartbeat, recursao ou SQLite

## Banco local gravavel

Neste repo, validacoes live podem falhar por banco global sem permissao de escrita. O caminho seguro para testes locais e:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js run --feature feat-XX
```

Use o mesmo override para `status` quando quiser inspecionar a mesma base local:

```bash
MSQ_DB_PATH="$(pwd)/.metal-squad/app.db" rtk node dist/index.js status --limit 5
```

## Anti-recursao

Dentro de uma sessao ja spawnada pelo `msq`, e proibido:

- rodar `msq run`
- rodar `node dist/index.js run`
- rodar `npm run dev -- run ...`
- disparar qualquer nested runner que reinicie o proprio orquestrador

Se o objetivo e testar o `msq`, isso deve acontecer no harness externo, nao de dentro do agente filho.

## Evidencias minimas de run real

Nao considere o fluxo bem-sucedido so porque o processo saiu com `0`. Exija pelo menos dois sinais concretos, idealmente tres:

- nova run persistida em `status`/SQLite
- output util do adapter, heartbeat ou summary parcial/final
- diff, commit ou arquivos tocados no checkout

Sem isso, trate como falha operacional do produto ou do harness.

## Escolha da skill correta

- desenvolvimento normal do repo: `.claude/skills/dev-flow/SKILL.md`
- validacao do proprio executor/harness: `.claude/skills/msq-develop/SKILL.md`

## Quando registrar docs operacionais

Se a validacao revelar defeito real do produto:

- registre em `docs/hotfixes/Hxx-*.md` quando for bug operacional/correcao
- registre em `docs/features/F25-*.md` ou outra feature operacional quando for melhoria estrutural do harness

Nao compense falha do harness implementando manualmente a feature alvo e chamando isso de validacao do `msq`.
