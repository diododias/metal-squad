# Plano: Adapter OpenCode — paridade, gaps e evolução

**Data:** 2026-07-20  
**Escopo:** `src/core/adapters/opencode.ts` + integração runner/UI  
**Referências:** Claude (`claude.ts`), Codex (`codex.ts`), spawn compartilhado, Live Output, H30, SET-24

---

## 1. Resumo executivo

O adapter OpenCode **já é um peer de execução** no contrato `ToolAdapter`: spawn via `runCli`, stream JSON, abort, session resume, control signals (`MSQ_*`), detecção de session/rate limit, heartbeats, eventos `run:output` / `tool:call` / `tokens:update` / `run:status`, e wiring no registry (`DEFAULT_TOOL_REGISTRY` + `getAdapter`).

SET-24 (hardcodes) e H30 (timeout configurável) já fecharam débitos importantes. O que falta para **paridade de UX/diagnóstico** com Claude/Codex é concentrado em:

1. Diagnóstico de timeout/falha (partial summary + arquivos tocados)
2. Fidelidade do lifecycle de tool calls no Live Output
3. Tokens cumulativos mid-stream
4. `stageSkills` → stage inference
5. Piso de timeout (`minTimeoutMs`) e capabilities futuras (effort/thinking se a CLI suportar)

**Pause** e **abort** são responsabilidade do scheduler/runner + `AbortSignal` no spawn — **não** do adapter. OpenCode já participa corretamente desse fluxo (igual aos outros).

---

## 2. Arquitetura atual (como se encaixa)

```
Feature.tool id
  → config.tools[] → adapter: 'opencode'
      → opencodeAdapter.runFeature()
          → resolveToolInvocation()     # command, baseArgs, env, capabilities, minTimeoutMs
          → runCli()                    # process, timeout, abort SIGTERM→SIGKILL, status, heartbeat
          → createOpenCodeStreamParser  # brace-depth (JSON pode partir entre chunks)
          → msqEventBus                 # run:output | tool:call | tokens:update | run:status
          → RunResult                   # ok, control, session, usage, aborted, blocked, timeout
              → execute.ts / scheduler / persistence / Web+TUI Live Output
```

| Camada | Arquivo | Papel do OpenCode |
|--------|---------|-------------------|
| Contrato | `adapters/types.ts` | `ToolAdapter` completo |
| Registry | `adapters/index.ts` + `config/index.ts` | `id/adapter: opencode` |
| Spawn | `adapters/spawn.ts` | Compartilhado — abort/timeout/status |
| Adapter | `adapters/opencode.ts` | CLI args + parse stream + eventos |
| Runner | `runner/execute.ts` | retry, session reuse, control, protocol |
| Scheduler | `orchestrator/scheduler.ts` | pause (não mata) / abortAll (mata) |
| Persistência | `events/persistence.ts` | SQLite `run_output`, tool_calls, tokens |
| UI | `RunDetailPage` + `useLocalOutput` | Live Output tab |
| TUI | `useRunOutput` | poll DB + bus |

---

## 3. Matriz de paridade (estado real)

