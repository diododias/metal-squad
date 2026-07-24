---
name: "msq-backlog-populate"
description: "Elabora a spec macro de uma nova funcionalidade do msq, substitui o backlog.yaml por essa unica feature e publica no catalogo com `msq backlog load`. Nao dispara `msq run` nem qualquer execucao de agente."
compatibility: "Requer metal-squad (msq) instalado/buildado no repo (`npm run build`) e SQLite gravavel no caminho global default."
---

## User Input

```text
$ARGUMENTS
```

Descreva a funcionalidade em linguagem natural (problema, objetivo, comportamento esperado). Se o usuario ja indicar um `Fxx` existente, trate como atualizacao daquela spec em vez de criar uma nova.

## Quando usar esta skill

Use `/msq-backlog-populate` quando o pedido for **so preparar o backlog** para uma
proxima feature — spec, backlog.yaml, catalogo — sem rodar o `msq` de verdade.

Nao use esta skill quando o pedido for desenvolver/implementar a feature de
ponta a ponta (nesse caso, use `/msq-develop`, que dispara `msq run`).

## Fluxo

### 1. Mapear o codebase antes de especificar

1. Leia `docs/ROADMAP.md` e o proximo numero `Fxx` livre em `docs/features/`.
2. Leia `backlog.yaml` atual para entender o schema em uso (v1/v2, campos
   `retry`, `workflow`, `budget`, `context`, `skills`).
3. Se a feature toca comportamento existente (orchestrator, adapters, db,
   resume, retry, budget), explore o codigo relevante em `src/` antes de
   escrever a spec — a spec deve citar arquivos/linhas reais, nao suposicoes.
   Use um agente `Explore` para isso quando o escopo for amplo, para nao gastar
   o proprio contexto em buscas exploratorias.
4. Verifique se ja existe doc relacionado em `docs/features/` ou
   `docs/hotfixes/` que a nova spec deveria referenciar ou nao duplicar.

### 2. Elaborar a spec macro

1. Escreva um doc `docs/features/F{XX}-{slug}.md` seguindo o formato ja usado
   no repo (ver `docs/features/F26-resume-pipeline-from-state.md` como
   referencia de estrutura):
   - `# F{XX} — Titulo`
   - `**Epic**`, `**Prioridade**`, `**Esforco**`, `**Depende de**`
   - `## Problema` (com referencias `arquivo:linha` do estado atual)
   - `## Objetivo`
   - `## Solucao` (subsecoes por sub-problema, com trechos de config/codigo
     ilustrativos quando ajudar)
   - `## Escopo tecnico` (lista objetiva de arquivos/modulos a tocar)
   - `## Criterios de aceite` (checklist verificavel)
2. Nao implemente nada em `src/` ou `tests/` nesta etapa — a spec e macro,
   quem detalha "como" e o passo de planning (`/speckit-plan`) do fluxo de
   desenvolvimento posterior.

### 3. Substituir o backlog.yaml

1. Remova **todas** as features atualmente presentes em `backlog.yaml`
   (epics/features antigos saem do arquivo — o `msq backlog load` consome
   apenas os itens presentes na fila; o catalogo SQLite mantém os itens ja
   publicados como fonte operacional.)
2. Adicione **uma unica** feature nova representando a spec do passo 2:
   - nao informe `id`: o `msq backlog load` sempre gera o ID canonico da plataforma
   - `title`: `FXX — Titulo`
   - `spec`: resumo inline do problema/objetivo/escopo/validacao (formato do
     `spec: >` ja usado no arquivo), **ou** `specFile` apontando pro doc criado.
     **IMPORTANTE**: o board (`catalog.ts`) exibe `data_json.spec`, nao o
     conteudo do arquivo referenciado por `specFile`. O `backlog load` ja lê o
     arquivo e popula `spec` em `data_json` automaticamente (fix aplicado em
     `applyBacklogSeed`). Se usar so `specFile` sem `spec` inline em repos
     sem esse fix, a descricao aparecera vazia no board — prefira sempre
     incluir `spec` inline ou garantir que o fix esta presente.
   - `tool`/`model`/`effort`: conforme pedido pelo usuario nesta conversa; se
     nao especificado, mantenha o default do repo (`tool: claude`,
     `effort: medium` já corresponde ao tier `sonnet` no adapter Claude — ver
     `EFFORT_MODEL` em `src/core/adapters/claude.ts`)
   - `context`: lista dos arquivos reais mapeados no passo 1 (doc da spec,
     docs relacionados, arquivos de codigo citados no "Escopo tecnico")
   - `dependsOn`: normalmente `[]` para uma feature isolada de infraestrutura
   - `retry`/`workflow`: preserve a estrutura padrao (`maxAttempts`,
     `backoffMs`, `onFail`, stages `specify/plan/tasks/implement/validate`)
     salvo instrucao explicita em contrario
