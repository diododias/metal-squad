# F12 — Pause / Resume / Abort

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Alta
**Esforco**: Medium
**Depende de**: F15

## Problema

Nao ha como pausar um pipeline em andamento, retomar depois, ou abortar uma feature individual sem matar todo o processo.

## Solucao

### Controles

- **Pause**: para de despachar novas features, espera as ativas terminarem
- **Resume**: retoma despacho
- **Abort feature**: mata o processo do agente de uma feature especifica
- **Abort all**: mata todos os agentes e para o pipeline

### Implementacao

Estado do scheduler:
```typescript
type SchedulerState = 'running' | 'paused' | 'aborting';
```

- Pause: scheduler.state = 'paused', pump() nao despacha novas
- Resume: scheduler.state = 'running', pump() retoma
- Abort: SIGTERM no child process, finishRun com status 'aborted'

### Persistencia

Quando pausado, o estado eh salvo no DB para poder retomar entre sessoes:
- Quais features ja terminaram
- Quais estavam rodando (serao re-executadas no resume)
- Quais ainda estao pendentes

## Criterios de aceite

- [ ] `p` na TUI pausa o pipeline
- [ ] `r` na TUI retoma
- [ ] `x` aborta a feature selecionada
- [ ] Estado persistido entre sessoes (pode fechar e reabrir)
- [ ] `msq resume` via CLI retoma pipeline pausado
