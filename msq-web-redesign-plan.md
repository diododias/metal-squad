# msq web — Plano de Redesign (v2: plataforma, não console)

Escopo: apenas a versão **web**. Nenhuma mudança na TUI Ink. Plano antes de implementação, conforme regra do projeto.

## 0. Mudança em relação à v1

A v1 mantinha tudo dentro de uma "janela única" tipo terminal (board e run detail como se fossem telas de um app de console, sem navegação real). Feedback: manter a **estética** (cinza, monospace, sinais semânticos de cor, clima hacker anos 90), mas trocar a **estrutura** por uma plataforma web de verdade — com navegação persistente, páginas próprias e URLs implícitas por seção, não uma única tela que troca conteúdo internamente.

## 1. Paleta e tipografia (mantidas da v1, validadas)

| Token | Hex | Uso |
|---|---|---|
| `--bg-base` | `#0a0a0b` | fundo da aplicação |
| `--bg-panel` | `#151517` | painéis, cards, sidebar |
| `--bg-panel-alt` | `#1c1c1f` | hover, linha alternada |
| `--border-dim` | `#2a2a2d` | bordas padrão |
| `--border-strong` | `#4a4a4e` | bordas de foco/painel ativo |
| `--text-primary` | `#d4d4d8` | texto principal |
| `--text-dim` | `#7a7a80` | texto secundário/metadados |
| `--text-faint` | `#4d4d52` | placeholders, desabilitado |
| `--accent-ok` | `#5fbf6f` | done/success |
| `--accent-warn` | `#d1b34a` | awaiting/pending/warning |
| `--accent-danger` | `#d1615f` | failed/abort/erro |
| `--accent-info` | `#5fa8bf` | running/active/live |

Monoespaçada em 100% da UI. Sem textura de scanline forçada na v2 — fica opcional/toggle, porque numa plataforma com mais páginas ela pode cansar a leitura em uso prolongado.

## 2. Arquitetura de informação (nova)

Layout padrão de plataforma: **sidebar fixa à esquerda + área de conteúdo à direita**, com header de página dentro da área de conteúdo (título, ações, filtros contextuais). Isso substitui o antigo "topbar + troca de tela única".

### 2.1 Sidebar (persistente em todas as páginas)

- Marca `msq` no topo.
- Itens de navegação, cada um levando a uma página própria:
  - **Board** — kanban de features (tela inicial)
  - **Runs** — histórico completo, tabela filtrável
  - **Gates** — aprovações pendentes centralizadas, de todas as features
  - **Config** — skills, tools, backlog
- Indicador de status do sistema no rodapé da sidebar (live/tokens totais).
- Atalho de ajuda `[?]` fixo no rodapé da sidebar, sempre acessível.

### 2.2 Páginas

**Board** (`/board`, tela inicial)
- Mantém as colunas Todo/In Progress/Done/Falha, mas agora dentro da área de conteúdo com header próprio (busca, filtros de tool/model/status).
- Clicar num card **navega** para a página de Run Detail (não abre um "painel dentro do mesmo console").

**Run Detail** (`/runs/:id`)
- Página própria com breadcrumb real: `Runs / feat-62`.
- Header da página com título, id, ações (pause/abort/close) — close aqui significa "voltar para Runs", não fechar uma janela.
- Banner de aprovação, grid de métricas e tabs continuam como na v1 (isso já funcionava bem), mas agora vivem dentro do layout de página, não de uma janela flutuante estilo terminal.

**Runs / Histórico** (`/runs`)
- Tabela filtrável e ordenável de todos os runs (não só os 3-4 recentes do board): feature, status, tool, model, tokens, elapsed, data.
- Cada linha leva à página de Run Detail.

**Gates** (`/gates`)
- Lista centralizada de todos os gates aguardando decisão em qualquer feature — hoje isso só existia como um painel lateral pequeno e vazio no board.
- Cada gate mostra a pergunta pendente e ações rápidas (advance/hold/retry) inline, sem precisar abrir o run inteiro.

**Config** (`/config`) — detalhada em `#5.1`, cobre toda a superfície de configuração real do software (mapeada no código: `src/config/index.ts`, `src/core/backlog/schema.ts`, `src/core/backlog/prompt.ts`, `src/core/skills/registry.ts`).

### 5.1 Config — mapa completo de configurações e sub-navegação

A página Config ganha sub-abas próprias (mesma convenção visual das tabs do Run Detail), porque a superfície de configuração do `msq` tem várias camadas com precedência distinta. Fonte da verdade para cada campo:

