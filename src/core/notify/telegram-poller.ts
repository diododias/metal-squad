import { getSecret } from '../../security/secrets.js';
import { resolveRuntimeConfig } from '../../config/index.js';
import { msqEventBus } from '../events/bus.js';
import { logCaughtError } from '../events/logging.js';
import { resumeBlockedRun } from '../runner/resume-blocked-run.js';
import { resumePipelineWithOverride } from './resume-override.js';
import type { Tool } from '../backlog/schema.js';
import {
  getFeatureTopicAssociation,
  getGate,
  getStageRequest,
  getTimeoutApprovalRequest,
  resolveTimeoutApproval,
  resolveGate,
  resolveStageRequest,
  resumePipeline,
  recordCallbackProcessed,
  isCallbackProcessed,
} from '../../db/repo.js';
import type { GateDecision } from '../../db/repo.js';

interface TelegramChat {
  id: string | number;
  type?: string;
}

interface TelegramMessage {
  text?: string;
  chat?: TelegramChat;
  message_thread_id?: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: { id: string; data?: string; message?: TelegramMessage };
}

// Matches: gate:42 approve, gate:42 skip, gate:42 retry (and word variants)
const GATE_CMD = /gate:(\d+)\s+(approv(?:e|ed)|skip(?:ped)?|retr(?:y|ied))/i;
const STAGE_CMD = /stage:(\d+)\s+(advance|hold|retry)/i;
const INPUT_CMD = /^input:(\d+)\s+([\s\S]+)$/i;
// Matches a tap on an option button: input:<requestId>:<optionIndex>
const INPUT_OPTION_CMD = /^input:(\d+):(\d+)$/;
const TIMEOUT_CMD = /^timeout:(\d+)\s+(retry|keep_blocked)$/i;
const BLOCKED_CMD = /^blocked:(approve|intervene):(\d+)$/i;
const RESUME_OVERRIDE_CMD = /^resume_override:(\d+):([a-z]+)$/i;

function parseDecision(raw: string): GateDecision | null {
  const lower = raw.toLowerCase();
  if (lower.startsWith('approv')) return 'approved';
  if (lower.startsWith('skip')) return 'skipped';
  if (lower.startsWith('retr')) return 'retried';
  return null;
}

function configuredTelegramChatId(): string | undefined {
  const config = resolveRuntimeConfig(process.cwd());
  const explicit = config.notifications.channels.find((channel) => channel.type === 'telegram');
  return explicit?.type === 'telegram' ? explicit.chatId : undefined;
}

function updateContext(update: TelegramUpdate): { chatId?: string; threadId?: number } {
  const message = update.callback_query?.message ?? update.message;
  return {
    chatId: message?.chat?.id !== undefined ? String(message.chat.id) : undefined,
    threadId: message?.message_thread_id,
  };
}

function matchesConfiguredChat(chatId: string | undefined, configuredChatId: string | undefined): boolean {
  return configuredChatId === undefined || chatId === configuredChatId;
}