| Capacidade | Claude | Codex | OpenCode | Nota |
|------------|:------:|:-----:|:--------:|------|
| `runFeature` + `isAvailable` | ✅ | ✅ | ✅ | |
| Model flag | `--model` | `-m` | `--model` | |
| Effort nativo | via thinking budget | `-c model_reasoning_effort` | ❌ warn | capabilities.effort=false |
| Thinking | `MAX_THINKING_TOKENS` | ❌ warn | ❌ warn | SET-24 limpou hardcode |
| Stream live | NDJSON linhas | NDJSON linhas | JSON multi-chunk | parser próprio é diferencial |
| Session new/resume | UUID / `--resume` | thread_id / `exec resume` | captura sessionID / `--session` | |
| Abort (`CliAbortError`) | ✅ | ✅ | ✅ | |
| Timeout + `timeout` em RunResult | ✅ + partial | ✅ + partial | ✅ **sem** partial | gap |
| `detectTouchedFiles` em falha | ✅ | ✅ | ❌ | gap |
| Session/rate limit | `detectSessionLimit` | idem | idem | compartilhado |
| Control `MSQ_*` | ✅ | ✅ | ✅ | |
| `run:output` live | ✅ | ✅ | ✅ | |
| `tool:call` started→completed | forte | forte | fraco (heurística) | gap UX |
| Tokens mid-stream | cumulativo | turn complete | quando total>0 | gap |
| `stageSkills` → stage | ✅ | ❌ | ❌ | gap vs Claude |
| Heartbeat com progresso | ✅ | ✅ | ✅ (rico) | OpenCode já bom |
| `minTimeoutMs` default | 60min | 30min | **0** | depende só de `toolTimeoutMs` |
| Sandbox/perms CLI | skip-permissions | workspace-write | defaults OpenCode | OK se CLI ok |
| Testes unitários | bons | bons | ~482 linhas, fortes | |

---

## 4. Avaliação por eixo pedido

### 4.1 Construção do adapter

**Pontos fortes**

- Implementação completa do contrato; sem stubs/TODOs locais.
- Parser brace-depth (`createOpenCodeStreamParser`) robusto para stream que **não** é NDJSON puro — necessário e bem isolado.
- Progress/heartbeat com contagem de eventos, snippets de thinking/tool/agent — útil em runs longas.
- Aliases de usage (`usage` / `tokens`, `input` / `input_tokens`, cache fields).
- Avisos honestos quando effort/thinking são pedidos sem capability.
- Session handle com `sessionID` | `sessionId`.
- Testes amplos em `tests/adapters/opencode.test.ts`.

**Pontos fracos / dívida**

| Item | Detalhe | Impacto |
|------|---------|---------|
| Timeout summary pobre | Só `"timeout após Ns"`; Claude/Codex anexam última msg + git status | Operador não sabe o que a run fazia |
| Falha exit≠0 | `stderr.slice(-500)` ou exit code; sem partial agent text | Diagnóstico fraco |
| Tool phase heurística | `part.type === 'tool_use'\|'tool_start' ? started : completed` | Tools “presos” em running no Live Output |
| IDs de tool call | fallback `` `${toolName}-${Date.now()}` `` | Duplica started/completed se callID ausente |
| `isCliTimeoutError` duck-type | `error.name === 'CliTimeoutError'` em vez de `instanceof` | Frágil se bundling/name mudar |
| `SessionHandle.tool: 'opencode'` hardcoded | Igual aos outros; quebra se tool id custom usa adapter opencode | Session reuse cross-id |
| `minTimeoutMs: 0` | H30 deliberado; runs longas caem no default global (~10min se config default) | Risco de timeout em implement longo |
| Sem `detectTouchedFiles` compartilhado | Duplicado em claude/codex; opencode não usa | Manutenção + gap |

### 4.2 Integração no mesmo nível de Claude/Codex

Já integrado no **mesmo caminho de produto**:

- Schema `AdapterSchema` inclui `opencode`
- Fallback/retry multi-tool (spec 009) trata os três
- Session resume (spec 011 / H24) nos três
- Notifications de session limit sugerem trocar tool (inclui opencode se disponível)
- Protocolo de comunicação e publish gate são pós-adapter (runner)

**Não** é um adapter de segunda classe no wiring. É de segunda classe na **riqueza de observabilidade e recovery messaging**.

Critério de “mesmo nível” operacional:

