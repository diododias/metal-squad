# Research: Adapter Fallback em Retry + Resume no Step que Falhou

## Contexto observado no codigo (baseline)

- `RetrySchema` (`src/core/backlog/schema.ts:8-12`) ja define `maxAttempts`, `backoffMs`, `onFail` (`stop`|`continue`|`gate`), mas nao tem nocao de ferramenta alternativa.
- `runWithRetry` (`src/core/runner/execute.ts:456-493`) sempre usa **um unico adapter fixo** (`getAdapter(feature.tool)`), obtido uma vez fora do loop de tentativas; cada tentativa falha grava `createRetryRecord(runId, attempt, error, waitMs)` em `retry_history`, sem registrar qual ferramenta/modelo rodou.
- `retry_history` (`src/db/index.ts:143-149`) tem `id, run_id, attempt, error, retried_at` — nao tem coluna de tool/model.
- `runs` (`src/db/index.ts:106-122`) e por-run (uma run = uma execucao de stage/feature), com colunas de tokens agregadas (`input_tokens`, `output_tokens`, `total_tokens`...) preenchidas via `recordUsage`/`token_usage`. `token_usage` (linhas 124-131) ja e um log append-only por `run_id` — cada `INSERT` soma potencialmente mais de uma tentativa no mesmo `run_id`, entao a soma por `run_id` ja reflete todas as tentativas internas daquele run (FR-009 ja e parcialmente satisfeito na granularidade "run"; falta granularidade "por tentativa" para FR-010/FR-011).
- `resume.ts` (`src/commands/resume.ts`) resolve `findResumablePipeline(target)`, reconstroi snapshot via `getPipelineSnapshot`, e chama `executeBacklog(backlog, { resumePipelineId })` — que via `resumePipeline()` (`src/db/repo.ts:1098-1117`) recombina `pending+active+aborted` em `pending` e roda `executeBacklog` de novo sobre o backlog carregado do catalogo (nao ha override de tool/model hoje).
- `onFail: 'gate'` cria um registro em `gates` (`src/db/index.ts:133-141`) e pausa a pipeline (`pausePipeline`); resolucao hoje e via Telegram (`resolveGate(gateId, decision)` em `telegram-poller.ts:72-73`), sem opcao de trocar tool/model na resolucao.
- Budget global excedido (`handleGlobalBudgetViolation`, `execute.ts:136-148`) tambem cria run bloqueada + gate + pausa pipeline — mesmo mecanismo de gate usado por `onFail: 'gate'`, o que da uma base natural para reaproveitar (FR-008).
- Workflow staged (`executeStagedFeature`) ja rastreia progresso por stage via `listStageRequestsForFeature`/`loadPersistedStageInputs`, entao "resume so o step pendente" (FR-006) ja e uma propriedade estrutural existente do sistema (nao precisa ser reconstruida do zero) — o trabalho novo e sobre **qual tool/model** e usado nesse rerun, nao sobre **quais steps** rerodam.

## Decisoes

### D1 — Onde declarar a lista de fallback

**Decision**: Adicionar `fallback: FallbackAlternativeSchema[]` (default `[]`) dentro de `RetrySchema`, com `FallbackAlternativeSchema = { tool: ToolSchema, model?: string, effort?: EffortSchema, maxAttempts?: number }`.

**Rationale**: Fallback so faz sentido combinado com uma politica de retry existente (esgotar `maxAttempts` da ferramenta primaria e o gatilho, conforme FR-001/FR-002). Colocar dentro de `retry` evita um novo campo de topo em `FeatureSchema` e mantem toda a config de resiliencia de uma feature em um unico bloco, coerente com o schema atual (`retry?: RetrySchema` ja e opcional, entao features existentes sem fallback continuam identicas — edge case do spec.md linha 63).

**Alternatives considered**:
- Campo de topo `fallback: Tool[]` em `FeatureSchema`: mais simples, mas perde a possibilidade de customizar `model`/`effort`/`maxAttempts` por alternativa (FR-001 pede isso explicitamente como opcional).
- Fallback global no `defaults`/`budget` do backlog: rejeitado — o spec e claro que a configuracao e "por feature" (FR-001), nao por projeto.

### D2 — Como o loop de retry troca de adapter

