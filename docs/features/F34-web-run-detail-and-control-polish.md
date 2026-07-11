# F34 — Web Run Detail & Control Polish

**Epic**: [E06 — Web Version](../epics/E06-web-version.md)
**Prioridade**: Alta
**Esforco**: High
**Depende de**: F32

## Problema

A F32 entregou um modo web funcional, mas uma revisao direta da interface (kanban overview, tela de detalhe de run com 7 abas, e a tela de preview de uma feature ainda nao iniciada) expos lacunas reais de UX que nao existem na mesma extensao na TUI local. As abas "Workflow" e "Tasks" do detalhe de run mostram mensagens genericas ou vazias mesmo quando ha dados reais de breakdown por stage disponiveis em outra tentativa da mesma feature. Resolucao de gate/stage-request so existe num painel `Gates.js` separado, sem nenhuma acao inline na tela de detalhe da run bloqueada — o usuario precisa sair do detalhe para agir. Os cards do kanban de runs em execucao/bloqueados sao estaticos, sem tokens ao vivo, tempo decorrido ou ultima linha de output, mesmo o servidor ja transmitindo esses eventos via WebSocket. Nao existe nenhuma visualizacao de "o que mudou no codigo" em um run `done`, que e o principal artefato de valor de um orquestrador que gera codigo. Nao ha busca ou filtro no kanban conforme o backlog cresce. O indicador de conexao no header so diz "offline" de forma ambigua, sem distinguir nunca-conectado, reconectando apos falha de heartbeat, ou desconectado intencionalmente. E a tela de preview de uma feature TODO nao mostra se uma tentativa anterior da mesma feature falhou (ex.: `feat-08` pode aparecer simultaneamente em TODO e no historico de FALHA sem nenhuma ligacao visivel entre as duas), nao verifica se as dependencias declaradas (`Depende de: Fxx`) estao de fato satisfeitas, nem oferece uma estimativa de custo/tokens antes de iniciar — alem de apresentar os dados em um grid de 2 colunas diferente do tab bar usado na tela de run em andamento, quebrando a consistencia entre os dois estados da mesma feature.

## Objetivo

Fechar essas lacunas de UX no modo web sem introduzir nenhuma dependencia nova de infraestrutura (sem worktrees por run, sem novos adapters): reaproveitar dados que ja existem no pipeline (task runs por stage, eventos do event bus, catalogo de features, historico de runs no SQLite, git do proprio repo) e expor uma consulta de historico completo por feature que hoje nao existe (`listRunsForTui` deduplica para o run mais recente por feature/repo). O resultado deve ser: abas de detalhe de run que mostram dados reais ou uma mensagem explicita de "nao aplicavel nesta etapa"; resolucao de gate/stage-request inline na tela de detalhe de uma run bloqueada; cards do kanban com telemetria ao vivo; uma nova aba "Changes" com diff/arquivos alterados; busca e filtro no kanban; um indicador de conexao com estados claros; e uma tela de preview de feature que mostra tentativas anteriores, status de dependencias, estimativa de custo e permite override pontual de tool/model/effort — com uma apresentacao mais consistente com a tela de run em andamento.

## Escopo entregue

### 1. Historico completo de runs por feature (infraestrutura)

- Nova funcao `listRunHistoryForFeature(repoId, featureId, limit = 20)` em `src/db/repo.ts`, que retorna **todas** as runs de uma feature (nao apenas a mais recente), ordenadas por `started_at DESC`, reaproveitando os mesmos joins de token usage/pipeline totals ja usados em `listRunsForTui`.
- `listRunsForTui` **nao muda de comportamento** (continua deduplicando via `WITH latest AS (SELECT MAX(id) AS id FROM runs GROUP BY repo_id, feature_id)` para o overview do kanban); a nova funcao e um complemento, nao uma substituicao, para nao quebrar consumidores existentes (TUI, `buildMsqWebState`).
- Novo tipo `RunHistoryEntry` (subset de `RunSummary` + `stage`, `rawStatus`, `endedAt`, `pipelineResumeSummary`) exportado de `src/db/repo.ts`.
- Nova mensagem WebSocket `subscribe:runHistory { featureId }` no servidor, respondendo com `{ type: 'run:history', payload: { featureId, runs: RunHistoryEntry[] } }`; usada tanto pelo `RunDetail` (para localizar breakdown por stage entre tentativas) quanto pelo `FeaturePreview` (para o item 5a).
- `computeRunBreakdown` continua operando sobre `run_events` de um `runId` especifico; nao precisa mudar — o consumo passa a escolher, quando aplicavel, o `runId` da tentativa mais recente com dados de stage reais em vez de assumir que so existe uma run por feature.