| Critério | Status OpenCode |
|----------|-----------------|
| Disparar feature / stage com tool=opencode | ✅ |
| Ver output na Run Detail Live Output | ✅ |
| Abort cancela o processo | ✅ |
| Pause para de enfileirar (in-flight continua) | ✅ (scheduler) |
| Limit → blocked + requeue + notificação | ✅ |
| Timeout com contexto acionável | ⚠️ parcial |
| Tool timeline confiável na UI | ⚠️ parcial |
| Tokens ao vivo | ⚠️ parcial |
| Stage label via skill no stream | ❌ (só Claude) |

### 4.3 Execução

```
opencode run --format json [--session <id>] [--model <m>] -- <prompt>
```

- Timeout: `Math.max(runtime.toolTimeoutMs, invocation.minTimeoutMs)` (pós-H30).
- Env/baseArgs do registry/config por tool.
- Exit 0 → parse final text + control + session + usage.
- Exit ≠0 / zero com limit text → `blocked: true` se `detectSessionLimit`.
- Erro estruturado `type:error` / `error` no JSON → summary nomeado.

**Riscos de execução reais**

1. **Timeout cedo em stages longos** se o repo não sobe `toolTimeoutMs` e `minTimeoutMs` continua 0.
2. **Formato de eventos OpenCode** pode evoluir na CLI — parser é best-effort; falta contrato versionado / golden fixtures de streams reais.
3. **Permissões**: Claude força skip-permissions; OpenCode depende do default da CLI — comportamento diferente em repos sensíveis.
4. **Prompt via argv `--`**: prompts enormes podem estourar limites de argv do OS (Claude/Codex também usam argv em geral; monitorar).

### 4.4 Live Output (detalhe da run)

Fluxo:

```
adapter emit run:output / tool:call
  → persistence SQLite
  → WS (mesmo processo) ou poll DB 1s (msq detached)
  → useLocalOutput / RunDetailPage
       - outputToTranscript + toolCallsToTranscript
       - filtra eco de tool se há toolCalls estruturados
       - formata heartbeats → activity / “thinking…”
```

**OpenCode no live path**

- Emite `source: agent | tool | stdout | stderr | heartbeat` — alinhado.
- `normalizeLegacyOpencodePayload` no client é **legado** (histórico antigo); live não depende mais dele.
- Heartbeats ricos ajudam quando o stream fica quieto.
- **Dor:** tool calls com phase incompleta → UI mostra tool “running” sem completed/failed; menos hierarquia visual (spec 010) que Claude.

### 4.5 Pausa

- **Não** é feature do adapter.
- UI → `pausePipeline` → DB `paused` → runner poll → `scheduler.pause()`.
- Efeito: não inicia novas features; **processo OpenCode em voo continua** até sair sozinho.
- Paridade total com Claude/Codex (nenhum adapter “pausa” o filho).

**Melhoria além dos outros (opcional, produto):** soft-pause via sinal da CLI se OpenCode expuser pause/resume de sessão — nenhum adapter tem isso hoje.

### 4.6 Abort

- UI → `aborting` → `scheduler.abortAll()` → `AbortController` da run.
- `runCli`: SIGTERM → SIGKILL 2s → `CliAbortError`.
- OpenCode retorna `{ ok:false, aborted:true, summary: 'abortado manualmente após Ns' }` — paridade.
- Runner `finishRun(..., 'aborted')`.

Sem gap funcional. Possível polish: incluir `lastProgress` no summary de abort (hoje só timeout carrega isso no spawn).

### 4.7 Detecção de limite

Padrões compartilhados em `types.ts`:

- `session limit`, `rate limit`, `insufficient balance`, `insuficiente`, `quota exceeded`

Aplicado em stdout+stderr, exit 0 e ≠0 — **igual** Claude/Codex.

Downstream: scheduler pausa + requeue; Telegram sugere resume com outra tool.

**Gaps possíveis específicos OpenCode**

- Mensagens de billing/quota da CLI OpenCode podem não bater nos regex atuais → falso negativo (run falha como erro genérico em vez de `blocked` recuperável).
- Ação: coletar strings reais de erro OpenCode e estender `SESSION_LIMIT_PATTERNS` ou detector por-adapter.

