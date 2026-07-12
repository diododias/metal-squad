# Prompt para reprodução do design — msq web

Copie e cole o texto abaixo (a partir de "Contexto do produto") em uma conversa nova com Claude.

---

Contexto do produto: `msq` (metal-squad) é um orquestrador de pipelines de desenvolvimento assistido por IA. Ele roda features via adapters headless (codex, claude, opencode), cada uma passando por stages (specify → plan → tasks → implement → validate), com gates de aprovação humana entre stages, tokens/contexto monitorados, e persistência de runs em SQLite. Preciso do redesign da interface **web** dessa ferramenta (não a TUI de terminal, que não deve mudar).

Quero que você construa um mockup HTML completo (single-file, CSS e JS inline, sem dependências externas) de uma **plataforma web**, não um console/terminal emulado. Isso significa: navegação persistente, páginas próprias por seção, hierarquia visual de página (header, breadcrumb, ações) — não uma janela única que troca conteúdo internamente feito app de terminal.

## Direção estética (obrigatória, não alterar)

Referência: terminal hacker dos anos 90 (IBM/DEC monocromático, BBS), mas sóbrio — não é "Matrix neon", não é glassmorphism. Base é escala de cinza; cor é usada **só como sinal semântico de estado**, nunca decorativa.

Tokens de cor (CSS vars, use exatamente estes):

```
--bg-base: #0a0a0b       (fundo da aplicação)
--bg-panel: #151517      (painéis, cards, sidebar)
--bg-panel-alt: #1c1c1f  (hover, linha alternada)
--border-dim: #2a2a2d    (bordas padrão)
--border-strong: #4a4a4e (bordas de foco/painel ativo)
--text-primary: #d4d4d8
--text-dim: #7a7a80
--text-faint: #4d4d52
--accent-ok: #5fbf6f      (done / success)
--accent-warn: #d1b34a    (awaiting / pending / warning)
--accent-danger: #d1615f  (failed / abort / erro)
--accent-info: #5fa8bf    (running / active / live)
```

Tipografia: 100% monoespaçada em toda a UI (`IBM Plex Mono`, `JetBrains Mono`, `Fira Code`, fallback `ui-monospace`/`Menlo`/`Consolas`). Sem pesos além de regular/bold. Densidade de informação alta é desejada — é uma ferramenta de operador técnico, não um app consumer; não "arejar" demais o layout.

## Arquitetura de informação

Layout: **sidebar fixa à esquerda + área de conteúdo à direita**. A sidebar existe em todas as páginas e contém:
- Marca "msq" no topo
- Itens de navegação, cada um levando a uma página própria (não painel/modal):
  - **Board** — kanban de features (tela inicial)
  - **Runs** — histórico completo, tabela filtrável
  - **Gates** — aprovações pendentes centralizadas de todas as features (com badge de contagem)
  - **Config** — skills, tools, backlog
- Rodapé da sidebar: status do sistema (live/tokens totais) + botão fixo `[?] atalhos`

Páginas a construir:

**Board** (`/board`, tela inicial): 4 colunas — Todo / In progress-blocked / Done / Falha-canceled. Cada card tem: id da feature, título, tags de tool·model·effort, e uma barra lateral de 3px na cor semântica do status. Header da página com busca e filtros (tool/model/status). Clicar num card **navega** para a página Run Detail (não abre painel).

**Runs** (`/runs`): tabela filtrável/ordenável com todos os runs: feature, status (pill colorido), tool, model, tokens, elapsed, quando. Clicar na linha leva à página Run Detail.

**Gates** (`/gates`): lista de cards, um por gate pendente, cada um mostrando a pergunta de aprovação e ações rápidas inline (advance/hold/retry) sem precisar abrir o run inteiro. Borda lateral em `--accent-warn`.

**Config** (`/config`): grid de blocos — Skills declaradas (com tag de origem repo/global/external/builtin), Tools disponíveis, Resumo do backlog (read-only).

**Run Detail** (`/runs/:id`): página própria com:
- Breadcrumb real: `Runs / feat-62`
- Header: título da feature, id, hash de sessão, botões de ação (pause / abort com confirmação / voltar)
- Banner de aprovação quando há gate pendente: pergunta em destaque, uma linha de explicação do que cada ação implica, botões advance/hold/retry
- Grid de métricas: status, tool, model, session tokens, pipeline tokens, contexto, elapsed
- Breadcrumb de stages: `▸ specify 2/2 → plan → tasks → implement → validate`
- Tabs de conteúdo: Run Summary, Feature Spec, Workflow, Feature Config, Changes

## Hierarquia de ações (aplicar em todos os botões do app)

| Tipo | Estilo |
|---|---|
| Primária (ação esperada) | preenchida, `--accent-ok` ou `--accent-info` |
| Neutra/segura | outline `--border-strong`, sem cor semântica |
| Recovery | outline `--accent-warn` |
| Destrutiva | preenchida `--accent-danger`, com aviso de confirmação (ex.: "abort (hold 1s)") |
| Pausa/controle | outline `--text-dim` |

Regra especial: quando o valor de "contexto" passar de 100% (ex.: 329.2% of 256.0k), o número fica em `--accent-danger` com um `⚠` antes, e pulsa lentamente (animação de opacidade, ciclo de ~2s) acima de 150%.

## Sistema de atalhos (descobrível, não escondido)

- Botão `[?]` fixo na sidebar (e tecla `?`) abre um overlay modal listando **todos** os atalhos do app, agrupados por contexto: Navegação global, Board, Run detail, Aprovação de gate.
- Atalhos de navegação entre páginas no padrão "g depois de letra" (`g b` = Board, `g r` = Runs, `g g` = Gates, `g c` = Config), como em GitHub/Linear.
- Fechar overlay com `Esc` ou clique fora do modal.

## Entregável

Um único arquivo `.html` autocontido (CSS e JS inline, sem build step, sem frameworks externos) com:
1. Sidebar funcional trocando entre as 5 páginas via JS (mostrar/esconder, sem reload)
2. As 5 páginas com dados de exemplo plausíveis para o domínio (features tipo `feat-XX`, tools `codex`/`claude`, stages do pipeline)
3. Overlay de atalhos funcional (abre com `?`, fecha com `Esc`)
4. Tabs internas da página Run Detail funcionando via JS
5. Hover states e cursor pointer em elementos clicáveis (cards, linhas de tabela, itens de nav)

Não é necessário conectar a dados reais — é um mockup visual/interativo para validar a direção antes de qualquer implementação em código de produção.
