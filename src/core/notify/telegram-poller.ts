import { getSecret } from '../../security/secrets.js';
import { resolveGate, resolveStageRequest } from '../../db/repo.js';
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

function parseDecision(raw: string): GateDecision | null {
  const lower = raw.toLowerCase();
  if (lower.startsWith('approv')) return 'approved';
  if (lower.startsWith('skip')) return 'skipped';
  if (lower.startsWith('retr')) return 'retried';
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramPoller {
  private offset = 0;
  private stopped = false;
  private current: AbortController | null = null;

  start(): void {
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.current?.abort();
  }

  private async answerCallback(token: string, callbackQueryId: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    }).catch(() => {});
  }

  private async loop(): Promise<void> {
    const token = await getSecret('telegram-bot-token');
    if (!token) return;

    while (!this.stopped) {
      try {
        this.current = new AbortController();
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.offset}&timeout=25`;
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

          const inputMatch = INPUT_CMD.exec(text);
          if (inputMatch) {
            const requestId = inputMatch[1];
            const response = inputMatch[2];
            if (!requestId || !response) continue;
            try { resolveStageRequest(Number(requestId), response.trim()); } catch { /* DB may be unavailable */ }
            if (callbackId) void this.answerCallback(token, callbackId);
          }
        }
      } catch {
        if (this.stopped) break;
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