---

## 5. O que falta para paridade (backlog priorizado)

### P0 — Paridade operacional (fechar “mesmo nível” de diagnóstico)

| # | Trabalho | Arquivos | Aceite |
|---|----------|----------|--------|
| P0.1 | ✅ Extrair `detectTouchedFiles` + `summarizePartialOutput` para helper compartilhado; usar no timeout e exit≠0 do OpenCode | `adapters/partial.ts`; `opencode.ts`; refator claude/codex | Timeout summary contém last agent + lista git short |
| P0.2 | ✅ Usar `instanceof CliTimeoutError` | `opencode.ts` | Sem duck-typing |
| P0.3 | ✅ `minTimeoutMs` default opencode = `1_800_000` (alinhado Codex) | `config/index.ts` | Runs longas não morrem aos 10min por default |
| P0.4 | ✅ Teste de timeout summary + touched files (stream fixtures existentes mantidos) | `tests/adapters/opencode.test.ts` | Regressão de partial/timeout coberta |

### P1 — Paridade de Live Output / observabilidade

| # | Trabalho | Aceite |
|---|----------|--------|
| P1.1 | Mapear fases de tool com callID estável; pairing start→complete/fail; output/error preenchidos | Timeline na Run Detail igual Claude em qualidade |
| P1.2 | Tokens cumulativos mid-stream quando a CLI emitir usage parcial | `tokens:update` ao longo da run, não só no fim |
| P1.3 | `stageSkills` + `detectStageFromSkill` (portar de Claude ou helper comum) | `task:updated` stage quando skill aparece no stream |
| P1.4 | Emitir `task:started` no adapter se o runner depender disso de forma simétrica (hoje Claude emite; codex/opencode não) | Comportamento uniforme ou documentar que é runner-only |

### P2 — Capabilities e produto

| # | Trabalho | Aceite |
|---|----------|--------|
| P2.1 | Reavaliar CLI OpenCode: effort/thinking/flags oficiais; se existirem, ligar `capabilities` + `effortFlag` | Sem warn falso; flags reais |
| P2.2 | `SessionHandle.tool` = `feature.tool` (id registry), não literal `'opencode'` — nos **três** adapters | Resume com tool id custom |
| P2.3 | Patterns de limit específicos OpenCode (amostras de produção) | `blocked` + notificação corretos |
| P2.4 | Flags de permissão/autonomy se a CLI expuser equivalente a skip-permissions | Paridade de “headless autonomy” |
| P2.5 | Fechar docs SET-24 (e SET-22/23) de Draft → Done se código já reflete | Roadmap honesto |

### P3 — Evoluir **além** dos outros adapters

OpenCode pode ser o adapter de referência se explorarmos o que a CLI oferece de único:

| Ideia | Por que além |
|-------|----------------|
| **E.1 Multi-model routing nativo** | OpenCode costuma ser gateway multi-provider; expor model catalog na Settings UI + validação de model id |
| **E.2 Session inspect API** | Se houver `opencode session` / export transcript, msq pode anexar transcript oficial no fim da run (audit) |
| **E.3 Structured parts first-class** | Manter parser de parts (`text`/`thinking`/`tool`) como modelo canônico interno; Claude/Codex normalizam **para** esse shape — Live Output único |
| **E.4 Soft-cancel / checkpoint** | Se CLI suportar cancel gracefully sem matar worktree, melhor que SIGKILL |
| **E.5 Cost/latency metrics** | Se stream trouxer cost por provider, gravar em `runs` e dashboard |
| **E.6 Local-first / offline models** | Diferencial vs Claude/Codex cloud; detector `isAvailable` + health de provider |
| **E.7 Golden stream recorder** | Modo dev: gravar stdout real da CLI → fixtures versionadas (melhora os 3 adapters no longo prazo) |
| **E.8 Pause cooperativo** | Sinal para o agente checkpointar e sair com `MSQ_BLOCKED`/`needs_input` em vez de matar — feature de produto msq, piloto no OpenCode |