### 2. Dados reais nas abas Workflow/Tasks + nova aba Changes

- **Workflow/Tasks**: quando os task runs da run atual estiverem vazios mas existir uma tentativa anterior da mesma feature com breakdown populado (via o historico do item 1), a UI busca e exibe o breakdown da tentativa anterior mais recente com dados, com um aviso `"Showing task breakdown from previous attempt (run #<id>, <status>)"`. Quando **nenhuma** tentativa (atual ou anterior) tiver breakdown, a mensagem deixa de ser a string vazia/generica atual e passa a ser explicita: `"Task breakdown not applicable at this stage — no stage session has run yet for <featureId>."`.
- Implementado inteiramente no frontend (`RunDetail.js`, casos `'workflow'` e `'tasks'` do render de secao), consumindo o novo `run:history` do item 1; nenhuma mudanca de schema de backlog.
- **Nova aba "Changes"** (entre "Tasks" e "Live Output"): novo endpoint HTTP `GET /api/runs/:runId/changes` (autenticado) e/ou mensagem WS `subscribe:runChanges { runId }`. Implementacao: dado o `startedAt`/`endedAt` do run, roda `git status --porcelain` e `git diff --stat` (com `git diff` completo sob demanda ao expandir um arquivo) no working tree do repo resolvido, filtrando por arquivos cujo `mtime`/commits no branch atual caem dentro da janela do run quando possivel; fallback simples: mostrar o diff/status atual do working tree sem filtro temporal quando a run for a mais recente e ainda nao houver commit desde entao. Superficie: lista de arquivos alterados (added/modified/deleted), estatisticas de linhas (`+N -M`), branch atual, e link para PR se puder ser inferido do remoto. Quando o `git` nao estiver disponivel ou o diretorio nao for um repo git, a aba mostra `"No git repository detected for this run's working directory."` em vez de ficar vazia.
- Este item consome deliberadamente o repo de trabalho real (nao um worktree isolado), ja que o codebase nao usa worktrees por run hoje; o doc registra essa limitacao explicitamente (diffs podem incluir mudancas nao relacionadas se o usuario editar o repo manualmente durante a run).

### 3. Resolucao de gate/stage-request inline + telemetria ao vivo no kanban

- Pause/resume/abort **ja sao** botoes visiveis no header do `RunDetail.js` — nao e uma lacuna e nao deve ser re-implementado. A lacuna real e que resolucao de gate/stage-request so existe hoje no painel separado `Gates.js`. Adicionar ao header do `RunDetail`, quando a run atual estiver bloqueada (`run.pendingStageRequestId` ou gate aberto para a feature): botoes `approve`/`skip`/`retry` (gate) ou uma caixa de resposta inline (`resolveStageRequest`), reaproveitando as mesmas acoes WS ja usadas por `Gates.js`.
- `KanbanCard.js`: para runs em `status === 'running'` ou `'blocked'`, subscrever a `run:output` (ja existe `subscribe:output`) e a `tokens:update` para exibir tempo decorrido (tick local, sem round-trip), tokens correntes, e a ultima linha de output truncada (`source !== 'heartbeat'`). Isso exige que o `app.js` mantenha um subscribe automatico para todo `runId` visivel na coluna "IN PROGRESS/BLOCKED" do kanban, com unsubscribe ao sair da tela ou quando o run sai da coluna.

### 4. Busca/filtro no kanban + indicador de conexao com estados claros

- `Kanban.js`: nova barra de filtro acima das colunas — busca por `featureId`/titulo do catalogo e selects para tool, model (via catalogo), status (todo/running/blocked/done/failed) e prioridade (via `feature.priority`, quando declarada no backlog). Filtragem 100% client-side sobre `state.runs` + `state.pendingFeatures`, sem novo endpoint.
- `app.js` (`useWebSocket`): o hook hoje so expoe `connected: boolean`. Passa a expor um estado enumerado `connectionState: 'never-connected' | 'live' | 'reconnecting' | 'disconnected'` (com `disconnectedSince`/`reconnectingSince`), derivado do ciclo `open`/`close`/heartbeat — a deteccao de heartbeat perdido de F33 e client-observavel pelo tempo desde a ultima mensagem recebida, nao apenas pelo `close` do socket.
- `Header.js`: substitui o texto fixo `connected ? 'connected' : 'offline'` por um indicador com rotulo e duracao: `"live"`, `"reconnecting (Ns)"`, `"disconnected (Ns)"`, `"never connected"`.

### 5. Feature preview com paridade de detalhe de run

