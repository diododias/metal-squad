import { dispatch } from '../notify/manager.js';
import { msqEventBus } from './bus.js';
import type { TypedEventBus } from './bus.js';
import type { MsqEvents } from './types.js';
import { getPausedPipelineIdForBudget, getRun } from '../../db/repo.js';
import { classifyBlockedOutcome } from '../orchestrator/autoPilot.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import { getAdapter } from '../adapters/index.js';
import type { Tool } from '../backlog/schema.js';

const SESSION_LIMIT_PREFIX = 'session limit reached:';

function isSessionLimitError(error: string): boolean {
  return error.toLowerCase().startsWith(SESSION_LIMIT_PREFIX);
}

function buildSessionLimitMessage(
  featureId: string,
  currentTool: Tool,
  pipelineId: number | null | undefined,
  cwd: string,
): {
  message: string;
  replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] };
} {
  const config = resolveRuntimeConfig(cwd);
  const availableTools = config.tools
    .filter((entry) => entry.id !== currentTool)
    .filter((entry) => {
      try {
        return getAdapter(entry.id, cwd).isAvailable?.() ?? true;
      } catch {
        return false;
      }
    })
    .map((entry) => entry.id);

  const baseLines = [
    `metal-squad: ${featureId} failed — adapter ${currentTool} hit session limit`,
    `To continue with another adapter, run:`,
  ];

  const resumeCommand = pipelineId
    ? `msq resume ${String(pipelineId)} --tool <adapter>`
    : `msq resume <pipeline> --tool <adapter>`;
  baseLines.push(resumeCommand);

  if (availableTools.length > 0) {
    baseLines.push(`Available tools: ${availableTools.join(', ')}`);
  }

  const message = baseLines.join('\n');

  if (!pipelineId || availableTools.length === 0) {
    return { message };
  }

  const replyMarkup = {
    inline_keyboard: [
      availableTools.map((tool) => ({
        text: `Resume with ${tool}`,
        callback_data: `resume_override:${String(pipelineId)}:${tool}`,
      })),
    ],
  };

  return { message, replyMarkup };
}