Priorizar E.3 + E.7: melhoram paridade **e** elevam a barra para todos.

---

## 6. Plano de execução sugerido

### Fase A — Fechar gaps P0 (1–2 PRs) — **FEITO** (`feat/opencode-adapter-p0-parity`)

1. ✅ Helper compartilhado: `src/core/adapters/partial.ts`
2. ✅ OpenCode usa helper + `instanceof CliTimeoutError`; claude/codex refatorados para o mesmo helper
3. ✅ `minTimeoutMs` default opencode = `1_800_000` (alinhado Codex)
4. ✅ Testes de timeout summary com agent message + touched files

**Saída:** operador de run OpenCode timeout/falha entende o que aconteceu; defaults seguros.

### Fase B — Live Output P1 (1 PR)

1. Tool lifecycle com callID.
2. Tokens mid-stream.
3. stageSkills (helper extraído de Claude).

**Saída:** Run Detail com OpenCode visualmente no nível Claude.

### Fase C — Capabilities P2 + docs

1. Auditar CLI OpenCode (version matrix).
2. SessionHandle.tool = feature.tool nos 3.
3. Limit strings reais.
4. Marcar SET-24 done.

### Fase D — Diferenciação P3 (roadmap)

1. Modelo canônico de parts + normalizers Claude/Codex.
2. Recorder de golden streams.
3. Catalog multi-model / cost se a CLI permitir.

---

## 7. Riscos e não-objetivos

**Riscos**

- Formato JSON OpenCode instável entre versões da CLI → pin de versão ou capability detection por `--version`.
- Subir `minTimeoutMs` demais esconde hangs reais (mitigar com idle status + heartbeats, já existentes).
- Refator shared partial helpers pode regredir Claude/Codex — exigir suite completa `tests/adapters/*`.

**Não-objetivos deste plano**

- Reimplementar pause no processo filho (produto scheduler).
- Auth OAuth dentro do adapter (continua externo à CLI).
- Trocar protocolo `MSQ_*` (já unificado no runner).

---

## 8. Checklist de validação (definição de “pronto no mesmo nível”)

- [ ] `msq run` com `tool: opencode` completa stage publish com `MSQ_DONE` + PR
- [ ] Live Output: agent text, tools started/completed, heartbeats, tokens
- [ ] Abort mid-run → status aborted, processo morto, sem orphan
- [ ] Pause mid-run → não inicia próxima feature; in-flight termina
- [ ] Simular rate limit no stdout → `blocked` + requeue + notificação
- [ ] Timeout artificial → summary com last progress + touched files
- [ ] Session resume stage seguinte com mesmo sessionId
- [ ] Fallback claude→opencode (e inverso) em session limit
- [ ] `vitest` adapters + build/typecheck/lint verdes
- [ ] Run real longa (implement) sem timeout espúrio no default

---

## 9. Conclusão

| Pergunta | Resposta |
|----------|----------|
| OpenCode está “plugado” como Claude/Codex? | **Sim** — mesmo contrato, registry, runner, UI, abort/limit/pause. |
| Está no mesmo nível de qualidade operacional? | **Quase** — falta diagnóstico de falha/timeout, tool timeline e tokens mid-stream. |
| O que falta de verdade? | P0.1–P0.4 + P1.1–P1.3. |
| Como evoluir além? | Parts canônicos, multi-model/cost, golden streams, pause cooperativo — Fase D. |
| Pause/abort/limit/live | Abort/limit/live **ok**; pause **ok** (scheduler); live **ok com tool UX mais fraca**. |

Próximo passo recomendado: **Fase A (P0)** em um PR focado em partial timeout/failure + minTimeoutMs + testes, sem mexer em capabilities da CLI.
)