- **5a. Tentativa anterior falha/cancelada**: `FeaturePreview.js` consome `run:history` (item 1) filtrado por `featureId`; se existir uma entrada com status `failed`/`aborted`, exibe um bloco `"Previous attempt failed at <stage> — view run #<id>"` com um link que abre o `RunDetail` daquele run historico em modo somente-leitura (sem `subscribe:output` ativo, so leitura de `run:history`/eventos ja persistidos).
- **5b. Chip de status de dependencia**: usa `feature.dependsOn` (ja existente no catalogo de features); para cada dependencia, verifica se ha uma run `done` para aquele `featureId`. Renderiza chip `✓ Fxx done` ou `✗ Fxx not done`. Quando alguma dependencia nao esta satisfeita, o botao "start feature" mostra um aviso de confirmacao (`"Fxx is not done yet — start anyway?"`) em vez de bloquear silenciosamente (o backend ja permite iniciar fora de ordem; a UI so passa a avisar).
- **5c. Estimativa de tokens/custo**: nova consulta agregada `getHistoricalTokenStatsForFeatureProfile(tool)` em `src/db/repo.ts`, que busca media/mediana de `total_tokens` entre runs concluidas (`done`) com o mesmo `tool`. **Limitacao registrada**: a tabela `runs` nao armazena `model`/`effort` por run hoje (apenas `tool`); por isso a estimativa e exibida como "media historica de execucoes com esta tool" com aviso de que model/effort podem ter mudado, nao uma media exata por combinacao — normalizar isso exigiria persistir `model`/`effort` por run, o que fica fora de escopo aqui.
- **5d. Override pontual de tool/model/effort**: `FeaturePreview.js` ganha campos editaveis (selects) para tool/model/effort, pre-preenchidos com os valores do backlog; `action:startFeature` no protocolo WS ganha campos opcionais `{ tool?, model?, effort? }` repassados ao spawn de `msq run --feature <id>` como flags de override (sem gravar no `backlog.yaml`).
- **5e. Paridade de layout com tab bar**: `FeaturePreview.js` hoje usa um layout `preview-grid` de 2 colunas (Feature Spec | Feature Config) mais uma secao Tasks full-width, diferente do tab bar do `RunDetail.js`. Passa a usar o mesmo componente de tab bar (abas: Feature Spec / Feature Config / Tasks / Previous Attempts / Dependencies), reduzindo a divergencia visual entre "feature ainda nao iniciada" e "run em andamento" da mesma feature.

### 6. Web consome o modelo semantico de tema (F10), sem bloquear nele

- Novo endpoint/estado que le `config.theme` (`~/.config/metal-squad/config.json`, mesmo campo da F10) e retorna o nome do tema ativo e os papeis semanticos resolvidos (`text/primary/success/warning/error/muted/accent/focus`) via os mesmos `BUILTIN_THEMES` de `src/ui/theme/builtins.ts` (reaproveitados, sem duplicar a definicao das cores, sem mudar comportamento da TUI).
- `src/web/static/styles.css` passa a definir os custom properties de `:root` como valores calculados a partir do tema resolvido enviado pelo servidor, substituindo o hardcode atual de um unico tema escuro.
- Fallback: se a config nao existir ou o tema for invalido, usa o tema `default` (mesmo comportamento de fallback da F10 na TUI).
- Fora de escopo: um seletor de tema dentro da propria UI web nesta primeira entrega — a troca continua sendo feita editando a config; a app web so passa a refletir o valor configurado.

## Modelo esperado

```ts
// src/db/repo.ts
export interface RunHistoryEntry {
  runId: number;
  repoId: string;
  featureId: string;
  tool: 'claude' | 'codex' | 'opencode';
  stage: string | null;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  totalTokens: number | null;
  pipelineResumeSummary: string | null;
}

export function listRunHistoryForFeature(
  repoId: string,
  featureId: string,
  limit?: number,
): RunHistoryEntry[];

export function getHistoricalTokenStatsForFeatureProfile(
  tool: string,
): { sampleSize: number; avgTotalTokens: number | null; medianTotalTokens: number | null };

// src/web/types.ts
export type WebSocketClientMessage =
  | /* ...existing... */
  | { type: 'subscribe:runHistory'; featureId: string }
  | { type: 'unsubscribe:runHistory'; featureId: string }
  | { type: 'subscribe:runChanges'; runId: number }
  | { type: 'unsubscribe:runChanges'; runId: number }
  | {
      type: 'action:startFeature';
      featureId: string;
      overrides?: { tool?: string; model?: string; effort?: string };
    };

export type WebSocketServerMessage =
  | /* ...existing... */
  | { type: 'run:history'; payload: { featureId: string; runs: RunHistoryEntry[] } }
  | {
      type: 'run:changes';
      payload: {
        runId: number;
        branch: string | null;
        remoteUrl: string | null;
        files: { path: string; status: 'added' | 'modified' | 'deleted'; additions: number; deletions: number }[];
        notApplicableReason: string | null;
      };
    };

export interface ThemeSnapshot {
  name: 'default' | 'dark' | 'light' | 'minimal';
  roles: Record<'text' | 'primary' | 'success' | 'warning' | 'error' | 'muted' | 'accent' | 'focus', string>;
}
```