**Decision**: Reescrever `runWithRetry` para iterar sobre uma lista de "candidatos" `[{ tool: feature.tool, model: feature.model, effort: feature.effort, maxAttempts: retry.maxAttempts }, ...retry.fallback]`. Para cada candidato, repetir o loop de tentativas atual (`for attempt in 1..maxAttempts`) usando `getAdapter(candidate.tool)` e uma `Feature` efetiva derivada (`{ ...feature, tool: candidate.tool, model: candidate.model ?? feature.model, effort: candidate.effort ?? feature.effort }`) — sem mutar o `feature` original nem persistir nada em `backlog.yaml`/catalogo (satisfaz FR-007). So aplica `onFail` (stop/continue/gate) depois que **todos** os candidatos esgotarem (FR-003).

**Rationale**: Reaproveita 100% do loop de backoff/jitter/`createRetryRecord` ja existente, apenas envolvendo-o em um loop externo por candidato — minimiza risco de regressao no comportamento hoje coberto por `tests/runner/execute.test.ts`. Construir uma `Feature` efetiva (em vez de passar `tool`/`model` soltos para o adapter) evita mudar a assinatura de `ToolAdapter.runFeature`, que hoje recebe `feature: Feature` inteiro.

**Alternatives considered**:
- Mudar `ToolAdapter.runFeature` para receber `tool`/`model` como parametros separados do `feature`: mais invasivo, tocaria os tres adapters (`claude.ts`, `codex.ts`, `opencode.ts`) sem necessidade, pois eles ja leem `feature.tool`/`feature.model`/`feature.effort` internamente.

### D3 — Como registrar qual tool/model rodou em cada tentativa

**Decision**: Adicionar colunas `tool TEXT` e `model TEXT` (nullable) a `retry_history` via `ALTER TABLE ... ADD COLUMN` condicional (padrao ja usado em `src/db/index.ts` para colunas novas em tabelas existentes — verificar migracoes anteriores para o idioma exato de "add column if not exists" do projeto). `createRetryRecord` passa a aceitar `tool`/`model` opcionais. Alem disso, gravar o `tool`/`model` **da tentativa vencedora** (ou da ultima, se todas falharem) na propria linha de `runs` — ja existe `runs.tool`, so precisa ser atualizado quando o candidato efetivo difere do `feature.tool` original (hoje `createRun` grava `feature.tool` uma vez no inicio e nunca atualiza).

**Rationale**: FR-010/FR-011 pedem "por tentativa" — `retry_history` e a unica tabela que ja tem uma linha por tentativa falha; a tentativa final (sucesso ou ultima falha) e representada pela propria `runs` row, entao atualizar `runs.tool` quando o candidato vencedor difere do original cobre esse caso sem criar uma tabela nova "attempts" (ver D5).

**Alternatives considered**:
- Criar tabela nova `run_attempts` com uma linha por tentativa (incluindo a bem-sucedida) e migrar `retry_history` para dentro dela: mais "correto" no papel, mas maior superficie de migracao e quebra queries/telas existentes que leem `retry_history`. Rejeitado por escopo — nada no spec exige eliminar `retry_history`.

### D4 — Override pontual de tool/model no `msq resume`

**Decision**: Adicionar flags `--tool <tool>`, `--model <model>`, `--effort <low|medium|high>` a `msq resume <target>`. Quando presentes, `executeBacklog` recebe um novo campo em `ExecuteOptions` (ex.: `resumeOverride: { featureId, tool?, model?, effort? }`) que e aplicado **apenas** ao candidato inicial do proximo `runWithRetry` da feature que estava ativa/bloqueada/em gate naquele pipeline no momento da pausa — nao a todas as features `pending` do restante do plano. Antes de aplicar, validar que o `tool` informado existe no registry de adapters (`getAdapter`) e esta disponivel no ambiente (ex.: binario/API key configurados) — se nao, rejeitar o resume com mensagem clara **antes** de criar qualquer run nova (FR-012), sem tocar em `pausePipeline`/estado.

**Rationale**: FR-004/FR-005/FR-007 pedem override "apenas para essa retomada especifica", nao para o restante do plano. Como `resume.ts` ja resolve um `pipeline` (que pode ter mais de uma feature pendente em teoria, mas na pratica o gate/pausa acontece numa feature especifica), restringir o override aquela feature evita efeito colateral silencioso em outras features do mesmo backlog que ja tinham tool/model corretos.

