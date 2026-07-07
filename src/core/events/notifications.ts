import { dispatch } from '../notify/manager.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents } from './types.js';

export function attachEventNotifications(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('run:start', ({ featureId, tool }) => {
      void dispatch('run:start', `metal-squad: ${featureId} started with ${tool}`, {
        featureId,
        tool,
      }).catch(() => {});
    }),
    eventBus.subscribe('gate:created', ({ gateId, featureId }) => {
      const message = [
        `metal-squad: gate ${gateId} created for ${featureId}`,
        `Reply: gate:${gateId} approve | gate:${gateId} skip | gate:${gateId} retry`,
      ].join('\n');
      void dispatch('gate:created', message, { gateId, featureId }).catch(() => {});
    }),
    eventBus.subscribe('stage:request-created', ({ requestId, featureId, stage, kind, prompt, source }) => {
      if (kind === 'approval') {
        const responseHint = source === 'auto'
          ? `Auto-advance registered to proceed after ${stage}.`
          : `Reply: stage:${requestId} advance | stage:${requestId} hold | stage:${requestId} retry`;
        const message = [
          `metal-squad: ${featureId} completed stage ${stage}`,
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
        `metal-squad: ${featureId} needs human input at stage ${stage}`,
        prompt,
        `Reply: input:${requestId} <text>`,
      ].join('\n');
      void dispatch('stage:input', message, {
        requestId,
        featureId,
        stage,
      }).catch(() => {});
    }),
    eventBus.subscribe('run:failed', ({ featureId, error }) => {
      void dispatch('run:failed', `metal-squad: ${featureId} failed — ${error}`, {
        featureId,
        error,
      }).catch(() => {});
    }),
    eventBus.subscribe('budget:alert', ({ percent, spent, limit }) => {
      void dispatch('budget:alert', `metal-squad: budget ${percent}% reached (${spent}/${limit})`, {
        percent,
        spent,
        limit,
      }).catch(() => {});
    }),
    eventBus.subscribe('run:done', ({ featureId, result }) => {
      void dispatch('run:done', `metal-squad: ${featureId} done — ${result.summary}`, {
        featureId,
      }).catch(() => {});
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
