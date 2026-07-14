---
name: "msq-develop"
description: "Atua como QA do executor `msq`: seleciona a proxima feature, recompila o projeto imediatamente antes da execucao, roda `msq run` e valida se a ferramenta realmente implementou a feature sozinha. Nao implementa manualmente a feature alvo. Use quando for preciso testar o fluxo real do `msq`, validar evidencias, registrar bugs em `docs/hotfixes` e abrir PR apenas se o executor concluir com sucesso."
---

## User Input

```text
$ARGUMENTS
```

Se o usuario especificou uma feature (ex: "feat-02", "F03"), use essa. Caso contrario, identifique automaticamente a proxima feature a ser desenvolvida.

## Papel

Atue como QA do `msq`.

- Seu trabalho e preparar o ambiente, disparar o executor, acompanhar a execucao, validar evidencias e registrar falhas do fluxo.
- Todo o codigo da feature alvo deve ser implementado pelo `msq`.
- Esta skill nao implementa manualmente a feature.

## DONT: NAO IMPLEMENTE

- Nao escreva codigo da feature alvo manualmente.
- Nao "ajude" o `msq` implementando partes faltantes antes, durante ou depois da execucao.
- Nao transforme uma falha do executor em sucesso via implementacao manual.
- Nao corrija a feature alvo por conta propria para destravar testes.
- So ajuste o harness, backlog temporario ou a propria skill quando o problema estiver claramente no fluxo de teste e nao na feature.
- **Nao invoque `msq`, `node dist/index.js run`, `npm run dev` ou qualquer nested runner dentro de uma run ja em andamento.** "Implementado pelo msq" significa "implementado pelo agente que o msq ja spawnada", nao uma nova chamada do CLI. Recursao e sempre um defeito do prompt/harness.

Se o `msq` nao conseguir concluir a implementacao sozinho, trate isso como defeito do fluxo/ferramenta ou falha de execucao a ser investigada.

## Fluxo

### 1. Identificar a proxima feature

1. Se o usuario especificou a feature, use-a sem inferir backlog externo.
2. Caso contrario, derive a proxima feature somente de artefatos versionados ainda validos no repo (`backlog.yaml`, `docs/features/`, `docs/hotfixes/` e codigo atual).
3. Se a priorizacao depender de roadmap/spec que ainda nao foi republicado no repo, pare e trate como falta de contexto suficiente em vez de recorrer a material antigo fora do versionamento.
3. Verifique o estado atual do projeto:
   - `rtk git log --oneline -20` para ver quais features ja foram implementadas (commits com `feat(...)`)
   - Leia os arquivos em `src/` para confirmar o que ja existe
4. Identifique a proxima feature que:
   - Tem todas as dependencias ja implementadas
   - Ainda nao foi implementada
   - Tem a maior prioridade (Critica > Alta > Media > Baixa)
5. Informe ao usuario qual feature sera executada pelo `msq` e por que
6. Deixe explicito que a implementacao sera feita exclusivamente pelo `msq` e que voce atuara apenas como QA do processo

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
     - **Primeiro bloco obrigatorio — regras anti-recursao**: proibir explicitamente invocar `msq`, `node dist/index.js run`, `npm run dev` ou qualquer comando que dispare uma nova run do orquestrador; deixar claro que a implementacao deve acontecer diretamente no agente ja spawnado, editando arquivos e rodando testes neste checkout
     - ESCOPO detalhado com cada mudanca necessaria em cada arquivo
     - Lista de arquivos de contexto relevantes
     - CRITERIOS DE ACEITE da spec
     - Instrucao para usar `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`
     - Instrucao explicita de que a implementacao deve ser feita pelo executor/agent disparado pelo `msq`, nao por esta skill
   - `dependsOn`: lista de features das quais depende (se houver)
4. Se o backlog temporario ficar inconsistente, pare o fluxo e registre o problema em `docs/hotfixes`

### 3. Preparar o checkout atual e rebuildar

1. Trabalhe no checkout atual onde o fluxo foi iniciado.
2. Nao crie `worktree` dentro deste fluxo.
3. Se isolamento for desejado, a IA/ferramenta responsavel prepara o checkout antes de chamar `msq-develop`.
4. No checkout atual:
   - Atualize o `backlog.yaml`
   - `rtk npm install --silent`
   - `rtk npm run build`