export function attachEventNotifications(
  eventBus: TypedEventBus<MsqEvents> = msqEventBus,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('run:start', ({ featureId, featureName, tool, stage }) => {
      const stageLabel = stage ? ` · stage: ${stage}` : '';
      void dispatch('run:start', `metal-squad: ${featureId} started with ${tool}${stageLabel}`, {
        featureId,
        tool,
        stage,
        ...(featureName ? { featureName } : {}),
      }).catch((error: unknown) => { console.error('[notify] run:start dispatch failed:', error); });
    }),
    eventBus.subscribe('gate:created', ({ gateId, featureId, featureName }) => {
      const message = [
        `metal-squad: gate ${String(gateId)} created for ${featureId}`,
        `Or reply: gate:${String(gateId)} approve | gate:${String(gateId)} skip | gate:${String(gateId)} retry`,
      ].join('\n');
      void dispatch('gate:created', message, {
        gateId,
        featureId,
        ...(featureName ? { featureName } : {}),
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Approve', callback_data: `gate:${String(gateId)} approve` },
            { text: '⏭ Skip', callback_data: `gate:${String(gateId)} skip` },
            { text: '🔄 Retry', callback_data: `gate:${String(gateId)} retry` },
          ]],
        },
      }).catch((error: unknown) => { console.error('[notify] gate:created dispatch failed:', error); });
    }),
    eventBus.subscribe('stage:request-created', ({ requestId, featureId, featureName, stage, kind, prompt, source, approvalChannel, options }) => {
      if (kind === 'approval') {
        if (source === 'auto') {
          const message = [
            `metal-squad: ${featureId} completed stage ${stage}`,
            prompt,
            `Auto-advance registered to proceed after ${stage}.`,
          ].join('\n');
          const metadata = {
            requestId,
            featureId,
            ...(featureName ? { featureName } : {}),
            stage,
            source: 'auto',
          };
          void (approvalChannel
            ? dispatch('stage:approval', message, metadata, approvalChannel)
            : dispatch('stage:approval', message, metadata)
          ).catch((error: unknown) => { console.error('[notify] stage:approval (auto) dispatch failed:', error); });
          return;
        }

        const message = [
          `metal-squad: ${featureId} completed stage "${stage}"`,
          prompt,
          `Or reply: stage:${String(requestId)} advance | stage:${String(requestId)} retry | stage:${String(requestId)} hold`,
        ].join('\n');
        const metadata = {
          requestId,
          featureId,
          ...(featureName ? { featureName } : {}),
          stage,
          source: 'manual',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Advance', callback_data: `stage:${String(requestId)} advance` },
              { text: '🔄 Retry', callback_data: `stage:${String(requestId)} retry` },
              { text: '⏸ Hold', callback_data: `stage:${String(requestId)} hold` },
            ]],
          },
        };
        void (approvalChannel
          ? dispatch('stage:approval', message, metadata, approvalChannel)
          : dispatch('stage:approval', message, metadata)
        ).catch((error: unknown) => { console.error('[notify] stage:approval (manual) dispatch failed:', error); });
        return;
      }

      const hasOptions = Boolean(options && options.length > 0);
      const message = [
        `metal-squad: ${featureId} needs human input at stage ${stage}`,
        prompt,
        ...(hasOptions ? [] : [`Reply: input:${String(requestId)} <text>`]),
      ].join('\n');
      void dispatch('stage:input', message, {
        requestId,
        featureId,
        ...(featureName ? { featureName } : {}),
        stage,
        ...(hasOptions
          ? {
              reply_markup: {
                inline_keyboard: (options ?? []).map((label, i) => [
                  { text: label, callback_data: `input:${String(requestId)}:${String(i)}` },
                ]),
              },
            }
          : {}),
      }).catch((error: unknown) => { console.error('[notify] stage:input dispatch failed:', error); });
    }),
    eventBus.subscribe('timeout:approval-created', (event) => {
      const stageLabel = event.stage ? `stage ${event.stage}` : 'feature run';
      const progress = event.lastProgress ? `\nLast progress: ${event.lastProgress}` : '';
      const message = [
        `metal-squad: ${event.featureId} ${stageLabel} timed out`,
        `Run ${String(event.runId)} ran for ${String(event.runtimeMs)}ms (limit ${String(event.timeoutMs)}ms).`,
        `Reason: execution exceeded the configured timeout.${progress}`,
        'Retry reruns only the affected stage; Keep blocked leaves the pipeline paused.',
        `Or reply: timeout:${String(event.requestId)} retry | timeout:${String(event.requestId)} keep_blocked`,
      ].join('\n');
      void dispatch('timeout:approval-created', message, {
        requestId: event.requestId,
        occurrenceId: event.occurrenceId,
        runId: event.runId,
        timeoutApprovalRequestId: event.requestId,
        featureId: event.featureId,
        ...(event.stage ? { stage: event.stage } : {}),
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Retry', callback_data: `timeout:${String(event.requestId)} retry` },
            { text: '⏸ Keep blocked', callback_data: `timeout:${String(event.requestId)} keep_blocked` },
          ]],
        },
      }).catch((error: unknown) => { console.error('[notify] timeout:approval-created dispatch failed:', error); });
    }),
    eventBus.subscribe('run:blocked', ({ runId, featureId, reason, code, gateId, summary }) => {
      // A persisted gate already emits the actionable approve/skip/retry
      // message. Keep run:blocked for logs and telemetry without duplicating
      // a second Telegram prompt for the same decision.
      if (gateId !== undefined) return;
      if (classifyBlockedOutcome(reason) !== 'blocked-human') return;

      const blockingCause = code ?? reason;
      const message = [
        `metal-squad: ${featureId} needs human intervention`,
        `Blocked: ${blockingCause}`,
        summary,
        `Or reply: blocked:approve:${String(runId)} | blocked:intervene:${String(runId)}`,
      ].join('\n');
      void dispatch('run:blocked', message, {
        runId,
        featureId,
        reason,
        ...(code ? { code } : {}),
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Aprovar avanço', callback_data: `blocked:approve:${String(runId)}` },
            { text: '🛠 Intervir', callback_data: `blocked:intervene:${String(runId)}` },
          ]],
        },
      }).catch((error: unknown) => { console.error('[notify] run:blocked dispatch failed:', error); });
    }),
    eventBus.subscribe('run:failed', ({ featureId, featureName, tool, error, runId, pipelineId, blocked }) => {
      const resolvedPipelineId = pipelineId ?? getRun(runId)?.pipeline_id;
      if (blocked || isSessionLimitError(error)) {
        const { message, replyMarkup } = buildSessionLimitMessage(
          featureId,
          tool,
          resolvedPipelineId,
          process.cwd(),
        );
        void dispatch('run:failed', message, {
          featureId,
          runId,
          pipelineId: resolvedPipelineId,
          ...(featureName ? { featureName } : {}),
          error,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }).catch((dispatchError: unknown) => { console.error('[notify] run:failed dispatch failed:', dispatchError); });
        return;
      }

      void dispatch('run:failed', `metal-squad: ${featureId} failed — ${error}`, {
        featureId,
        runId,
        pipelineId: resolvedPipelineId,
        ...(featureName ? { featureName } : {}),
        error,
      }).catch((dispatchError: unknown) => { console.error('[notify] run:failed dispatch failed:', dispatchError); });
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
      }).catch((error: unknown) => { console.error('[notify] budget:alert dispatch failed:', error); });
    }),
    eventBus.subscribe('run:done', ({ featureId, featureName, result }) => {
      void dispatch('run:done', `metal-squad: ${featureId} done — ${result.summary}`, {
        featureId,
        ...(featureName ? { featureName } : {}),
      }).catch((error: unknown) => { console.error('[notify] run:done dispatch failed:', error); });
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
