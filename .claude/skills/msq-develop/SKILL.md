---
name: "msq-develop"
description: "Desenvolve a proxima feature do backlog usando msq run + speckit. Prepara o backlog.yaml, dispara o msq, valida resultado, e abre PR."
compatibility: "Requer metal-squad (msq) instalado e linkado globalmente, e spec-kit configurado no projeto."
---

## User Input

```text
$ARGUMENTS
```

Se o usuario especificou uma feature (ex: "feat-02", "F03"), use essa. Caso contrario, identifique automaticamente a proxima feature a ser desenvolvida.

## Fluxo

### 1. Identificar a proxima feature

1. Leia `docs/ROADMAP.md` para entender a ordem das fases e features
2. Leia o grafo de dependencias no final do ROADMAP para saber quais features estao disponiveis
3. Verifique o estado atual do projeto:
   - `git log --oneline -20` para ver quais features ja foram implementadas (commits com `feat(...)`)
   - Leia os arquivos em `src/` para confirmar o que ja existe
4. Identifique a proxima feature que:
   - Tem todas as dependencias ja implementadas
   - Ainda nao foi implementada
   - Tem a maior prioridade (Critica > Alta > Media > Baixa)
5. Informe ao usuario qual feature sera desenvolvida e por que

### 2. Preparar o backlog.yaml

1. Leia a spec da feature em `docs/features/F{XX}-*.md`
2. Monte um backlog temporario valido para teste do `msq`:
   - preserve a feature alvo
   - preserve ou reconstrua a cadeia minima de `dependsOn` necessaria para ela
   - se optar por backlog reduzido, valide que nenhum `dependsOn` aponta para ID ausente
3. Atualize o `backlog.yaml` com a feature configurada:
   - `id`: o id da feature (ex: `feat-02`)
   - `title`: titulo da feature
   - `tool`: `claude` (default)
   - `effort`: conforme spec da feature (low/medium/high)
   - `spec`: descricao completa inline com:
     - ESCOPO detalhado com cada mudanca necessaria em cada arquivo
     - Lista de arquivos de contexto relevantes
     - CRITERIOS DE ACEITE da spec
     - Instrucao para usar `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`
   - `dependsOn`: lista de features das quais depende (se houver)
4. Se o backlog temporario ficar inconsistente, pare o fluxo e registre o problema em `/docs` como feature ou hotfix do proprio `msq`

### 3. Preparar o checkout atual

1. Trabalhe no checkout atual onde o fluxo foi iniciado.
2. Nao crie `worktree` dentro deste fluxo.
3. Se isolamento for desejado, a IA/ferramenta responsavel prepara o checkout antes de chamar `msq-develop`.
4. No checkout atual:
   - Atualize o `backlog.yaml`
   - `npm install --silent`
   - `npm run build`

### 4. Executar msq run

1. No checkout atual, execute:
   ```bash
   node dist/index.js run --feature feat-XX
   ```
   Isso vai spawnar um `claude` headless que usara speckit para implementar a feature.
2. Timeout: 10 minutos (600000ms)
3. Capture o output

### 5. Validar resultado

1. Verifique se o `msq run` terminou com sucesso (exit code 0)
2. Verifique evidencias minimas de execucao real:
   - houve nova `run` em `msq status` ou no banco SQLite
   - houve output util do executor
   - houve commits, diff ou artefatos produzidos no checkout atual
3. No checkout atual, execute:
   - `npx vitest run` — todos os testes devem passar
   - `npx tsc --noEmit` — sem erros de tipo
4. `git log --oneline` para ver os commits feitos
5. Se `msq run` retornar `0` mas nao houver evidencias minimas, trate como falha do `msq`, nao como sucesso
6. Se falhou:
   - Analise o erro
   - Corrija no maximo o harness/backlog temporario quando isso for claramente problema do fluxo de teste
   - Nao implemente manualmente a feature alvo
   - Registre cada problema encontrado em `/docs` como feature ou hotfix
   - Se persistir, reporte ao usuario

### 6. Abrir PR

1. Push do branch:
   ```bash
   git push -u origin feat/fXX-nome
   ```
2. Abra PR com `gh pr create`:
   - `--base develop`
   - Titulo: `feat: FXX — Nome da Feature`
   - Body com:
     - Summary dos commits
     - Test plan com resultados de vitest e tsc
3. Informe a URL do PR ao usuario

### 7. Atualizar backlog

1. `msq run` agora marca `status: done` (ou `failed`) automaticamente na feature dentro do `backlog.yaml` usado na run, ao final do pipeline (`markFeatureStatus` em `src/core/backlog/sync.ts`, chamado no `onDone` do scheduler em `src/core/runner/execute.ts`). Isso evita que a feature volte a aparecer como "Ready to start" na TUI por falta de sync manual.
2. Ainda assim, confirme manualmente que o `backlog.yaml` do branch develop reflete a feature como `done` (ou remova-a se ja entregue) — o backlog temporario montado no passo 2 roda na branch da feature, nao necessariamente no develop, entao o sync automatico so cobre o arquivo usado durante a run.
3. Se houver novas features specs criadas durante o desenvolvimento, commite-as tambem

## Notas

- O `msq run` usa o claude adapter que spawna `claude -p <prompt> --output-format json --dangerously-skip-permissions`
- O prompt eh gerado por `src/core/backlog/prompt.ts` a partir do campo `spec` da feature
- O campo `spec` deve ser detalhado o suficiente para que o agente claude consiga implementar sem ambiguidade
- Sempre valide com testes e typecheck antes de abrir o PR
- Se o schema v2 ja estiver implementado, use os campos `specFile`, `skills`, `context` ao inves de `spec` inline
- Se o objetivo do usuario for testar/evoluir o `msq`, priorize evidenciar defeitos do fluxo e melhorar a skill/harness antes de qualquer tentativa de concluir a feature alvo