**Alternatives considered**:
- Aplicar o override a **todo** o resume (todas as features pendentes): mais simples de implementar, mas viola FR-007 em pipelines multi-feature — um operador resolvendo um gate da feature X nao deveria trocar silenciosamente a ferramenta da feature Y ainda nao iniciada.
- Exigir que o operador edite `backlog.yaml` manualmente antes do resume: e o comportamento atual (nao ha override), exatamente o que a User Story 2 pede para eliminar.

### D5 — Nao criar uma tabela "attempts" nova

**Decision**: Nao introduzir uma tabela `attempts` separada de `runs`/`retry_history`. Reusar `runs` (uma execucao de step, ja e o "attempt final") + `retry_history` (tentativas intermediarias falhas) como as duas fontes que juntas cobrem "historico de tentativas de uma execucao" (Key Entity do spec.md).

**Rationale**: O proprio spec.md define "Tentativa (attempt)" como uma entidade logica, nao necessariamente uma tabela fisica nova — o requisito e "consultavel pelo operador" (FR-010), o que uma JOIN entre `runs` e `retry_history` ja resolve. Isso evita duplicar a logica de status/lifecycle que hoje vive em `runs`.

**Alternatives considered**: ver D3 — tabela `run_attempts` dedicada, rejeitada pelo mesmo motivo de escopo.

### D6 — Reaproveitar mecanismo para resolucao de budget gate (FR-008)

**Decision**: O `resume --tool/--model/--effort` construido em D4 e o **mesmo mecanismo** usado tanto para resolver um gate criado por `onFail: 'gate'` quanto um gate criado por `handleGlobalBudgetViolation`/violacao per-feature (`applyBudgetUsage`) — ambos hoje pausam a pipeline e criam uma row em `gates`; o resume generico ja localiza a pipeline pausada independente da causa do gate, entao nao ha working extra alem de garantir que o resume override funcione tambem quando a run bloqueada tem `tool = 'budget'` (caso especial de `handleGlobalBudgetViolation`, `execute.ts:139`).

**Rationale**: Evita duplicar um segundo caminho de "trocar ferramenta" so para budget, coerente com o antipadrao do repo "duplicar regras de precedence... em mais de um modulo" (`.claude/rules/architecture.md`).

**Alternatives considered**: Comando dedicado `msq resume-budget`: rejeitado, redundante com `msq resume` generico.

## Riscos e mitigacoes

- **Risco**: mudar `runWithRetry` para loop-de-candidatos pode alterar contagem de `attempt` gravada em `retry_history` (hoje `attempt` e sempre relativo a ferramenta unica). *Mitigacao*: manter `attempt` como contador global crescente ao longo de todos os candidatos (nao reiniciar em 1 a cada troca de ferramenta), e usar as novas colunas `tool`/`model` para diferenciar de qual candidato veio cada tentativa.
- **Risco**: telas de status existentes que leem `retry_history`/`runs` sem as colunas novas podem quebrar se assumirem shape fixo. *Mitigacao*: colunas novas sao nullable/opcionais e aditivas (ver `.claude/rules/testing.md` — rodar suites de `tests/ui/*` e `tests/db/*` apos a migracao).
- **Risco**: FR-012 exige rejeitar resume com tool indisponivel "antes de consumir qualquer uso" — se a checagem de disponibilidade for feita so dentro do adapter (ao spawnar processo), o custo zero pode nao ser garantido. *Mitigacao*: checagem de disponibilidade (binario instalado / credencial presente) deve rodar em `resume.ts` antes de chamar `executeBacklog`, reaproveitando qualquer helper de deteccao ja existente nos adapters (`ToolAdapter` pode ganhar um metodo opcional `isAvailable?(): boolean` se nao existir equivalente).

## Unknowns resolvidos

Nao havia campos `NEEDS CLARIFICATION` no Technical Context — todas as decisoes acima partem de padroes ja presentes no codigo (schema Zod, SQLite com `better-sqlite3`, CLI via `commander`), entao nao ha pesquisa externa (biblioteca nova, servico terceiro) necessaria para esta feature.
