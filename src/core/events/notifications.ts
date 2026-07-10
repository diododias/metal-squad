import { dispatch } from '../notify/manager.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents } from './types.js';
import { getPausedPipelineIdForBudget } from '../../db/repo.js';

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
      }).catch(() => { /* ignore dispatch errors */ });
    }),
    eventBus.subscribe('gate:created', ({ gateId, featureId }) => {
      const message = [
        `metal-squad: gate ${String(gateId)} created for ${featureId}`,
        `Or reply: gate:${String(gateId)} approve | gate:${String(gateId)} skip | gate:${String(gateId)} retry`,
      ].join('\n');
      void dispatch('gate:created', message, {
        gateId,
        featureId,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Approve', callback_data: `gate:${String(gateId)} approve` },
            { text: '⏭ Skip', callback_data: `gate:${String(gateId)} skip` },
            { text: '🔄 Retry', callback_data: `gate:${String(gateId)} retry` },
          ]],
        },
      }).catch(() => { /* ignore dispatch errors */ });
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
          }).catch(() => { /* ignore dispatch errors */ });
          return;
        }

        const message = [
          `metal-squad: ${featureId} completed stage "${stage}"`,
          prompt,
          `Or reply: stage:${String(requestId)} advance | stage:${String(requestId)} retry | stage:${String(requestId)} hold`,
        ].join('\n');
        void dispatch('stage:approval', message, {
          requestId,
          featureId,
          stage,
          source: 'manual',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Advance', callback_data: `stage:${String(requestId)} advance` },
              { text: '🔄 Retry', callback_data: `stage:${String(requestId)} retry` },
              { text: '⏸ Hold', callback_data: `stage:${String(requestId)} hold` },
            ]],
          },
        }).catch(() => { /* ignore dispatch errors */ });
        return;
      }

      const message = [
        `metal-squad: ${featureId} needs human input at stage ${stage}`,
        prompt,
        `Reply: input:${String(requestId)} <text>`,
      ].join('\n');
      void dispatch('stage:input', message, {
        requestId,
        featureId,
        stage,
      }).catch(() => { /* ignore dispatch errors */ });
    }),
    eventBus.subscribe('run:failed', ({ featureId, error }) => {
      void dispatch('run:failed', `metal-squad: ${featureId} failed — ${error}`, {
        featureId,
        error,
      }).catch(() => { /* ignore dispatch errors */ });
    }),
    eventBus.subscribe('budget:alert', ({ percent, spent, limit }) => {
      const pipelineId = getPausedPipelineIdForBudget();
      const reply_markup = pipelineId
        ? {
            inline_keyboard: [[
              { text: '\u25b6\ufe0f Resume Pipeline', callback_data: `resume_pipeline:${String(pipelineId)}` },
            ]],
          }
        : undefined;

      void dispatch('budget:alert', `metal-squad: budget ${String(percent)}% reached (${String(spent)}/${String(limit)})`, {
        percent,
        spent,
        limit,
        reply_markup,
      }).catch(() => { /* ignore dispatch errors */ });
    }),
    eventBus.subscribe('run:done', ({ featureId, result }) => {
      void dispatch('run:done', `metal-squad: ${featureId} done — ${result.summary}`, {
        featureId,
      }).catch(() => { /* ignore dispatch errors */ });
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