5. O `build` acima e obrigatorio e deve acontecer imediatamente antes do `msq run`, mesmo que o projeto ja tenha sido buildado antes, para garantir que a execucao use a versao mais atual do `msq`
6. Nao rode outras etapas que possam alterar o binario entre o `rtk npm run build` e o `rtk node dist/index.js run --feature feat-XX`

### 4. Executar msq run

1. No checkout atual, execute:
   ```bash
   rtk node dist/index.js run --feature feat-XX
   ```
   Isso vai spawnar um `claude` headless que usara speckit para implementar a feature.
2. Timeout: 10 minutos (600000ms)
3. Capture o output
4. Nao implemente manualmente a feature alvo antes, durante ou depois do `msq run`; acompanhe apenas o funcionamento do executor e os artefatos que ele produzir
5. Seu papel nesta etapa e observar como QA:
   - verificar se o processo iniciou corretamente
   - verificar se o executor recebeu contexto suficiente
   - verificar se houve erros de prompt, harness, ambiente, timeout ou execucao
   - coletar evidencias objetivas do comportamento do `msq`
6. **Detectar recursao**: se o `msq status` mostrar mais de uma run para a mesma feature em sequencia rapida, ou se a arvore de processos mostrar `node dist/index.js run` aninhado dentro de outro `node dist/index.js run`, encerre a execucao com `pkill -f "node dist/index.js run"` e registre como defeito em `docs/hotfixes` (veja H05). Nao deixe a recursao continuar consumindo recursos.

### 5. Validar resultado

1. Verifique se o `msq run` terminou com sucesso (exit code 0)
2. Verifique evidencias minimas de execucao real:
   - houve nova `run` em `rtk msq status` ou no banco SQLite
   - houve output util do executor
   - houve commits, diff ou artefatos produzidos no checkout atual
3. No checkout atual, execute:
   - `rtk npx vitest run` — todos os testes devem passar
   - `rtk npx tsc --noEmit` — sem erros de tipo
4. `rtk git log --oneline` para ver os commits feitos
5. Se `msq run` retornar `0` mas nao houver evidencias minimas, trate como falha do `msq`, nao como sucesso
6. Se falhou:
   - Analise o erro
   - Corrija no maximo o harness/backlog temporario quando isso for claramente problema do fluxo de teste
   - Nao implemente manualmente a feature alvo
   - Se a feature continuar incompleta, mantenha-a incompleta e reporte isso como defeito do executor/fluxo
   - Registre cada bug encontrado em `docs/hotfixes`
   - Se persistir, reporte ao usuario

### 6. Abrir PR

Abra PR apenas se a feature tiver sido implementada pelo `msq` e validada com sucesso.

1. Push do branch:
   ```bash
   rtk git push -u origin feat/fXX-nome
   ```
2. Abra PR com `rtk gh pr create`:
   - `--base develop`
   - Titulo: `feat: FXX — Nome da Feature`
   - Body com:
     - Summary dos commits
     - Test plan com resultados de vitest e tsc
3. Informe a URL do PR ao usuario

### 7. Atualizar backlog

1. Atualize o `backlog.yaml` no branch develop adicionando a feature como `done` (ou remova-a se ja entregue)
2. Se houver novos hotfixes ou specs criados durante o acompanhamento, commite-os tambem

## Notas

- O `msq run` usa o claude adapter que spawna `claude -p <prompt> --output-format json --dangerously-skip-permissions`
- O prompt eh gerado por `src/core/backlog/prompt.ts` a partir do campo `spec` da feature
- O campo `spec` deve ser detalhado o suficiente para que o agente claude consiga implementar sem ambiguidade
- O agente principal desta skill atua como QA do fluxo e nao como implementador da feature
- Sempre valide com testes e typecheck antes de abrir o PR
- Se o schema v2 ja estiver implementado, use os campos `specFile`, `skills`, `context` ao inves de `spec` inline
- Se o objetivo do usuario for testar/evoluir o `msq`, priorize evidenciar defeitos do fluxo e melhorar a skill/harness antes de qualquer tentativa de concluir a feature alvo
- Quando um bug for encontrado, crie um hotfix em `docs/hotfixes` em vez de registrar genericamente em outro lugar
