import { dispatch } from '../notify/manager.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents } from './types.js';

export function attachEventNotifications(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('run:start', ({ featureId, tool, stage }) => {
      const stageLabel = stage ? ` · stage: ${stage}` : '';
      void dispatch('run:start', `metal-squad: ${featureId} started with ${tool}${stageLabel}`, {
        featureId,
        tool,
        stage,
      }).catch(() => {});
    }),
    eventBus.subscribe('gate:created', ({ gateId, featureId }) => {
      const message = [
        `metal-squad: gate ${gateId} created for ${featureId}`,
        `Or reply: gate:${gateId} approve | gate:${gateId} skip | gate:${gateId} retry`,
      ].join('\n');
      void dispatch('gate:created', message, {
        gateId,
        featureId,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Approve', callback_data: `gate:${gateId} approve` },
            { text: '⏭ Skip', callback_data: `gate:${gateId} skip` },
            { text: '🔄 Retry', callback_data: `gate:${gateId} retry` },
          ]],
        },
      }).catch(() => {});
    }),
    eventBus.subscribe('stage:request-created', ({ requestId, featureId, stage, kind, prompt, source }) => {
      if (kind === 'approval') {
        if (source === 'auto') {
          const message = [
            `metal-squad: ${featureId} completed stage ${stage}`,
            prompt,
            `Auto-advance registered to proceed after ${stage}.`,
          ].join('\n');
          void dispatch('stage:approval', message, {
            requestId,
            featureId,
            stage,
            source: 'auto',
          }).catch(() => {});
          return;
        }

        const message = [
          `metal-squad: ${featureId} completed stage "${stage}"`,
          prompt,
          `Or reply: stage:${requestId} advance | stage:${requestId} retry | stage:${requestId} hold`,
        ].join('\n');
        void dispatch('stage:approval', message, {
          requestId,
          featureId,
          stage,
          source: 'manual',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Advance', callback_data: `stage:${requestId} advance` },
              { text: '🔄 Retry', callback_data: `stage:${requestId} retry` },
              { text: '⏸ Hold', callback_data: `stage:${requestId} hold` },
            ]],
          },
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