3. Mantenha `version`, `repo`, `defaults` e `budget` do topo do arquivo como
   estavam, a menos que o pedido explicitamente peça mudar esses defaults.

### 4. Publicar no catalogo e consumir a fila (sem rodar o msq)

1. Garanta build atualizado: `npm run build` (ou `npm run dev -- backlog load`
   via `tsx` se preferir nao buildar).
2. Rode **apenas**:
   ```bash
   node dist/index.js backlog load
   ```
   ou, para conferir o diff antes de gravar:
   ```bash
   node dist/index.js backlog load --dry-run
   ```
3. **Nunca** rode `msq run`, `node dist/index.js run`, `npm run dev -- run ...`
   nem qualquer variante que dispare execucao real de agente dentro desta
   skill — o objetivo aqui e só preparar/catalogar o backlog (ver
   `.claude/rules/harness.md`, secao "Anti-recursao").
4. Confirme o output do `backlog load`:
   - features novas listadas corretamente com IDs `F-<8>`
   - os itens publicados desaparecem do `backlog.yaml`
   - nenhuma referencia de `dependsOn` quebrada

### 5. Validar sem executar

1. Como a mudanca e limitada a `backlog.yaml` + `docs/features/*.md` +
   `.claude/skills/`, nao ha obrigacao de rodar a suite completa de testes
   (ver `.claude/rules/testing.md`, secao "Quando tocar somente
   docs/skills/rules"). Valide:
   - `backlog.yaml` parseia sem erro no `backlog load` do passo 4
   - caminhos citados em `context`/`specFile` existem de fato no repo
   - consistencia com `docs/ROADMAP.md` (feature nao duplicada, numero `Fxx`
     nao reutilizado)
2. Se a spec envolve mudanca de schema (`src/core/backlog/schema.ts`), deixe
   isso explicito no doc como parte do "Escopo tecnico" — a alteracao de
   schema em si e trabalho de implementacao futura, nao desta skill.

### 6. Reportar ao usuario

1. Informe: doc de spec criado, feature(s) consumida(s) do backlog, feature
   nova adicionada, resultado do `backlog load`.
2. Deixe claro que nenhuma execucao (`msq run`) ocorreu — apenas
   spec + catalogo foram atualizados, prontos para um fluxo de
   desenvolvimento (`/msq-develop` ou staged workflow) rodar depois.

## Notas

- Esta skill nunca cria worktree por conta propria; se isolamento for
  necessario, quem chama a skill prepara o checkout antes.
- Esta skill nunca executa `msq run`/`node dist/index.js run` — apenas
  `msq backlog load` (ou seu `--dry-run`).
- `backlog.yaml` funciona como fila de entrada: um item publicado com sucesso e
  removido do arquivo; o catalogo SQLite permanece como fonte operacional.
- `backlog.yaml` nao tem campo `status` de feature — "Ready to start" e
  derivado em tempo de leitura a partir de `pipelines.done_json` no SQLite,
  populado pelo scheduler ao final de um pipeline real, nao por esta skill.
- Se o pedido do usuario ja vier com decisao de `tool`/`model`/`effort` para
  a feature (ex.: "configure sonnet com effort medium"), aplique isso
  diretamente nos campos `tool`/`effort` (e `model` apenas se um modelo
  especifico, fora do mapeamento padrao de effort, for pedido).
- **spec vs specFile no board**: `catalog.ts:154` usa `feature.spec ?? null`
  para preencher `description` no board. Quando so `specFile` e fornecido,
  o board mostra vazio. O `applyBacklogSeed` (desde fix em
  `src/db/backlogCatalog.ts`) le o arquivo e mergeia o conteudo em
  `data_json.spec` na hora do seed. Recursos ja catalogados sem `spec`
  precisam do script `scripts/backfill-spec-from-specfile.mjs` para
  retroativamente preencher o campo.
