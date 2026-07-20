# CLAUDE.md — metal-squad (`msq`)

Guia operacional para agentes de código — Claude Code, Codex, OpenCode e
equivalentes — neste repositório. As regras em [`.claude/rules/`](.claude/rules/)
são normativas e têm precedência sobre este resumo; este arquivo explica como
entrar no projeto, navegar sua arquitetura e escolher o fluxo correto.

## Antes de agir

1. Leia [`.claude/rules/README.md`](.claude/rules/README.md) e, em seguida, as
   rules aplicáveis à mudança. Não copie, resuma como se fossem nova fonte de
   verdade, nem contradiga suas regras detalhadas.
2. Consulte `README.md`, `backlog.yaml`, a feature ou hotfix relacionada e os
   testes/código da área antes de inferir comportamento.
3. Use `rtk` como prefixo de todo comando de shell. Veja as exceções e o motivo
   em `~/.codex/RTK.md`.
4. Preserve alterações locais que não pertencem à tarefa. Comece por
   `rtk git status --short --branch` e não as descarte.

## Exploração de contexto

- Para estrutura, dependências e impacto de mudança, consulte Dora antes de
  fazer exploração ampla por shell.
- Para símbolos, edições cirúrgicas e memória operacional, consulte Serena
  antes da leitura bruta. Carregue `mem:core` quando existir; caso contrário,
  use `.claude/serena/mem-core.md`.
- Use shell para confirmar o estado real (diff, processos, SQLite, testes e
  comandos) e como fallback quando essas ferramentas não cobrirem a pergunta.
- Ao investigar runtime, priorize evidência observável — configuração efetiva,
  dados persistidos e output do processo — em vez de dedução a partir da UI.

## Navegação por rules

| Quando a mudança envolve | Leia primeiro |
| --- | --- |
| Escopo do produto, fontes de verdade ou TUI/Web | `repo-context.md` |
| Limites entre camadas e ownership | `architecture.md` |
| Branch, commits, hooks e PR | `git-workflow.md` |
| Testes, suites focadas e critérios de aceitação | `testing.md` |
| Run real, adapters, SQLite, fixtures ou recursão | `harness.md` |

Leia mais de uma rule quando a mudança atravessar fronteiras. Por exemplo,
alterações em `run` normalmente exigem `architecture`, `testing` e `harness`.

## Mapa da arquitetura

### Visão macro

```text
backlog.yaml + config + skills locais
                │
                ▼
CLI (src/cli.ts, src/commands/)
                │
                ▼
Core: backlog → workflow/orchestrator/runner → adapters
                │                 │                 │
                │                 └──── events ─────┘
                ▼
SQLite (src/db/) ─────► Web oficial (src/web/client/) / TUI legada (src/ui/)
```

### Visão por responsabilidade

| Área | Responsabilidade | Dependências permitidas em alto nível |
| --- | --- | --- |
| `src/commands/` | Interface CLI e composição de casos de uso | `core`, `db`, `config`; sem regra de negócio ou SQL inline |
| `src/core/backlog/` | Schema, carga, defaults e construção de prompt | Contratos de backlog; não UI |
| `src/core/workflow/`, `orchestrator/`, `runner/`, `tasks/` | Etapas, dependências, agendamento e execução | Backlog, adapters, events e persistência por interfaces |
| `src/core/adapters/` | Contrato específico de Codex, Claude e OpenCode | Helpers comuns de processo/heartbeat; não duplicar o runner |
| `src/core/skills/` | Discovery, resolução e validação das skills | Registry único; não repetir a precedence em callers |
| `src/core/events/`, `notify/`, `budget/` | Eventos, telemetria, notificações e custos | Eventos como fronteira de acoplamento |
| `src/db/` | SQLite, migrações, queries e catálogo | Único dono de SQL e persistência |
| `src/web/` e `src/web/client/` | API/servidor e dashboard React oficial | Estado consultável; sem executar processos diretamente no cliente |
| `src/ui/` | TUI Ink legada | Apenas manutenção/remoção; não iniciar evolução nova |

Ao alterar um contrato transversal, siga o fluxo inteiro: schema/tipos → loader
ou serviço → executor/adapter → persistência/eventos → interface observável →
testes e documentação operacional. Prefira reforçar uma abstração existente em
vez de criar um caminho paralelo.

## Práticas de implementação

- Para desenvolvimento normal, use `/dev-flow`. Para testar se o próprio `msq`
  consegue executar uma feature, use `/msq-develop`; esse segundo fluxo é QA do
  executor, não autorização para implementar manualmente a feature-alvo.
- Trate `backlog.yaml` como configuração executável. Mudanças de backlog que
  precisem aparecer no runtime exigem o fluxo de publicação/carregamento
  definido nas rules, não apenas a edição do YAML.
- Mantenha os prompts independentes de adapter: skills aparecem como comandos
  slash (`/nome`), a especificação técnica (`feature.spec` + `feature.specFile`)
  é íntegra e a resposta administrativa preenchida vem por último. Arquivos de
  contexto (`feature.context`) e `task.taskFile` entram no prompt apenas como
  caminhos (`- ctx/foo.ts`, `Task file: tasks/t1.md`); o adapter/agente decide
  se e quando carregar seu conteúdo sob demanda.
- Centralize regras compartilhadas (especialmente workflow, skills, spawn e
  persistência). Não replique precedence, SQL ou parsing em cada command/UI.
- Para bugs reais revelados durante validação, registre o aprendizado no
  artefato operacional apropriado (`docs/hotfixes/` ou feature), conforme as
  rules.
- Faça mudanças pequenas, rastreáveis e compatíveis com os contratos de
  adapter. Valide pelo menor teste que prova o comportamento antes da bateria
  completa.

## Skills importantes

- `/dev-flow` — implementação, validação e publicação de mudanças normais.
- `/msq-develop` — execução controlada para validar o harness/autonomia do
  `msq`.
- `/msq-backlog-populate` — criar ou organizar itens de backlog, quando esse
  for o objetivo explícito.
- `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement` —
  ciclo Spec Kit; use apenas as etapas necessárias e respeite a feature ativa.
- `/speckit-clarify`, `/speckit-analyze`, `/speckit-converge` — reduzir
  ambiguidade, checar consistência e encontrar trabalho restante.

As skills canônicas são as de `.claude/skills/`; `.agents/skills/` existe como
shim de compatibilidade. Antes de alterar skills ou referências, consulte
`testing.md` e rode a validação de shims indicada lá.

## Gates e evidências

Escolha a validação pela superfície alterada e siga a matriz completa em
`testing.md`:

- código: build, testes, typecheck e lint aplicáveis;
- docs/rules/skills: referências, consistência e shims;
- fluxo com SQLite, CLI, adapter ou execução real: também as proteções de
  `harness.md` e evidências observáveis de runtime;
- antes de publicar: deixe hooks/gates executarem; não contorne falhas.

Os gates de qualidade usam banco sandboxado e não devem contaminar o catálogo
real. Nunca considere uma run válida apenas pelo código de saída: confirme
persistência, output/eventos e efeito verificável conforme `harness.md`.

## Git e entrega

Todo trabalho segue o fluxo de branch e PR para `develop` em
`git-workflow.md`. Não crie worktrees, não faça merge por conta própria e não
publique mudanças sem a validação pertinente. Para uma alteração apenas local
ou documental, valide as referências afetadas e reporte explicitamente o que
foi — e o que não foi — executado.
