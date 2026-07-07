import { dispatch } from '../notify/manager.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents } from './types.js';

export function attachEventNotifications(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('gate:created', ({ gateId, featureId }) => {
      const message = [
        `metal-squad: gate ${gateId} criado para ${featureId}`,
        `Responda: gate:${gateId} approve | gate:${gateId} skip | gate:${gateId} retry`,
      ].join('\n');
      void dispatch('gate:created', message, { gateId, featureId }).catch(() => {});
    }),
    eventBus.subscribe('stage:request-created', ({ requestId, featureId, stage, kind, prompt, source }) => {
      if (kind === 'approval') {
        const responseHint = source === 'auto'
          ? `Aprovacao automatica registrada para avancar apos ${stage}.`
          : `Responda: stage:${requestId} advance | stage:${requestId} hold | stage:${requestId} retry`;
        const message = [
          `metal-squad: ${featureId} concluiu a etapa ${stage}`,
          prompt,
          responseHint,
        ].join('\n');
        void dispatch('stage:approval', message, {
          requestId,
          featureId,
          stage,
          source: source ?? 'manual',
        }).catch(() => {});
        return;
      }

      const message = [
        `metal-squad: ${featureId} precisa de input humano na etapa ${stage}`,
        prompt,
        `Responda: input:${requestId} <texto>`,
      ].join('\n');
      void dispatch('stage:input', message, {
        requestId,
        featureId,
        stage,
      }).catch(() => {});
    }),
    eventBus.subscribe('run:failed', ({ featureId, error }) => {
      void dispatch('run:failed', `metal-squad: ${featureId} falhou — ${error}`, {
        featureId,
        error,
      }).catch(() => {});
    }),
    eventBus.subscribe('budget:alert', ({ percent, spent, limit }) => {
      void dispatch('budget:alert', `metal-squad: budget ${percent}% atingido (${spent}/${limit})`, {
        percent,
        spent,
        limit,
      }).catch(() => {});
    }),
    eventBus.subscribe('run:done', ({ featureId, result }) => {
      void dispatch('run:done', `metal-squad: ${featureId} concluido — ${result.summary}`, {
        featureId,
      }).catch(() => {});
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
