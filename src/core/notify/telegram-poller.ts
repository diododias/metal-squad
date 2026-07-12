import { getSecret } from '../../security/secrets.js';
import { getStageRequest, resolveGate, resolveStageRequest, resumePipeline } from '../../db/repo.js';
import type { GateDecision } from '../../db/repo.js';

interface TelegramUpdate {
  update_id: number;
  message?: { text?: string };
  callback_query?: { id: string; data?: string };
}

// Matches: gate:42 approve, gate:42 skip, gate:42 retry (and word variants)
const GATE_CMD = /gate:(\d+)\s+(approv(?:e|ed)|skip(?:ped)?|retr(?:y|ied))/i;
const STAGE_CMD = /stage:(\d+)\s+(advance|hold|retry)/i;
const INPUT_CMD = /^input:(\d+)\s+([\s\S]+)$/i;
// Matches a tap on an option button: input:<requestId>:<optionIndex>
const INPUT_OPTION_CMD = /^input:(\d+):(\d+)$/;

function parseDecision(raw: string): GateDecision | null {
  const lower = raw.toLowerCase();
  if (lower.startsWith('approv')) return 'approved';
  if (lower.startsWith('skip')) return 'skipped';
  if (lower.startsWith('retr')) return 'retried';
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    }).catch(() => { /* ignore answer errors */ });
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
          const text = update.message?.text ?? update.callback_query?.data ?? '';
          const match = GATE_CMD.exec(text);
          if (match) {
            const gateId = Number(match[1]);
            const decision = match[2] ? parseDecision(match[2]) : null;
            if (decision !== null) {
              try { resolveGate(gateId, decision); } catch { /* DB may be unavailable */ }
            }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const stageMatch = STAGE_CMD.exec(text);
          if (stageMatch) {
            const requestId = stageMatch[1];
            const response = stageMatch[2];
            if (!requestId || !response) continue;
            try { resolveStageRequest(Number(requestId), response.toLowerCase()); } catch { /* DB may be unavailable */ }
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
              if (label !== undefined) resolveStageRequest(requestId, label);
            } catch { /* DB may be unavailable */ }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          const inputMatch = INPUT_CMD.exec(text);
          if (inputMatch) {
            const requestId = inputMatch[1];
            const response = inputMatch[2];
            if (!requestId || !response) continue;
            try { resolveStageRequest(Number(requestId), response.trim()); } catch { /* DB may be unavailable */ }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }

          if (text.startsWith('resume_pipeline:')) {
            const pipelineId = Number(text.split(':')[1]);
            if (pipelineId) {
              try { resumePipeline(pipelineId); } catch { /* DB may be unavailable */ }
            }
            if (callbackId) void this.answerCallback(token, callbackId);
            continue;
          }
        }
      } catch {
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
