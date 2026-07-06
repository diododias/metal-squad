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
2. Atualize o `backlog.yaml` com a feature configurada:
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

### 3. Criar worktree isolado

1. Crie um worktree a partir de `develop`:
   ```bash
   git worktree add .claude/worktrees/msq-feat-XX -b feat/fXX-nome develop
   ```
2. No worktree:
   - Copie o `backlog.yaml` atualizado
   - `npm install --silent`
   - `npm run build`

### 4. Executar msq run

1. No worktree, execute:
   ```bash
   node dist/index.js run --feature feat-XX
   ```
   Isso vai spawnar um `claude` headless que usara speckit para implementar a feature.
2. Timeout: 10 minutos (600000ms)
3. Capture o output

### 5. Validar resultado

1. Verifique se o `msq run` terminou com sucesso (exit code 0)
2. No worktree, execute:
   - `npx vitest run` — todos os testes devem passar
   - `npx tsc --noEmit` — sem erros de tipo
3. `git log --oneline` para ver os commits feitos
4. Se falhou:
   - Analise o erro
   - Tente corrigir o backlog.yaml e re-executar
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

1. Atualize o `backlog.yaml` no branch develop adicionando a feature como `done` (ou remova-a se ja entregue)
2. Se houver novas features specs criadas durante o desenvolvimento, commite-as tambem

## Notas

- O `msq run` usa o claude adapter que spawna `claude -p <prompt> --output-format json --dangerously-skip-permissions`
- O prompt eh gerado por `src/core/backlog/prompt.ts` a partir do campo `spec` da feature
- O campo `spec` deve ser detalhado o suficiente para que o agente claude consiga implementar sem ambiguidade
- Sempre valide com testes e typecheck antes de abrir o PR
- Se o schema v2 ja estiver implementado, use os campos `specFile`, `skills`, `context` ao inves de `spec` inline
