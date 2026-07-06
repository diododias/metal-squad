import { notify } from '../notify/telegram.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents } from './types.js';

export function attachEventNotifications(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('gate:created', ({ gateId, featureId }) => {
      void Promise.resolve(notify(`metal-squad: gate ${gateId} criado para ${featureId}`)).catch(() => {});
    }),
    eventBus.subscribe('run:failed', ({ featureId, error }) => {
      void Promise.resolve(notify(`metal-squad: ${featureId} falhou — ${error}`)).catch(() => {});
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
