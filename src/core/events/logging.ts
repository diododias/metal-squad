import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents, OutputSource } from './types.js';

export function attachDefaultEventLogger(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('run:start', ({ featureId, tool }) => {
      console.log(`▶ ${featureId} (${tool})`);
    }),
    eventBus.subscribe('run:output', (event) => {
      const prefix = formatOutputPrefix(event.source, event.stream);
      const target = `${event.tool ?? 'tool'} ${event.featureId ?? `run-${event.runId}`}`;
      console.log(`[msq] ${target} ${prefix}: ${event.line}`);
    }),
    eventBus.subscribe('run:done', ({ featureId, result }) => {
      console.log(`✓ ${featureId} — ${result.summary}`);
    }),
    eventBus.subscribe('run:failed', ({ featureId, error }) => {
      console.log(`✗ ${featureId} — ${error}`);
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