| Sub-aba | Cobre | Camada / arquivo |
|---|---|---|
| **Runtime** | `concurrency`, `toolTimeoutMs`, `staleRunThresholdMinutes`, `promptContextCharLimit`, `workflow.autoAdvanceStages`, `workflow.pollIntervalMs`, `web.host/port/auth`, caminho do DB (`MSQ_DB_PATH`) | `~/.config/metal-squad/config.json` (global) + `.msq/config.yaml` (override por repo) — `src/config/index.ts` |
| **Defaults** | `tool`/`model`/`effort`/`skills`/`stageSkills` em cadeia de precedência: repo config → `backlog.yaml defaults:` → efetivo resolvido | `mergeExecutionDefaults()` em `src/config/index.ts` |
| **Features & Prompts** | Por feature: `tool/model/effort/maxTokens/autoStart/dependsOn`, `workflow.mode/syncTasksToBacklog`, `workflow.approvals.channel/autoAdvance`, `workflow.sessionPolicy.mode/alwaysIsolatedStages`, `retry.maxAttempts/backoffMs/onFail/fallback[]`, e por stage: skills resolvidas + **`workflow.stepGuidance.<stage>.skills`** (skills extras) e **`workflow.stepGuidance.<stage>.prompt`** (texto livre customizado do step — é o que o usuário pediu para editar) | `backlog.yaml` por feature — `src/core/backlog/schema.ts` (`FeatureSchema`, `WorkflowSchema`, `StepGuidanceSchema`) |
| **Skills** | Catálogo de skills descobertas com origem (repo/global/external/builtin) — somente leitura; skills de origem repo são arquivos locais editáveis fora da UI | `src/core/skills/registry.ts` (precedência repo > global > external > builtin) |
| **Notifications** | Canais (telegram/slack/discord/webhook/desktop) e quais eventos disparam notificação (`run:start`, `gate:created`, `run:failed`, `budget:alert`, `run:done`, `stage:approval`, `stage:input`) | `config.json.notifications` |
| **Budget** | `budget.maxTokens`/`perFeatureMaxTokens` (backlog), `budget.alertAtPercent`/`lastResetDate` (runtime), override de `maxTokens` por feature | `backlog.yaml` + `config.json.budget` |

Cada campo mostra uma tag de origem (`global`/`repo`/`backlog`/`feature`) para deixar explícito qual camada está vencendo — hoje isso só existia via `msq config show --json`, sem UI.

**Editor de prompt por step** (o pedido central desta fase): dentro de Features & Prompts, um stepper horizontal lista os stages da feature selecionada (`specify → plan → tasks → implement → validate`, dinâmico conforme `workflow.stages`). Selecionar um stage mostra: as skills já resolvidas para ele (via `stageSkills`), um campo para adicionar skills extras (`stepGuidance.skills`), e uma textarea grande para o prompt customizado (`stepGuidance.prompt`) — com uma nota explicando que esse texto é concatenado ao final do prompt montado (skills + `stepGuidance`), separado por `---`, conforme `buildPrompt()` em `src/core/backlog/prompt.ts`.

## 3. Hierarquia de ações (mantida da v1)

| Tipo | Estilo | Exemplos |
|---|---|---|
| Primária | preenchida, `--accent-ok`/`--accent-info` | `advance` |
| Neutra/segura | outline `--border-strong` | `hold`, voltar |
| Recovery | outline `--accent-warn` | `retry` |
| Destrutiva | preenchida `--accent-danger`, exige confirmação | `abort` |
| Pausa/controle | outline `--text-dim` | `pause` |

Contexto acima de 100% continua sinalizado em `--accent-danger` com `⚠`, pulsando acima de 150%.

## 4. Atalhos — sistema descobrível (mantido da v1)

- `[?]` fixo na sidebar abre overlay global de atalhos, agrupado por página.
- Atalhos de navegação entre páginas (`g b` = go board, `g r` = go runs, `g g` = go gates, `g c` = go config — padrão "g depois de letra" comum em apps tipo GitHub/Linear) substituem o antigo `1-8 jump` que só fazia sentido dentro de uma tela única.
- Atalhos específicos de Run Detail (`Tab` entre subtabs, `Ctrl+S`, `Ctrl+L`) continuam.

## 5. Entregável desta fase

Mockup HTML (`msq-web-redesign-mockup.html`) com sidebar fixa e navegação real entre as 5 páginas: Board, Run Detail, Runs (histórico), Gates, Config — mesma paleta/tipografia aprovadas, layout de plataforma web.

## 6. Próximos passos (após aprovação)

1. Definir roteamento real (client-side router) em `src/web/`.
2. Extrair sidebar como componente compartilhado entre páginas.
3. Implementar página de Gates centralizada consumindo o mesmo estado que hoje só alimenta o painel do board.
4. Overlay de atalhos com escopo por página ativa.
