# Skill: Dev Flow

Fonte canonica desta skill: este arquivo em `.claude/skills/dev-flow/`.

Use esta skill para desenvolvimento normal no `metal-squad`: feature, hotfix, refactor, docs tecnicos, ajustes de skill e melhorias locais no repo.

Nao use esta skill para validar o proprio executor `msq` ponta a ponta. Nesse caso, carregue [`../msq-develop/SKILL.md`](../msq-develop/SKILL.md), que e o harness dedicado.

## Regras do repositorio

- Contexto do produto e fontes de verdade: [`../../rules/repo-context.md`](../../rules/repo-context.md)
- Limites de arquitetura e ownership por pasta: [`../../rules/architecture.md`](../../rules/architecture.md)
- Branch, worktree, commit e PR: [`../../rules/git-workflow.md`](../../rules/git-workflow.md)
- Validacao automatizada: [`../../rules/testing.md`](../../rules/testing.md)
- Harness local, `MSQ_DB_PATH` e regras anti-recursao: [`../../rules/harness.md`](../../rules/harness.md)
- Template de PR: [`./pr-template.md`](./pr-template.md)

## Objetivo

Levar uma mudanca do entendimento inicial ate um diff validado e, quando fizer sentido, pronto para commit/push/PR.

## Fluxo padrao

### 1. Classificar o trabalho

Antes de alterar codigo, decida em qual trilha a tarefa cai:

- **Fluxo normal deste repo**: implementar feature/hotfix/refactor/docs locais no `msq`.
- **Harness do produto**: validar `msq run`, adapters, backlog temporario, observabilidade, recursao, SQLite, ou outra falha operacional do proprio orquestrador.

Se for harness do produto, interrompa esta skill e siga `msq-develop`.

### 2. Ler o contexto correto

Leia somente o necessario, priorizando estas fontes:

1. `README.md` para setup/comandos
2. `docs/ROADMAP.md` para prioridade, dependencias e nomenclatura `Fxx/Hxx`
3. `docs/features/Fxx-*.md` ou `docs/hotfixes/Hxx-*.md` quando a demanda mapear para um item do backlog
4. `backlog.yaml` quando a mudanca tocar fluxo de feature, skills, prompt ou selecao de tool/model
5. arquivos reais em `src/` e `tests/` que serao alterados

Nao trate `docs/ARCHITECTURE.md` como fonte de verdade hoje; ele esta placeholder.

### 3. Isolar o trabalho

- Para feature, hotfix ou refactor de medio/alto risco, prefira worktree isolada.
- Para ajuste pequeno de docs/skill/regra no checkout ja preparado pelo usuario, trabalhar no checkout atual e aceitavel.
- Nunca crie worktree de dentro do fluxo `msq-develop`.

### 4. Planejar de forma curta

Monte um checklist enxuto antes de editar:

- comportamento que muda
- camadas/pastas afetadas
- testes ou validacoes necessarias
- docs que precisam acompanhar a mudanca

### 5. Implementar no layer correto

Siga os limites em `rules/architecture.md`:

- `src/commands/`: parsing de CLI e delegacao
- `src/core/`: backlog, orchestrator, adapters, skills, events
- `src/db/`: persistencia SQLite e migracoes
- `src/ui/`: componentes Ink, hooks e formatacao de tela
- `tests/`: cobertura por area impactada

Se a mudanca revelar bug operacional do produto, registre ou atualize o item correspondente em `docs/hotfixes/` em vez de esconder o problema no texto do PR.

### 6. Validar

Escolha a menor bateria que realmente prova a mudanca:

- baseline para codigo TS: `rtk npm run build`, `rtk npm test`, `rtk npm run typecheck`
- `rtk npm run lint` quando tocar `src/**/*.ts` ou `src/**/*.tsx`
- suites focadas com `rtk npx vitest run ...` para adapters, runner, db, backlog, ui, skills ou commands
- validacao live do `msq` somente quando o risco pedir prova ponta a ponta

Se rodar `msq`, `node dist/index.js`, `msq status` ou outro fluxo que persiste runs, use o banco global default (sem `MSQ_DB_PATH`) — assim o historico de conclusao de features fica acumulado num unico lugar. So use o override `MSQ_DB_PATH="$(pwd)/.metal-squad/app.db"` se o banco global falhar com erro de permissao dentro de um harness sandboxado (ver [`../../rules/harness.md`](../../rules/harness.md)).

### 7. Empacotar

Quando o usuario pedir publicacao ou quando a tarefa claramente inclui entrega pronta:

- commit somente depois da validacao relevante
- base de PR: `develop`
- incluir referencia a feature/hotfix/issue real quando existir
- usar o template em [`pr-template.md`](./pr-template.md)
- nunca mergear por conta propria

## Checklist operacional

- use `rtk` em todos os comandos shell
- mantenha a alteracao no menor conjunto coerente de arquivos
- atualize docs do produto quando o comportamento, contrato ou harness mudarem
- trate `exit 0` sem diff/run/log util como sinal fraco, nao como sucesso automatico
- se houver duvida entre fluxo normal e harness, prefira explicitar a diferenca antes de continuar

## Nao faca

- nao use esta skill para rodar nested `msq run` dentro de uma sessao que ja foi spawnada pelo `msq`
- nao copie instrucoes de outro repo para este skill folder
- nao trate placeholder docs como arquitetura confirmada
- nao abrir PR com claims de validacao que voce nao executou
