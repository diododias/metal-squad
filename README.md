# metal-squad (`msq`)

Orquestrador de pipelines de desenvolvimento assistido por IA sobre [spec-kit](https://github.com/github/spec-kit). Gerencia um backlog de **épicos → features → tasks** em múltiplos repositórios, executando workflows spec-kit em paralelo/sequencial conforme o grafo de dependências, e notifica via Telegram nos gates de decisão humana.

## Setup

```bash
npm install
npm run build
npm link        # disponibiliza `msq` global
```

Dev sem build:

```bash
npm run dev -- <comando>
```

## Comandos

| Comando        | Descrição                                            |
| -------------- | ---------------------------------------------------- |
| `msq init`     | Cria `backlog.yaml` e registra o repo no DB global   |
| `msq run`      | Executa o workflow do backlog (grafo de dependências)|
| `msq status`   | Estado dos runs e uso de tokens (todos os repos)     |
| `msq ui`       | TUI interativa (ink)                                 |

## Armazenamento

- `backlog.yaml` — por repo, versionável e editável à mão
- `~/.config/metal-squad/config.json` — config global
- `~/.local/share/metal-squad/app.db` — SQLite (WAL) com estado de runs e tokens

## Estrutura

```
src/
  index.ts            bin (msq / metal-squad)
  cli.ts              wiring commander
  commands/           init, run, status, ui
  core/
    backlog/          schema (zod) + loader yaml
    orchestrator/     graph (topo) + scheduler (concorrência)
    adapters/         claude | codex | opencode (+ spawn helper)
    runner/           execução spec-kit (TODO)
    tokens/           tracking de uso (TODO)
    notify/           telegram
  config/             paths + config global
  db/                 better-sqlite3 + schema
  security/           keyring + fallback cifrado
  ui/                 TUI ink
```

Veja `docs/ARCHITECTURE.md` para as decisões de design.