## Areas tecnicas afetadas

- `src/db/repo.ts` — nova `listRunHistoryForFeature`, `getHistoricalTokenStatsForFeatureProfile`; `listRunsForTui` inalterada.
- `src/web/server.ts` — novas mensagens WS (`subscribe:runHistory`, `subscribe:runChanges`), novo endpoint `GET /api/runs/:runId/changes` (ou equivalente via WS), leitura de git via `child_process` no working tree do repo, endpoint/estado de tema.
- `src/web/state.ts` — inclusao opcional de snapshot de tema em `MsqWebState` (ou endpoint separado).
- `src/web/types.ts` — novos tipos `RunHistoryEntry`, `run:history`, `run:changes`, `ThemeSnapshot`, override em `action:startFeature`.
- `src/web/static/app.js` — `connectionState` enumerado, subscribe automatico de output/tokens para cards em execucao, filtro/busca de kanban.
- `src/web/static/components/RunDetail.js` — nova aba "Changes", fallback explicito em Workflow/Tasks, acoes de gate/stage-request inline no header.
- `src/web/static/components/FeaturePreview.js` — tab bar compartilhado, bloco de tentativa anterior, chip de dependencia, estimativa de tokens, campos de override.
- `src/web/static/components/Kanban.js`, `KanbanCard.js` — barra de filtro/busca, telemetria ao vivo nos cards.
- `src/web/static/components/Header.js` — indicador de conexao com estados.
- `src/web/static/styles.css` — custom properties derivadas do tema resolvido em vez de hardcode.
- `src/ui/theme/builtins.ts` — possivel reexport/uso compartilhado (sem mudanca de comportamento na TUI).
- `docs/ROADMAP.md` — nova entrada na Fase 6.
- `tests/web/` — cobertura de `listRunHistoryForFeature`, novo endpoint/mensagens WS, fallback de git ausente.

## Criterios de aceite

- [x] `listRunHistoryForFeature` retorna todas as runs (nao so a mais recente) de uma feature, ordenadas por `started_at DESC`, sem alterar o comportamento de `listRunsForTui`.
- [x] Aba "Workflow"/"Tasks" mostra breakdown real de uma tentativa anterior quando a run atual nao tem dados, e uma mensagem explicita de "nao aplicavel nesta etapa" quando nenhuma tentativa tem dados (nunca uma string vazia/generica).
- [x] Nova aba "Changes" no detalhe de run mostra arquivos alterados, estatisticas de diff e branch/remote quando o diretorio e um repo git valido; mostra mensagem explicita quando nao e.
- [x] Header do detalhe de run ganha acoes inline de resolucao de gate/stage-request quando a run atual estiver bloqueada, sem depender apenas do painel `Gates.js` separado (pause/resume/abort permanecem como ja estao).
- [x] Cards do kanban em "IN PROGRESS/BLOCKED" mostram tokens atualizados, tempo decorrido e ultima linha de output, atualizados em tempo real via WebSocket.
- [x] Kanban overview tem busca por id/titulo e filtros por tool, model, status e prioridade, aplicados client-side.
- [x] Indicador de conexao no header distingue "never connected", "reconnecting (Ns)", "disconnected (Ns)" e "live".
- [x] Tela de preview de feature TODO mostra tentativa anterior falha/cancelada com link para o run, quando existir.
- [x] Tela de preview mostra chip de status para cada dependencia declarada (`dependsOn`) e avisa (sem bloquear) ao iniciar com dependencia nao satisfeita.
- [x] Tela de preview mostra estimativa de tokens historica (media/mediana por tool) com aviso de limitacao quando model/effort nao puderem ser cruzados com precisao.
- [x] Tela de preview permite override pontual de tool/model/effort ao iniciar, sem alterar `backlog.yaml`.
- [x] Tela de preview usa o mesmo componente de tab bar do detalhe de run em vez do `preview-grid` atual de 2 colunas.
- [x] Web le o tema ativo de `~/.config/metal-squad/config.json` (mesmo campo `theme` da F10) e aplica os papeis semanticos correspondentes no CSS, com fallback seguro para `default`.