function matchesFeatureTopic(
  featureId: string | undefined,
  update: TelegramUpdate,
): boolean {
  const configuredChatId = configuredTelegramChatId();
  const context = updateContext(update);
  if (configuredChatId !== undefined && !featureId && context.chatId === undefined) return true;
  if (!matchesConfiguredChat(context.chatId, configuredChatId)) return false;
  if (configuredChatId === undefined) return true;
  if (!featureId || context.chatId === undefined || context.threadId === undefined) return false;
  const association = getFeatureTopicAssociation(context.chatId, featureId);
  return association?.state === 'active' && association.threadId === context.threadId;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notifyActionFailed(action: string, error: unknown): void {
  logCaughtError(`telegram-poller.${action}`, error);
  msqEventBus.emit('ui:notice', { message: `Telegram action "${action}" failed silently — check logs.` });
}

export class TelegramPoller {
  private offset = 0;
  private stopped = false;
  private current: AbortController | null = null;

  public start(): void {
    void this.loop();
  }

  public stop(): void {
    this.stopped = true;
    this.current?.abort();
  }

  private async answerCallback(token: string, callbackQueryId: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    }).catch((error: unknown) => { logCaughtError('telegram-poller.answerCallback', error); });
  }

  private async loop(): Promise<void> {
    const token = await getSecret('telegram-bot-token');
    if (!token) return;

    while (!this.stopped) {
      try {
        this.current = new AbortController();
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${String(this.offset)}&timeout=25`;
        const res = await fetch(url, { signal: this.current.signal });
        if (!res.ok) { await sleep(5_000); continue; }

        const body = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
        if (!body.ok) { await sleep(5_000); continue; }

        for (const update of body.result) {
          this.offset = update.update_id + 1;
          const callbackId = update.callback_query?.id;
          if (callbackId && isCallbackProcessed(callbackId)) {
            void this.answerCallback(token, callbackId);
            continue;
          }
          const text = update.message?.text ?? update.callback_query?.data ?? '';
          const match = GATE_CMD.exec(text);
          if (match) {
            const gateId = Number(match[1]);
            const decision = match[2] ? parseDecision(match[2]) : null;
            let featureId: string | undefined;
            try {
              const gate = typeof getGate === 'function' ? getGate(gateId) : null;
              featureId = gate?.featureId;
            } catch (error) { logCaughtError('telegram-poller.getGate', error); }
            if (decision !== null && matchesFeatureTopic(featureId, update)) {
              try { resolveGate(gateId, decision); } catch (error) { notifyActionFailed('resolveGate', error); }
            }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const stageMatch = STAGE_CMD.exec(text);
          if (stageMatch) {
            const requestId = stageMatch[1];
            const response = stageMatch[2];
            if (!requestId || !response) continue;
            let featureId: string | undefined;
            if (updateContext(update).chatId !== undefined) {
              try { featureId = getStageRequest(Number(requestId))?.featureId; } catch (error) { logCaughtError('telegram-poller.getStageRequest', error); }
            }
            if (matchesFeatureTopic(featureId, update)) {
              try { resolveStageRequest(Number(requestId), response.toLowerCase()); } catch (error) { notifyActionFailed('resolveStageRequest', error); }
            }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const inputOptionMatch = INPUT_OPTION_CMD.exec(text);
          if (inputOptionMatch) {
            const requestId = Number(inputOptionMatch[1]);
            const optionIndex = Number(inputOptionMatch[2]);
            try {
              const row = getStageRequest(requestId);
              const label = row?.status === 'pending' ? row.options?.[optionIndex] : undefined;
              if (label !== undefined && matchesFeatureTopic(row?.featureId, update)) {
                resolveStageRequest(requestId, label);
              }
            } catch (error) { notifyActionFailed('resolveStageRequest(option)', error); }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const timeoutMatch = TIMEOUT_CMD.exec(text);
          if (timeoutMatch) {
            const requestId = Number(timeoutMatch[1]);
            const decision = timeoutMatch[2]?.toLowerCase() as 'retry' | 'keep_blocked' | undefined;
            try {
              const request = typeof getTimeoutApprovalRequest === 'function'
                ? getTimeoutApprovalRequest(requestId)
                : null;
              const context = updateContext(update);
              if (request && decision && matchesConfiguredChat(context.chatId, configuredTelegramChatId())) {
                const won = typeof resolveTimeoutApproval === 'function'
                  && resolveTimeoutApproval(requestId, decision, {
                    featureId: request.featureId,
                    runId: request.runId,
                    stage: request.stage,
                    ...(context.chatId ? { chatId: context.chatId } : {}),
                    ...(context.threadId !== undefined ? { threadId: context.threadId } : {}),
                  });
                void won;
              }
            } catch (error) { notifyActionFailed('resolveTimeoutApproval', error); }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const blockedMatch = BLOCKED_CMD.exec(text);
          if (blockedMatch) {
            const action = blockedMatch[1]?.toLowerCase();
            const runId = Number(blockedMatch[2]);
            if (action === 'approve') {
              try { resumeBlockedRun(runId); } catch (error) { notifyActionFailed('resumeBlockedRun', error); }
            } else {
              msqEventBus.emit('ui:info', { message: `Blocked run ${String(runId)} remains blocked for human intervention.` });
            }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const inputMatch = INPUT_CMD.exec(text);
          if (inputMatch) {
            const requestId = inputMatch[1];
            const response = inputMatch[2];
            if (!requestId || !response) continue;
            let featureId: string | undefined;
            if (updateContext(update).chatId !== undefined) {
              try { featureId = getStageRequest(Number(requestId))?.featureId; } catch (error) { logCaughtError('telegram-poller.getStageRequest', error); }
            }
            if (matchesFeatureTopic(featureId, update)) {
              try { resolveStageRequest(Number(requestId), response.trim()); } catch (error) { notifyActionFailed('resolveStageRequest', error); }
            }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const resumeOverrideMatch = RESUME_OVERRIDE_CMD.exec(text);
          if (resumeOverrideMatch) {
            const pipelineId = Number(resumeOverrideMatch[1]);
            const tool: Tool = resumeOverrideMatch[2] ?? '';
            if (pipelineId && tool && callbackId) {
              const recorded = recordCallbackProcessed(callbackId, 'resume_override', { pipelineId, tool });
              if (recorded && matchesConfiguredChat(updateContext(update).chatId, configuredTelegramChatId())) {
                try { resumePipelineWithOverride({ pipelineId, tool }); } catch (error) { notifyActionFailed('resumePipelineWithOverride', error); }
              }
              void this.answerCallback(token, callbackId);
            }
            continue;
          }

          if (text.startsWith('resume_pipeline:')) {
            const pipelineId = Number(text.split(':')[1]);
            if (pipelineId && matchesConfiguredChat(updateContext(update).chatId, configuredTelegramChatId())) {
              try { resumePipeline(pipelineId); } catch (error) { notifyActionFailed('resumePipeline', error); }
            }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }
        }
      } catch (error) {
        logCaughtError('telegram-poller.loop', error);
        if (this.stopped) break; // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- stopped may change during await
        await sleep(5_000);
      }
    }
  }
}

let activePoller: TelegramPoller | null = null;

export function startTelegramPoller(): void {
  if (activePoller) return;
  activePoller = new TelegramPoller();
  activePoller.start();
}

export function stopTelegramPoller(): void {
  activePoller?.stop();
  activePoller = null;
}
