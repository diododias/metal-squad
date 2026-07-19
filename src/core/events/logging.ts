import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents, OutputSource } from './types.js';

/** Logs a caught error with context instead of letting it disappear silently into a fallback. */
export function logCaughtError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${context}] error: ${message}`);
  if (stack) console.error(stack);
}

/**
 * Guards a node-style async/promise callback so a synchronous throw inside it
 * is converted to a single labeled `console.error` instead of becoming an
 * unhandledRejection. Use this only for non-critical side effects (event
 * notification dispatch, telemetry writes); the caller still owns the
 * observable contract.
 */
export function safeAsync(context: string, fn: () => Promise<unknown>): void {
  void fn().catch((error: unknown) => { logCaughtError(context, error); });
}

export function attachDefaultEventLogger(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('run:start', ({ featureId, tool, stage }) => {
      const stageLabel = stage ? ` · ${stage}` : '';
      console.log(`▶ ${featureId} (${tool})${stageLabel}`);
    }),
    eventBus.subscribe('run:output', (event) => {
      // Heartbeat rows are diagnosed as a separate noisy stream but they aren't
      // useful as textual log lines for an operator tailing the runner console.
      if (event.source === 'heartbeat') return;
      const prefix = formatOutputPrefix(event.source, event.stream);
      const target = `${event.tool ?? 'tool'} ${event.featureId ?? `run-${String(event.runId)}`}`;
      console.log(`[msq] ${target} ${prefix}: ${event.line}`);
    }),
    eventBus.subscribe('run:done', ({ featureId, result }) => {
      console.log(`✓ ${featureId} — ${result.summary}`);
    }),
    eventBus.subscribe('run:failed', ({ featureId, error, kind }) => {
      const kindLabel = kind === 'aborted' ? ' (aborted)' : '';
      console.log(`✗ ${featureId}${kindLabel} — ${error}`);
    }),
    eventBus.subscribe('run:blocked', ({ featureId, reason, code, summary }) => {
      const detail = code ?? reason;
      console.log(`⊘ ${featureId} blocked (${detail}) — ${summary}`);
    }),
    eventBus.subscribe('gate:created', ({ gateId, featureId }) => {
      console.log(`⚠ gate ${String(gateId)} awaiting decision — ${featureId}`);
    }),
    eventBus.subscribe('gate:resolved', ({ gateId, decision }) => {
      console.log(`· gate ${String(gateId)} resolved as ${decision}`);
    }),
    eventBus.subscribe('stage:request-created', ({ featureId, stage, kind, source }) => {
      const label = kind === 'input' ? 'needs input' : `approval (${source ?? 'manual'})`;
      console.log(`⚠ ${featureId} · ${stage} ${label}`);
    }),
    eventBus.subscribe('stage:request-resolved', ({ requestId, response }) => {
      console.log(`· stage request ${String(requestId)} resolved as ${response}`);
    }),
    eventBus.subscribe('task:started', ({ featureId, taskId, title, stage }) => {
      const stageLabel = stage ? ` · ${stage}` : '';
      console.log(`· ${featureId} task ${taskId}${stageLabel} — ${title}`);
    }),
    eventBus.subscribe('task:updated', ({ featureId, taskId, status, stage, endedAt }) => {
      const stageLabel = stage ? ` · ${stage}` : '';
      const ended = endedAt ? ` @ ${endedAt}` : '';
      console.log(`· ${featureId} task ${taskId}${stageLabel} → ${status}${ended}`);
    }),
    eventBus.subscribe('budget:alert', ({ percent, spent, limit }) => {
      console.log(`⚠ budget ${String(percent)}% reached (${String(spent)}/${String(limit)})`);
    }),
    eventBus.subscribe('timeout:approval-created', ({ featureId, stage, runtimeMs, timeoutMs }) => {
      const stageLabel = stage ? ` · ${stage}` : '';
      console.log(`⏱ ${featureId}${stageLabel} timed out after ${String(runtimeMs)}ms (limit ${String(timeoutMs)}ms)`);
    }),
    eventBus.subscribe('autopilot:decision', ({ triggerFeatureId, triggerKind, action, reason }) => {
      console.log(`↻ autopilot ${triggerKind} on ${triggerFeatureId} → ${action} (${reason})`);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

function formatOutputPrefix(source: OutputSource | undefined, stream: 'stdout' | 'stderr'): string {
  if (!source || source === stream) return stream;
  return `${source}/${stream}`;
}
