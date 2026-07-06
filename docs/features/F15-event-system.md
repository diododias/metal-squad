# F15 — Event System (pub/sub interno)

**Epic**: [E03 — Orchestration v2](../epics/E03-orchestration-v2.md)
**Prioridade**: Critica (fundacao para F06, F12, F16)
**Esforco**: Medium

## Problema

Nao ha mecanismo de comunicacao entre o runner/scheduler e a TUI. O runner faz console.log, a TUI faz polling no DB. Nao ha streaming, nao ha reatividade.

## Solucao

### EventEmitter tipado

```typescript
interface MsqEvents {
  'run:start': { runId: number; featureId: string; tool: string };
  'run:output': { runId: number; line: string; stream: 'stdout' | 'stderr' };
  'run:done': { runId: number; result: RunResult };
  'run:failed': { runId: number; error: string };
  'gate:created': { gateId: number; featureId: string };
  'gate:resolved': { gateId: number; decision: GateDecision };
  'scheduler:paused': {};
  'scheduler:resumed': {};
  'budget:alert': { percent: number; spent: number; limit: number };
  'tokens:update': { runId: number; input: number; output: number };
}

const bus = new TypedEventEmitter<MsqEvents>();
```

### Usos

- **TUI**: subscribe a eventos para atualizar em tempo real (sem polling)
- **Notifications**: subscribe a `gate:created`, `budget:alert` para enviar
- **Log streaming**: `run:output` direto na TUI
- **Analytics**: `tokens:update` acumula custos em real-time

### Transporte

- In-process: EventEmitter direto (TUI e runner no mesmo processo)
- Cross-process (futuro): unix socket ou file-based events para TUI separada

## Criterios de aceite

- [ ] EventEmitter tipado com todos os eventos
- [ ] Runner emite eventos em vez de console.log
- [ ] TUI consome eventos em vez de polling
- [ ] Notification system usa eventos
