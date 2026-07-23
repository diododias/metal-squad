import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';
import type { MsqEvents } from '../core/events/types.js';
import { msqEventBus, logCaughtError } from '../core/events/index.js';
import { startTelegramPoller, stopTelegramPoller } from '../core/notify/telegram-poller.js';
import { assertWritableDbPath } from '../db/index.js';
import {
  abortPipeline,
  forceResolveGate,
  getPipeline,
  getRun,
  getProjectStateRevision,
  listCompletedFeatureIds,
  listRunEvents,
  listRunHistoryForFeature,
  getRunSessionStatus,
  listRunOutput,
  listRunOutputAfterId,
  listRunToolCalls,
  listTaskRunsForRun,
  pausePipeline,
  requestFeatureAbort,
  resolveGate,
  resolveStageRequest,
  resumePipeline,
  getEpicTemplateTarget,
  getWorkItemTemplateTarget,
  isWorkItemPristine,
  changeWorkItemType,
  listArchivedProjects,
  countArchivedProjects,
  listArchivedEpics,
  countArchivedEpics,
  listAuditEvents,
  projectLifecycleActions,
  getProject,
  type WorkItemTemplateSnapshot,
  type ProjectRow,
  type EpicRow,
  type WorkItemRow,
} from '../db/repo.js';
import { RevisionConflictError, WorkItemHasHistoryError } from '../db/errors.js';
import { getAdapter } from '../core/adapters/index.js';
import { computeRunBreakdown } from '../core/stats.js';
import { countAnalyticsWorkItems, getAnalyticsDataQuality, getAnalyticsInsights, getAnalyticsSummary, getTokenBreakdowns, getTokenTimeSeries, listAnalyticsRunDrilldown, listAnalyticsWorkItems } from '../db/analytics.js';
import { resolveRepo, resolveRepoAllowlist } from '../core/repo.js';
import { resolveWorkItemExecutionContext } from '../core/workItemExecutionContext.js';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { assertNoCrossRepositoryDependencies, selectStartableFeaturePlan } from '../core/orchestrator/graph.js';
import { validateBacklogSkills } from '../core/skills/index.js';
import { ConfigSchema, loadConfig, resolveRuntimeConfig, saveAppConfigPatch, saveConfig, saveNotificationsPatch, type NotificationsPatch, type ToolRegistryEntry } from '../config/index.js';
import { assertConfiguredNotificationChannel } from '../core/notify/manager.js';
import { clearSecret, setSecret } from '../security/secrets.js';
import { getFeatureIdOwner, updateCatalogFeature, updateCatalogTask, updateCatalogDefaults, listWorkItemsByScope, countWorkItemsByScope, type FeaturePatch, type CatalogDefaultsPatch } from '../db/backlogCatalog.js';
import type { Feature, Task } from '../core/backlog/schema.js';
import { epicService } from '../core/epicService.js';
import { workItemService } from '../core/workItemService.js';
import { projectService, repoLinkService } from '../core/projectService.js';
import { buildMsqWebState, appendNotification, resetWebStateCaches, invalidateWorkflowTemplatesCache } from './state.js';
import { createWebAuth, isAllowedHostHeader, isAllowedOrigin, timingSafeEqualStrings } from './auth.js';
import { EpicActionMessageSchema, LifecycleActionMessageSchema, ProjectActionMessageSchema, RepositoryActionMessageSchema, WorkItemActionMessageSchema, WorkflowTemplateActionMessageSchema, WorkItemTypeChangeMessageSchema, ResolveWorkflowTemplateMessageSchema, WorkflowTemplateDefinitionMessageSchema, ValidateWorkflowTemplateMessageSchema, ArchivedQueryMessageSchema, AuditTrailQueryMessageSchema, AnalyticsWorkItemsMessageSchema, AnalyticsBreakdownMessageSchema, AnalyticsRunDrilldownMessageSchema } from './schemas.js';
import {
  archiveWorkflowTemplate,
  createWorkflowTemplate,
  duplicateWorkflowTemplate,
  getWorkflowTemplate,
  mapProjectWorkItemTemplate,
  resolveTemplate,
  updateWorkflowTemplate,
  validateTemplateAgainstRepos,
  type WorkflowTemplate,
} from '../db/workflowTemplates.js';
import type {
  AllowedLifecycle,
  AppConfigPatch,
  ArchivedEntry,
  ArchivedQueryResult,
  AuditTimelineEntry,
  AuditTrailQueryResult,
  AnalyticsBreakdownResult,
  AnalyticsRunDrilldownResult,
  AnalyticsWorkItemsResult,
  EpicActionError,
  EpicActionResult,
  LifecycleActionError,
  LifecycleActionResult,
  FeatureConfigPatch,
  FeatureConfigSaveIssue,
  FeatureConfigSaveResult,
  BudgetConfigPatch,
  ProjectDefaultsPatch,
  ProjectActionError,
  ProjectActionResult,
  RepositoryActionResult,
  RunChangesPayload,
  SecretPatch,
  TaskConfigPatch,
  UiNotification,
  WorkItemActionError,
  WorkItemActionResult,
  MsqWorkItemType,
  ResolveWorkflowTemplateResult,
  WebSocketClientMessage,
  WebSocketServerMessage,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATIC_DIR = join(__dirname, 'static');

/** Defensive fallback for an archived-listing row whose lifecycle projection
 * lookup somehow misses (should not happen: every listed id is fed straight
 * into `projectLifecycleActions`). Offers nothing rather than guessing. */
const DEFAULT_ALLOWED_LIFECYCLE: AllowedLifecycle = {
  state: 'pristine', archived: true, deleted: false, archive: false, delete: false,
  cancel: false, restore: false, blockedReason: 'Lifecycle state unavailable.',
};

interface HeartbeatWebSocket extends WebSocket {
  isAlive: boolean;
}

interface Client {
  socket: HeartbeatWebSocket;
  authenticated: boolean;
  outputSubscriptions: Set<number>;
  outputLastIdByRun: Map<number, number>;
  detailSubscriptions: Set<number>;
  historySubscriptions: Set<string>;
  changesSubscriptions: Set<number>;
  detailPayloadSignatures: Map<number, string>;
  historyPayloadSignatures: Map<string, string>;
  changesPayloadSignatures: Map<number, string>;
}

// F34 item 2: git status/diff for a run's working directory. Runs against
// the server's own cwd (the repo msq operates on today, no per-run
// worktrees) — see docs/features/F34-web-run-detail-and-control-polish.md
// item 2 for the accepted limitation (a run's "changes" can include
// unrelated edits made manually to the repo during the run).
//
// GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE (and friends) take priority over
// `cwd`-based repo discovery when present in the environment — which they
// are whenever this process is a descendant of a git hook (e.g. the msq
// server started, however indirectly, under a pre-commit run). Without
// stripping them, `git` here would silently operate on the ancestor
// process's repo/index instead of `cwd`.
const GIT_ENV_OVERRIDE = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);

const MAX_AUTH_BODY_BYTES = 8192;

/** Reads a request body up to a size cap, rejecting oversized payloads
 * instead of buffering unbounded attacker-controlled input. */
async function readRequestBody(req: IncomingMessage, maxBytes = MAX_AUTH_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function renderLoginPage(error: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>msq web login</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #111; color: #eee; }
  form { background: #1c1c1c; padding: 2rem; border-radius: 8px; min-width: 280px; }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  input { width: 100%; padding: 0.5rem; margin: 0.5rem 0 1rem; box-sizing: border-box; border-radius: 4px; border: 1px solid #333; background: #0d0d0d; color: #eee; }
  button { width: 100%; padding: 0.5rem; cursor: pointer; border-radius: 4px; border: none; background: #4a7dff; color: #fff; }
  .error { color: #f66; margin: 0 0 0.75rem; font-size: 0.9rem; }
</style>
</head>
<body>
<form method="post" action="/auth">
  <h1>msq web</h1>
  ${error ? '<p class="error">Incorrect password.</p>' : ''}
  <input type="password" name="password" placeholder="Password" autofocus required autocomplete="current-password" />
  <button type="submit">Log in</button>
</form>
</body>
</html>`;
}

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: GIT_ENV_OVERRIDE,
  });
}

function computeRunChanges(runId: number, cwd: string): RunChangesPayload {
  try {
    runGit(['rev-parse', '--is-inside-work-tree'], cwd);
  } catch (error) {
    logCaughtError('web/server.computeRunChanges.notAGitRepo', error);
    return {
      runId,
      branch: null,
      remoteUrl: null,
      files: [],
      notApplicableReason: "No git repository detected for this run's working directory.",
    };
  }

  let branch: string | null = null;
  try {
    branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).trim() || null;
  } catch (error) {
    logCaughtError('web/server.computeRunChanges.branch', error);
    branch = null;
  }

  let remoteUrl: string | null = null;
  try {
    remoteUrl = runGit(['config', '--get', 'remote.origin.url'], cwd).trim() || null;
  } catch (error) {
    logCaughtError('web/server.computeRunChanges.remoteUrl', error);
    remoteUrl = null;
  }

  let statusOutput = '';
  try {
    statusOutput = runGit(['status', '--porcelain'], cwd);
  } catch (error) {
    logCaughtError('web/server.computeRunChanges.statusOutput', error);
    statusOutput = '';
  }

  let numstatOutput = '';
  try {
    numstatOutput = runGit(['diff', '--numstat', 'HEAD'], cwd);
  } catch (error) {
    logCaughtError('web/server.computeRunChanges.numstatHead', error);
    try {
      numstatOutput = runGit(['diff', '--numstat'], cwd);
    } catch (fallbackError) {
      logCaughtError('web/server.computeRunChanges.numstatFallback', fallbackError);
      numstatOutput = '';
    }
  }

  const statsByPath = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstatOutput.split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted, path] = line.split('\t');
    if (!path) continue;
    statsByPath.set(path, {
      additions: added === '-' ? 0 : Number(added),
      deletions: deleted === '-' ? 0 : Number(deleted),
    });
  }

  const files: RunChangesPayload['files'] = [];
  for (const line of statusOutput.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).trim();
    const status = code.includes('D') ? 'deleted' : code.includes('A') || code.includes('?') ? 'added' : 'modified';
    const stat = statsByPath.get(path) ?? { additions: 0, deletions: 0 };
    files.push({ path, status, additions: stat.additions, deletions: stat.deletions });
  }

  return { runId, branch, remoteUrl, files, notApplicableReason: null };
}

function computeRunChangesForWorkItem(runId: number): RunChangesPayload {
  const run = getRun(runId);
  if (!run) {
    return { runId, branch: null, remoteUrl: null, files: [], notApplicableReason: 'Run was not found.' };
  }
  try {
    const context = resolveWorkItemExecutionContext(run.feature_id);
    if (context.repoId !== run.repo_id) {
      return {
        runId,
        branch: null,
        remoteUrl: null,
        files: [],
        notApplicableReason: 'Run repository no longer matches its Work Item repository.',
      };
    }
    return computeRunChanges(runId, context.cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logCaughtError('web/server.computeRunChangesForWorkItem', error);
    return { runId, branch: null, remoteUrl: null, files: [], notApplicableReason: message };
  }
}

const BROADCAST_EVENTS: (keyof MsqEvents)[] = [
  'run:start',
  'run:status',
  'tool:call',
  'run:done',
  'run:failed',
  'run:blocked',
  'run:output',
  'tokens:update',
  'gate:created',
  'gate:resolved',
  'stage:request-created',
  'stage:request-resolved',
  'task:started',
  'task:updated',
  'ui:info',
  'ui:notice',
  'budget:alert',
  'autopilot:decision',
];

export interface RunningWebServer {
  server: Server;
  wss: WebSocketServer;
  url: string;
  close: () => Promise<void>;
}

/**
 * Maps a high-signal broadcast event into a {@link UiNotification} so the web
 * dashboard can surface it as a toast without diffing raw event payloads. The
 * notification survives across `reconcileWebState` rebuilds because
 * `buildCurrentState` preserves `latestState.notifications`.
 *
 * Returns `null` for events that are either too noisy (every `run:output`
 * line) or already adequately covered by the receiving component (e.g. status
 * diffs that flow into the run detail view).
 */
function buildEventNotification(
  event: keyof MsqEvents,
  payload: MsqEvents[keyof MsqEvents],
): UiNotification | null {
  const now = new Date().toISOString();
  const id = `${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
  if (event === 'ui:info') {
    const message = (payload as { message?: string }).message ?? '';
    if (!message) return null;
    return { id, type: 'info', tone: 'info', event, message, createdAt: now };
  }
  if (event === 'ui:notice') {
    const message = (payload as { message?: string }).message ?? '';
    if (!message) return null;
    return { id, type: 'notice', tone: 'warn', event, message, createdAt: now };
  }
  if (event === 'run:done') {
    const p = payload as { featureId?: string; result?: { summary?: string } };
    const featureId = p.featureId ?? 'feature';
    const summary = p.result?.summary ?? 'done';
    return { id, type: 'info', tone: 'ok', event, message: `${featureId} done — ${summary}`, createdAt: now };
  }
  if (event === 'run:failed') {
    const p = payload as { featureId?: string; error?: string; kind?: string };
    const featureId = p.featureId ?? 'feature';
    const error = p.error ?? 'unknown error';
    const kindLabel = p.kind === 'aborted' ? ' (aborted)' : '';
    return { id, type: 'notice', tone: 'danger', event, message: `${featureId} failed${kindLabel} — ${error}`, createdAt: now };
  }
  if (event === 'run:blocked') {
    const p = payload as { featureId?: string; code?: string; reason?: string; summary?: string };
    const featureId = p.featureId ?? 'feature';
    const detail = p.code ?? p.reason ?? 'blocked';
    return { id, type: 'notice', tone: 'warn', event, message: `${featureId} blocked (${detail}) — ${p.summary ?? ''}`.trim(), createdAt: now };
  }
  if (event === 'gate:created') {
    const p = payload as { gateId?: number; featureId?: string };
    const featureId = p.featureId ?? 'feature';
    return { id, type: 'notice', tone: 'warn', event, message: `${featureId} — gate awaiting decision`, createdAt: now };
  }
  if (event === 'stage:request-created') {
    const p = payload as { featureId?: string; stage?: string; kind?: string };
    const featureId = p.featureId ?? 'feature';
    const stageLabel = p.stage ? ` · ${p.stage}` : '';
    const action = p.kind === 'input' ? 'needs input' : 'awaiting approval';
    return { id, type: 'notice', tone: 'warn', event, message: `${featureId}${stageLabel} — ${action}`, createdAt: now };
  }
  if (event === 'budget:alert') {
    const p = payload as { percent?: number; spent?: number; limit?: number };
    return {
      id, type: 'notice', tone: 'warn', event,
      message: `Budget ${String(p.percent ?? '?')}% reached (${String(p.spent ?? '?')}/${String(p.limit ?? '?')})`,
      createdAt: now,
    };
  }
  if (event === 'timeout:approval-created') {
    const p = payload as { featureId?: string; stage?: string };
    const featureId = p.featureId ?? 'feature';
    const stageLabel = p.stage ? ` · ${p.stage}` : '';
    return { id, type: 'notice', tone: 'warn', event, message: `${featureId}${stageLabel} — timed out (retry or keep blocked?)`, createdAt: now };
  }
  return null;
}

export function createWebServer(options: {
  host: string;
  port: number;
  auth: 'token' | 'none';
  token: string;
  cwd?: string;
}): RunningWebServer {
  const clients = new Map<HeartbeatWebSocket, Client>();
  const cwd = options.cwd ?? process.cwd();
  const webAuth = createWebAuth();
  let latestState = buildMsqWebState();
  let latestStateSignature = JSON.stringify(latestState);

  process.on('uncaughtException', (error) => {
    console.error('[web] uncaughtException:', error.message);
    console.error(error.stack);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[web] unhandledRejection:', reason);
  });

  function broadcast(message: WebSocketServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of clients.values()) {
      if (client.authenticated && client.socket.readyState === 1 /* OPEN */) {
        client.socket.send(data);
      }
    }
  }

  function sendTo(client: Client, message: WebSocketServerMessage): void {
    if (client.socket.readyState === 1 /* OPEN */) {
      client.socket.send(JSON.stringify(message));
    }
  }

  function buildCurrentState(): typeof latestState {
    const nextState = buildMsqWebState();
    return latestState.notifications.length > 0
      ? { ...nextState, notifications: latestState.notifications }
      : nextState;
  }

  function refreshState(): void {
    latestState = buildCurrentState();
    latestStateSignature = JSON.stringify(latestState);
  }

  function buildRunDetailPayload(runId: number): { runId: number; taskRuns: ReturnType<typeof listTaskRunsForRun>; breakdown: ReturnType<typeof computeRunBreakdown> | null; sessionStatus: ReturnType<typeof getRunSessionStatus>; statusHistory: ReturnType<typeof getStatusHistory>; toolCalls: ReturnType<typeof listRunToolCalls> } | null {
    try {
      const taskRuns = listTaskRunsForRun(runId);
      const runEvents = listRunEvents(runId);
      const startedAt = runEvents.find((event) => event.event === 'start')?.createdAt ?? null;
      const endedAt = runEvents.find((event) => event.event === 'done' || event.event === 'failed')?.createdAt ?? null;
      const breakdown = startedAt ? computeRunBreakdown(runEvents, startedAt, endedAt) : null;
      return { runId, taskRuns, breakdown, sessionStatus: getRunSessionStatus(runId), statusHistory: getStatusHistory(runEvents), toolCalls: listRunToolCalls(runId) };
    } catch (error) {
      logCaughtError('web/server.buildRunDetailPayload', error);
      return null;
    }
  }

  function getStatusHistory(events: ReturnType<typeof listRunEvents>): NonNullable<ReturnType<typeof getRunSessionStatus>>[] {
    return events
      .filter((event) => event.event.startsWith('status:') && event.metadata)
      .map((event) => event.metadata as unknown as NonNullable<ReturnType<typeof getRunSessionStatus>>);
  }

  function sendRunDetail(client: Client, runId: number, force = false): void {
    const payload = buildRunDetailPayload(runId);
    if (!payload) return;
    const signature = JSON.stringify(payload);
    if (!force && client.detailPayloadSignatures.get(runId) === signature) return;
    client.detailPayloadSignatures.set(runId, signature);
    sendTo(client, { type: 'run:detail', payload });
  }

  function sendRunHistory(client: Client, featureId: string, force = false): void {
    try {
      const context = resolveWorkItemExecutionContext(featureId);
      const payload = { featureId, runs: listRunHistoryForFeature(context.repoId, featureId) };
      const signature = JSON.stringify(payload);
      if (!force && client.historyPayloadSignatures.get(featureId) === signature) return;
      client.historyPayloadSignatures.set(featureId, signature);
      sendTo(client, { type: 'run:history', payload });
    } catch (error) {
      // DB unavailable — skip this update
      logCaughtError('web/server.sendRunHistory', error);
    }
  }

  function sendRunChanges(client: Client, runId: number, force = false): void {
    const payload = computeRunChangesForWorkItem(runId);
    const signature = JSON.stringify(payload);
    if (!force && client.changesPayloadSignatures.get(runId) === signature) return;
    client.changesPayloadSignatures.set(runId, signature);
    sendTo(client, { type: 'run:changes', payload });
  }

  function refreshSubscribedViews(_featureCwd: string): void {
    for (const client of clients.values()) {
      if (!client.authenticated || client.socket.readyState !== 1 /* OPEN */) continue;
      for (const runId of client.detailSubscriptions) sendRunDetail(client, runId);
      for (const featureId of client.historySubscriptions) sendRunHistory(client, featureId);
      for (const runId of client.changesSubscriptions) sendRunChanges(client, runId);
    }
  }

  function reconcileWebState(
    featureCwd: string,
    options: { forceBroadcast?: boolean; refreshSubscriptions?: boolean } = {},
  ): boolean {
    const nextState = buildCurrentState();
    const nextSignature = JSON.stringify(nextState);
    const changed = options.forceBroadcast === true || nextSignature !== latestStateSignature;
    latestState = nextState;
    latestStateSignature = nextSignature;
    if (changed) {
      broadcast({ type: 'state:full', payload: latestState });
    }
    if (options.refreshSubscriptions !== false) {
      refreshSubscribedViews(featureCwd);
    }
    return changed;
  }

  const eventUnsubscribers = BROADCAST_EVENTS.map((event) =>
    msqEventBus.subscribe(event, (payload) => {
      if (event === 'ui:notice' || event === 'ui:info') {
        const payloadObj = payload as Record<string, unknown> | null;
        const message = payloadObj && typeof payloadObj === 'object' && 'message' in payloadObj && typeof payloadObj.message === 'string'
          ? payloadObj.message
          : JSON.stringify(payload);
        console.log(`[event:${event}]`, message);
      }
      if (event === 'run:status' || event === 'tool:call') {
        const runId = (payload as { runId?: number }).runId;
        for (const client of clients.values()) {
          if (client.authenticated && runId != null && client.detailSubscriptions.has(runId) && client.socket.readyState === 1) {
            client.socket.send(JSON.stringify({ type: event, payload }));
          }
        }
      } else {
        broadcast({ type: event, payload });
      }
      // Surface a toast-tier notification for high-signal events. Append to
      // `latestState.notifications` so the next reconcile/state:full captures
      // it; the client diffs seen IDs (see App.tsx) to render toasts.
      const notification = buildEventNotification(event, payload);
      if (notification) {
        latestState = appendNotification(latestState, notification);
        latestStateSignature = JSON.stringify(latestState);
      }
      if (event === 'ui:info' || event === 'ui:notice') {
        // `appendNotification` above already captured the message; the explicit
        // state:full broadcast below used to live here, but reconcileWebState
        // (further down) now does that for any non-output, non-budget event —
        // including these — so the duplicate broadcast is dropped.
        broadcast({ type: 'state:full', payload: latestState });
        return;
      }
      if (event !== 'run:output' && event !== 'budget:alert') {
        reconcileWebState(cwd);
      }
    }),
  );

  function extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
  }

  function isValidToken(token: string | null): boolean {
    return token !== null && options.token.length > 0 && timingSafeEqualStrings(token, options.token);
  }

  function isAuthenticated(req: IncomingMessage): boolean {
    if (options.auth === 'none') return true;
    if (webAuth.hasValidSession(req.headers.cookie)) return true;
    return isValidToken(extractToken(req));
  }

  function readStaticBody(urlPath: string): { body: Buffer; contentType: string } | null {
    try {
      const safe = urlPath.replace(/\.{2,}/g, '').replace(/^\/+/, '');
      if (!safe) return null;
      const filePath = safe === 'index.html' || safe === '' ? join(STATIC_DIR, 'index.html') : join(STATIC_DIR, safe);
      const body = readFileSync(filePath);
      const contentType = safe.endsWith('.js')
        ? 'application/javascript'
        : safe.endsWith('.css')
          ? 'text/css'
          : 'text/html';
      return { body, contentType };
    } catch (error) {
      logCaughtError('web/server.readStaticAsset', error);
      return null;
    }
  }

  function serveStatic(_req: IncomingMessage, res: ServerResponse, urlPath: string): void {
    const file = readStaticBody(urlPath);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': file.contentType });
    res.end(file.body);
  }

  startTelegramPoller();

  const httpServer = createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (!isAllowedHostHeader(req.headers.host, options.host)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden host');
        return;
      }

      if (pathname === '/auth') {
        if (options.auth === 'none' || webAuth.hasValidSession(req.headers.cookie)) {
          res.writeHead(302, { Location: '/' });
          res.end();
          return;
        }

        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(renderLoginPage(false));
          return;
        }

        if (req.method === 'POST') {
          let body: string;
          try {
            body = await readRequestBody(req);
          } catch (error) {
            logCaughtError('web/server.loginHandler.readRequestBody', error);
            res.writeHead(413, { 'Content-Type': 'text/plain' });
            res.end('Payload too large');
            return;
          }
          const password = new URLSearchParams(body).get('password') ?? '';
          if (!isValidToken(password)) {
            res.writeHead(401, { 'Content-Type': 'text/html' });
            res.end(renderLoginPage(true));
            return;
          }
          const sessionId = webAuth.createSession();
          res.writeHead(302, { Location: '/', 'Set-Cookie': webAuth.sessionCookie(sessionId) });
          res.end();
          return;
        }

        res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, POST' });
        res.end('Method not allowed');
        return;
      }

      if (pathname === '/logout') {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'POST' });
          res.end('Method not allowed');
          return;
        }
        webAuth.invalidateSession(req.headers.cookie);
        res.writeHead(302, { Location: '/auth', 'Set-Cookie': webAuth.expiredSessionCookie() });
        res.end();
        return;
      }

      if (pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (pathname === '/api/state') {
        if (!isAuthenticated(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        refreshState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(latestState));
        return;
      }

      const changesMatch = /^\/api\/runs\/(\d+)\/changes$/.exec(pathname);
      if (changesMatch?.[1]) {
        if (!isAuthenticated(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        const runId = Number(changesMatch[1]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(computeRunChangesForWorkItem(runId)));
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        if (!isAuthenticated(req)) {
          res.writeHead(302, { Location: '/auth' });
          res.end();
          return;
        }
        serveStatic(req, res, 'index.html');
        return;
      }

      if (pathname.startsWith('/static/')) {
        serveStatic(req, res, pathname.slice('/static/'.length));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  }

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (rawSocket, req: IncomingMessage) => {
    const socket = rawSocket as HeartbeatWebSocket;
    // A page on any site can open a WebSocket to 127.0.0.1 (CSWSH) and a
    // DNS-rebinding page reaches here with a foreign Host — reject both
    // before any state or auth handling.
    if (!isAllowedOrigin(req.headers.origin, options.host) || !isAllowedHostHeader(req.headers.host, options.host)) {
      socket.close(1008, 'Forbidden origin');
      return;
    }
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    const heartbeat = setInterval(() => {
      if (socket.readyState !== 1 /* OPEN */) return;
      if (!socket.isAlive) {
        socket.terminate();
        clearInterval(heartbeat);
        return;
      }
      socket.isAlive = false;
      socket.ping();
    }, 60_000);

    const client: Client = {
      socket,
      authenticated: options.auth === 'none' || webAuth.hasValidSession(req.headers.cookie),
      outputSubscriptions: new Set(),
      outputLastIdByRun: new Map(),
      detailSubscriptions: new Set(),
      historySubscriptions: new Set(),
      changesSubscriptions: new Set(),
      detailPayloadSignatures: new Map(),
      historyPayloadSignatures: new Map(),
      changesPayloadSignatures: new Map(),
    };
    clients.set(socket, client);

    socket.on('message', (rawData) => {
      let data: string;
      if (Buffer.isBuffer(rawData)) {
        data = rawData.toString('utf8');
      } else if (Array.isArray(rawData)) {
        data = Buffer.concat(rawData).toString('utf8');
      } else if (typeof rawData === 'string') {
        data = rawData;
      } else if (ArrayBuffer.isView(rawData)) {
        data = Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf8');
      } else {
        data = Buffer.from(rawData).toString('utf8');
      }
      let message: WebSocketClientMessage | undefined;
      try {
        message = JSON.parse(data) as WebSocketClientMessage;
      } catch (error) {
        logCaughtError('web/server.wsMessageHandler.parse', error);
        socket.close(1007, 'Invalid JSON');
        return;
      }

      if (message.type === 'auth') {
        if (client.authenticated) {
          // state:full was already sent on connection (auth=none or session cookie)
          return;
        }
        if (isValidToken(message.token)) {
          client.authenticated = true;
          refreshState();
          sendTo(client, { type: 'state:full', payload: latestState });
        } else {
          socket.close(1008, 'Invalid token');
        }
        return;
      }

      if (!client.authenticated) {
        socket.close(1008, 'Not authenticated');
        return;
      }

      void (async (): Promise<void> => {
        try {
          console.log(`[ws] received message type=${message.type}`);
          await handleClientMessage(message, client, cwd);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          console.error(`[ws] handleClientMessage error for ${message.type}: ${errorMessage}`);
          if (errorStack) console.error(errorStack);
          sendTo(client, { type: 'error', payload: { message: errorMessage } });
        }
      })();
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(socket);
    });

    // Cookie-authenticated browsers and auth=none get full state immediately
    if (client.authenticated) {
      refreshState();
      sendTo(client, { type: 'state:full', payload: latestState });
    } else {
      // Allow a window for auth before closing unauthenticated sockets
      const timer = setTimeout(() => {
        if (!client.authenticated && socket.readyState === 1 /* OPEN */) {
          socket.close(1008, 'Authentication required');
        }
      }, 60_000);
      timer.unref();
    }
  });

  async function handleClientMessage(
    message: Exclude<WebSocketClientMessage, { type: 'auth' }>,
    client: Client,
    featureCwd: string,
  ): Promise<void> {
    switch (message.type) {
      case 'action:createProject':
      case 'action:updateProject': {
        const result = handleProjectAction(message);
        sendTo(client, result);
        if (result.payload.ok) {
          // Projects are intentionally not projected into MsqWebState until
          // PRJ-07. Force this publication so current clients still reconcile
          // after a successful mutation.
          reconcileWebState(featureCwd, { forceBroadcast: true });
        }
        break;
      }
      case 'action:linkRepo':
      case 'action:moveRepo':
      case 'action:unlinkRepo': {
        const result = handleRepositoryAction(message, featureCwd);
        sendTo(client, result);
        if (result.payload.ok) reconcileWebState(featureCwd, { forceBroadcast: true });
        break;
      }
      case 'action:createEpic':
      case 'action:updateEpic': {
        const result = handleEpicAction(message);
        sendTo(client, result);
        if (result.payload.ok) reconcileWebState(featureCwd, { forceBroadcast: true });
        break;
      }
      case 'action:createWorkItem': {
        const result = handleWorkItemAction(message);
        sendTo(client, result);
        if (result.payload.ok) reconcileWebState(featureCwd, { forceBroadcast: true });
        break;
      }
      case 'action:archiveProject':
      case 'action:deleteProject':
      case 'action:restoreArchivedProject':
      case 'action:archiveEpic':
      case 'action:deleteEpic':
      case 'action:restoreArchivedEpic':
      case 'action:archiveWorkItem':
      case 'action:deleteWorkItem':
      case 'action:restoreArchivedWorkItem': {
        const result = handleLifecycleAction(message);
        sendTo(client, result);
        if (result.payload.ok) reconcileWebState(featureCwd, { forceBroadcast: true });
        break;
      }
      case 'action:queryArchived': {
        sendTo(client, handleQueryArchived(message));
        break;
      }
      case 'action:queryAuditTrail': {
        sendTo(client, handleQueryAuditTrail(message));
        break;
      }
      case 'action:getAnalyticsWorkItems': {
        sendTo(client, handleAnalyticsWorkItems(message));
        break;
      }
      case 'action:getAnalyticsBreakdown': {
        sendTo(client, handleAnalyticsBreakdown(message));
        break;
      }
      case 'action:getAnalyticsRunDrilldown': {
        sendTo(client, handleAnalyticsRunDrilldown(message));
        break;
      }
      case 'action:resolveWorkflowTemplate': {
        const result = handleResolveWorkflowTemplate(message);
        sendTo(client, result);
        break;
      }
      case 'action:changeWorkItemType': {
        const result = handleWorkItemTypeChange(message);
        sendTo(client, result);
        // A preview writes nothing, so only a confirmed change rebroadcasts.
        if (result.type === 'action:result' && result.payload.ok && 'workItem' in result.payload) {
          reconcileWebState(featureCwd, { forceBroadcast: true });
        }
        break;
      }
      case 'action:createWorkflowTemplate':
      case 'action:updateWorkflowTemplate':
      case 'action:duplicateWorkflowTemplate':
      case 'action:archiveWorkflowTemplate':
      case 'action:setTypeTemplate': {
        const result = handleWorkflowTemplateAction(message);
        sendTo(client, result);
        if (result.type === 'action:result' && result.payload.ok) {
          invalidateWorkflowTemplatesCache();
          reconcileWebState(featureCwd, { forceBroadcast: true });
        }
        break;
      }
      case 'action:getWorkflowTemplateDefinition': {
        sendTo(client, handleWorkflowTemplateDefinition(message));
        break;
      }
      case 'action:validateWorkflowTemplate': {
        sendTo(client, handleValidateWorkflowTemplate(message));
        break;
      }
      case 'action:startFeature': {
        startFeature(message.featureId, featureCwd);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:updateFeatureConfig': {
        const result = updateFeatureConfig(message.featureId, message.patch, featureCwd);
        sendTo(client, result);
        if (result.payload.ok) {
          reconcileWebState(featureCwd);
          msqEventBus.emit('ui:info', { message: `Saved config for ${message.featureId}.` });
        } else {
          msqEventBus.emit('ui:notice', {
            message: `Could not save config for ${message.featureId}: ${result.payload.issues?.[0]?.message ?? 'Unknown error'}`,
          });
        }
        break;
      }
      case 'action:updateTaskConfig': {
        updateTaskConfig(message.featureId, message.taskId, message.patch, featureCwd);
        break;
      }
      case 'action:updateProjectDefaults': {
        updateProjectDefaults(message.patch, featureCwd);
        break;
      }
      case 'action:updateBudgetConfig': {
        updateBudgetConfig(message.patch, featureCwd);
        break;
      }
      case 'action:updateNotifications': {
        updateNotifications(message.patch, featureCwd);
        break;
      }
      case 'action:updateAppConfig': {
        updateAppConfig(message.patch, featureCwd);
        break;
      }
      case 'action:setSecret': {
        await saveSecret(message.patch, featureCwd);
        break;
      }
      case 'action:clearSecret': {
        await removeSecret(message.account, featureCwd);
        break;
      }
      case 'action:updateToolsRegistry': {
        updateToolsRegistry(message.tools, featureCwd);
        break;
      }
      case 'action:pausePipeline': {
        pausePipeline(message.pipelineId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resumePipeline': {
        resumePipeline(message.pipelineId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:abortPipeline': {
        abortPipeline(message.pipelineId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:requestFeatureAbort': {
        requestFeatureAbort(message.pipelineId, message.featureId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resolveGate': {
        resolveGate(message.gateId, message.decision);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:forceResolveGate': {
        forceResolveGate(message.gateId);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resolveStageRequest': {
        resolveStageRequest(message.requestId, message.response);
        reconcileWebState(featureCwd);
        break;
      }
      case 'action:resumeWithOverride': {
        resumeWithOverride(message.pipelineId, message.featureId, message.tool, message.model, message.effort);
        reconcileWebState(featureCwd);
        break;
      }
      case 'subscribe:output': {
        client.outputSubscriptions.add(message.runId);
        const rows = listRunOutput(message.runId, 120);
        const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
        const lastId = lastRow ? lastRow.id : 0;
        client.outputLastIdByRun.set(message.runId, lastId);
        for (const row of rows) {
          sendTo(client, {
            type: 'run:output',
            payload: {
              id: row.id,
              runId: row.runId,
              featureId: row.featureId,
              tool: row.tool,
              line: row.line,
              stream: row.stream,
              source: row.source,
              createdAt: row.createdAt,
              toolName: row.toolName ?? undefined,
              level: row.level ?? undefined,
            },
          });
        }
        break;
      }
      case 'unsubscribe:output': {
        client.outputSubscriptions.delete(message.runId);
        client.outputLastIdByRun.delete(message.runId);
        break;
      }
      case 'subscribe:runDetail': {
        client.detailSubscriptions.add(message.runId);
        sendRunDetail(client, message.runId);
        const detail = buildRunDetailPayload(message.runId);
        if (detail?.sessionStatus) sendTo(client, { type: 'run:status', payload: detail.sessionStatus });
        for (const toolCall of detail?.toolCalls ?? []) sendTo(client, { type: 'tool:call', payload: toolCall });
        break;
      }
      case 'unsubscribe:runDetail': {
        client.detailSubscriptions.delete(message.runId);
        client.detailPayloadSignatures.delete(message.runId);
        break;
      }
      case 'subscribe:runHistory': {
        client.historySubscriptions.add(message.featureId);
        sendRunHistory(client, message.featureId, true);
        break;
      }
      case 'unsubscribe:runHistory': {
        client.historySubscriptions.delete(message.featureId);
        client.historyPayloadSignatures.delete(message.featureId);
        break;
      }
      case 'subscribe:runChanges': {
        client.changesSubscriptions.add(message.runId);
        sendRunChanges(client, message.runId, true);
        break;
      }
      case 'unsubscribe:runChanges': {
        client.changesSubscriptions.delete(message.runId);
        client.changesPayloadSignatures.delete(message.runId);
        break;
      }
      default: {
        break;
      }
    }
  }

  function actionResultRequestId(message: unknown): string {
    if (typeof message !== 'object' || message === null) return '';
    const requestId = (message as { requestId?: unknown }).requestId;
    return typeof requestId === 'string' ? requestId : '';
  }

  function analyticsError(requestId: string, error: unknown): { requestId: string; ok: false; error: { code: 'QUERY_FAILED'; message: string } } {
    logCaughtError('web/server.analytics', error);
    return { requestId, ok: false, error: { code: 'QUERY_FAILED', message: 'Analytics query could not be completed. Try a narrower period or refresh.' } };
  }

  function handleAnalyticsWorkItems(message: unknown): AnalyticsWorkItemsResult {
    const parsed = AnalyticsWorkItemsMessageSchema.safeParse(message);
    if (!parsed.success) return { type: 'analytics:workItems', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_FILTERS', message: 'Analytics filters are invalid. Use supported filters and bounded pagination.' } } };
    try {
      return { type: 'analytics:workItems', payload: { requestId: parsed.data.requestId, ok: true, rows: listAnalyticsWorkItems(parsed.data.filters, parsed.data.pagination, parsed.data.sort), total: countAnalyticsWorkItems(parsed.data.filters) } };
    } catch (error) {
      return { type: 'analytics:workItems', payload: analyticsError(parsed.data.requestId, error) };
    }
  }

  function handleAnalyticsBreakdown(message: unknown): AnalyticsBreakdownResult {
    const parsed = AnalyticsBreakdownMessageSchema.safeParse(message);
    if (!parsed.success) return { type: 'analytics:breakdown', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_FILTERS', message: 'Analytics filters are invalid. Use supported filters and bounded rankings.' } } };
    try {
      const { filters, bucket = 'day', rankingLimit = 20 } = parsed.data;
      return { type: 'analytics:breakdown', payload: { requestId: parsed.data.requestId, ok: true, summary: getAnalyticsSummary(filters), timeSeries: getTokenTimeSeries(filters, bucket), groups: getTokenBreakdowns(filters, rankingLimit), dataQuality: getAnalyticsDataQuality(filters), insights: getAnalyticsInsights(filters), generatedAt: new Date().toISOString(), revision: getProjectStateRevision() } };
    } catch (error) {
      return { type: 'analytics:breakdown', payload: analyticsError(parsed.data.requestId, error) };
    }
  }

  function handleAnalyticsRunDrilldown(message: unknown): AnalyticsRunDrilldownResult {
    const parsed = AnalyticsRunDrilldownMessageSchema.safeParse(message);
    if (!parsed.success) return { type: 'analytics:runDrilldown', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_FILTERS', message: 'Analytics filters are invalid. Use supported filters and bounded pagination.' } } };
    try {
      return { type: 'analytics:runDrilldown', payload: { requestId: parsed.data.requestId, ok: true, rows: listAnalyticsRunDrilldown(parsed.data.filters, parsed.data.pagination) } };
    } catch (error) {
      return { type: 'analytics:runDrilldown', payload: analyticsError(parsed.data.requestId, error) };
    }
  }

  function projectActionError(error: unknown): ProjectActionError {
    const code = typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === 'PROJECT_NOT_FOUND') {
      return { code, message: 'Project was not found.' };
    }
    if (code === 'REVISION_CONFLICT') {
      return { code, message: 'Project was changed by another request. Refresh and try again.' };
    }
    return { code: 'PROJECT_ACTION_FAILED', message: 'Could not save project.' };
  }

  function handleProjectAction(message: unknown): ProjectActionResult {
    const parsed = ProjectActionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return {
        type: 'action:result',
        payload: {
          requestId: actionResultRequestId(message),
          ok: false,
          error: { code: 'INVALID_PAYLOAD', message: 'Invalid project action payload.' },
        },
      };
    }

    try {
      const serviceResult = parsed.data.type === 'action:createProject'
        ? projectService.create({ name: parsed.data.name, description: parsed.data.description })
        : projectService.update(parsed.data.projectId, parsed.data.patch, parsed.data.expectedRevision);
      return {
        type: 'action:result',
        payload: { requestId: parsed.data.requestId, ok: true, entity: serviceResult.entity },
      };
    } catch (error) {
      return {
        type: 'action:result',
        payload: {
          requestId: parsed.data.requestId,
          ok: false,
          error: projectActionError(error),
        },
      };
    }
  }

  function repositoryActionError(error: unknown): ProjectActionError {
    const code = typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === 'PROJECT_NOT_FOUND' || code === 'REPO_NOT_FOUND' || code === 'REPO_NOT_LINKED_TO_PROJECT' || code === 'REPO_ALREADY_LINKED' || code === 'REPO_IN_USE'
      || code === 'REPO_PATH_CONFIRMATION_REQUIRED' || code === 'REPO_PATH_NOT_FOUND' || code === 'REPO_PATH_NOT_DIRECTORY' || code === 'REPO_PATH_NOT_ALLOWED') {
      return { code, message: error instanceof Error ? error.message : 'Repository action failed.' };
    }
    return { code: 'PROJECT_ACTION_FAILED', message: 'Could not change repository links.' };
  }

  function handleRepositoryAction(message: unknown, featureCwd: string): RepositoryActionResult {
    const parsed = RepositoryActionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return {
        type: 'action:result',
        payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid repository action payload.' } },
      };
    }
    const audit = { actor: 'web', requestId: parsed.data.requestId };
    try {
      switch (parsed.data.type) {
        case 'action:linkRepo': {
          const result = repoLinkService.link(parsed.data.projectId, parsed.data, {
            allowedRoots: resolveRepoAllowlist(featureCwd), audit,
          });
          return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: true, entity: result.entity } };
        }
        case 'action:moveRepo': {
          const result = repoLinkService.move(parsed.data.repoId, parsed.data.toProjectId, { audit });
          return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: true, entity: result.entity } };
        }
        case 'action:unlinkRepo': {
          const result = repoLinkService.unlink(parsed.data.repoId, { projectId: parsed.data.projectId, audit });
          return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: true, entity: result.entity } };
        }
        default: {
          throw new Error('Unsupported repository action.');
        }
      }
    } catch (error) {
      return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: false, error: repositoryActionError(error) } };
    }
  }

  function epicActionError(error: unknown): EpicActionError {
    const code = typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === 'PROJECT_NOT_FOUND' || code === 'REVISION_CONFLICT') {
      return { code, message: error instanceof Error ? error.message : 'Epic action failed.' };
    }
    return { code: 'EPIC_ACTION_FAILED', message: 'Could not save epic.' };
  }

  function handleEpicAction(message: unknown): EpicActionResult {
    const parsed = EpicActionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return {
        type: 'action:result',
        payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid epic action payload.' } },
      };
    }
    try {
      const serviceResult = parsed.data.type === 'action:createEpic'
        ? epicService.create({ projectId: parsed.data.projectId, title: parsed.data.title, description: parsed.data.description, audit: { actor: 'web', requestId: parsed.data.requestId } })
        : epicService.update(parsed.data.epicId, parsed.data.patch, parsed.data.expectedRevision, { audit: { actor: 'web', requestId: parsed.data.requestId } });
      return {
        type: 'action:result',
        payload: { requestId: parsed.data.requestId, ok: true, entity: serviceResult.entity },
      };
    } catch (error) {
      return {
        type: 'action:result',
        payload: { requestId: parsed.data.requestId, ok: false, error: epicActionError(error) },
      };
    }
  }

  function workItemActionError(error: unknown): WorkItemActionError {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === 'EPIC_NOT_FOUND' || code === 'REPOSITORY_NOT_IN_PROJECT' || code === 'REPOSITORY_UNAVAILABLE'
      || code === 'DEPENDENCY_NOT_FOUND' || code === 'CROSS_REPOSITORY_DEPENDENCY' || code === 'DEPENDENCY_CYCLE'
      // Type-change and template-resolution failures reuse this mapper; their
      // messages are actionable, so they are passed through verbatim.
      || code === 'WORK_ITEM_NOT_FOUND' || code === 'WORK_ITEM_HAS_HISTORY' || code === 'REVISION_CONFLICT'
      || code === 'WORKFLOW_TEMPLATE_NOT_FOUND' || code === 'WORKFLOW_TEMPLATE_INVALID') {
      return { code, message: error instanceof Error ? error.message : 'Could not create Work Item.' };
    }
    return { code: 'WORK_ITEM_ACTION_FAILED', message: 'Could not create Work Item.' };
  }

  function workflowTemplateActionError(error: unknown): { code: string; message: string; mappings?: { projectId: string; workItemType: string }[] } {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === 'WORKFLOW_TEMPLATE_NOT_FOUND' || code === 'WORKFLOW_TEMPLATE_INVALID'
      || code === 'WORKFLOW_TEMPLATE_IN_USE' || code === 'WORKFLOW_TEMPLATE_ARCHIVED'
      || code === 'WORKFLOW_TEMPLATE_IMMUTABLE' || code === 'WORKFLOW_TEMPLATE_SCOPE_MISMATCH'
      || code === 'REVISION_CONFLICT' || code === 'PROJECT_NOT_FOUND') {
      const mappings = code === 'WORKFLOW_TEMPLATE_IN_USE'
        ? (error as { mappings?: { projectId: string; workItemType: string }[] }).mappings
        : undefined;
      return { code, message: error instanceof Error ? error.message : 'Workflow template action failed.', ...(mappings ? { mappings } : {}) };
    }
    return { code: 'WORKFLOW_TEMPLATE_ACTION_FAILED', message: 'Workflow template action failed.' };
  }

  /** Template CRUD + Project/type mapping. Every branch returns the template's
   * current `revision` so the client can send `expectedRevision` on the next
   * write. */
  function handleWorkflowTemplateAction(message: unknown): WebSocketServerMessage {
    const parsed = WorkflowTemplateActionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:result', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid workflow template action payload.' } } };
    }
    const audit = { actor: 'web', requestId: parsed.data.requestId };
    try {
      switch (parsed.data.type) {
        case 'action:createWorkflowTemplate': {
          const template = createWorkflowTemplate({
            projectId: parsed.data.projectId,
            name: parsed.data.name,
            definition: parsed.data.definition,
            audit,
          });
          return templateActionOk(parsed.data.requestId, template);
        }
        case 'action:updateWorkflowTemplate': {
          const template = updateWorkflowTemplate(
            parsed.data.templateId,
            parsed.data.patch,
            parsed.data.expectedRevision,
            { audit },
          );
          return templateActionOk(parsed.data.requestId, template);
        }
        case 'action:duplicateWorkflowTemplate': {
          const template = duplicateWorkflowTemplate(parsed.data.templateId, {
            projectId: parsed.data.projectId,
            ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
            audit,
          });
          return templateActionOk(parsed.data.requestId, template);
        }
        case 'action:archiveWorkflowTemplate': {
          const template = archiveWorkflowTemplate(parsed.data.templateId, { audit });
          return templateActionOk(parsed.data.requestId, template);
        }
        case 'action:setTypeTemplate': {
          mapProjectWorkItemTemplate({
            projectId: parsed.data.projectId,
            workItemType: parsed.data.workItemType,
            templateId: parsed.data.templateId,
            audit,
          });
          return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: true } };
        }
      }
    } catch (error) {
      return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: false, error: workflowTemplateActionError(error) } };
    }
  }

  /** Full definition for a template, fetched on demand (PRJ-26) when the
   * client opens it for editing, duplication or diffing. */
  function handleWorkflowTemplateDefinition(message: unknown): WebSocketServerMessage {
    const parsed = WorkflowTemplateDefinitionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:result', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid workflow template definition request.' } } };
    }
    const { requestId, templateId } = parsed.data;
    const template = getWorkflowTemplate(templateId);
    if (!template) {
      return { type: 'action:result', payload: { requestId, ok: false, error: { code: 'WORKFLOW_TEMPLATE_NOT_FOUND', message: `Workflow template ${templateId} was not found.` } } };
    }
    return { type: 'action:result', payload: { requestId, ok: true, templateId, definition: template.definition } };
  }

  /** Validates a draft definition against every active repo of a Project
   * (PRJ-26), returning a repo×skill matrix rather than a single pass/fail so
   * the UI can pinpoint exactly which repo is missing which skill before the
   * caller saves or maps the template. */
  function handleValidateWorkflowTemplate(message: unknown): WebSocketServerMessage {
    const parsed = ValidateWorkflowTemplateMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:result', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid workflow template validation request.' } } };
    }
    const { requestId, projectId, definition } = parsed.data;
    try {
      const repos = repoLinkService.list(projectId);
      const { matrix } = validateTemplateAgainstRepos(definition, repos.map((repo) => ({ repoId: repo.repoId, repoPath: repo.path })));
      const repoLabels = new Map(repos.map((repo) => [repo.repoId, basename(repo.path)]));
      const withLabels = matrix.map((entry) => ({ repoId: entry.repoId, repoLabel: repoLabels.get(entry.repoId) ?? entry.repoId, missing: entry.missing }));
      return { type: 'action:result', payload: { requestId, ok: true, valid: withLabels.every((entry) => entry.missing.length === 0), matrix: withLabels } };
    } catch (error) {
      return { type: 'action:result', payload: { requestId, ok: false, error: workflowTemplateActionError(error) } };
    }
  }

  function templateActionOk(requestId: string, template: WorkflowTemplate): WebSocketServerMessage {
    return {
      type: 'action:result',
      payload: {
        requestId,
        ok: true,
        workflowTemplate: {
          templateId: template.templateId,
          name: template.name,
          version: template.version,
          revision: template.revision,
          builtin: template.builtin,
          archived: template.archivedAt !== null,
          scopeProjectId: template.scopeProjectId,
          stageCount: template.definition.workflow.stages.length,
        },
        revision: template.revision,
      },
    };
  }

  /**
   * Resolves the template for a Work Item about to be created.
   *
   * Runs before the write transaction so template/skill failures surface as a
   * rejected action instead of an orphaned row. Skill validation is scoped to
   * the *target repo* because repo-scoped skills differ per checkout.
   */
  function resolveSnapshotForWorkItem(
    epicId: string,
    repoId: string,
    workItemType: MsqWorkItemType,
  ): WorkItemTemplateSnapshot {
    const target = getEpicTemplateTarget(epicId, repoId);
    const resolved = resolveTemplate(target.projectId, workItemType, {
      repoPath: target.repoPath,
      validate: true,
    });
    return {
      templateId: resolved.templateId,
      templateVersion: resolved.version,
      origin: resolved.origin,
      definition: resolved.definition,
    };
  }

  /**
   * Read-only preview for the Work Item creation form: resolves the template
   * from the same inputs `action:createWorkItem` will use (epic + repo +
   * type), including skill validation against the target repo, without
   * creating anything. The client gates its submit button on this succeeding.
   */
  function handleResolveWorkflowTemplate(message: unknown): ResolveWorkflowTemplateResult {
    const parsed = ResolveWorkflowTemplateMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:result', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid template preview payload.' } } };
    }
    const { requestId, epicId, repoId, workItemType } = parsed.data;
    try {
      const snapshot = resolveSnapshotForWorkItem(epicId, repoId, workItemType);
      return {
        type: 'action:result',
        payload: {
          requestId,
          ok: true,
          preview: {
            templateId: snapshot.templateId,
            templateVersion: snapshot.templateVersion,
            origin: snapshot.origin,
            stages: [...snapshot.definition.workflow.stages],
          },
        },
      };
    } catch (error) {
      return { type: 'action:result', payload: { requestId, ok: false, error: workItemActionError(error) } };
    }
  }

  /**
   * Two-phase type change. `preview` resolves the target template and reports
   * the stages without writing; the confirming call re-checks `expectedRevision`
   * and swaps the snapshot atomically. Items with run history are refused.
   */
  function handleWorkItemTypeChange(message: unknown): WebSocketServerMessage {
    const parsed = WorkItemTypeChangeMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:result', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid Work Item type change payload.' } } };
    }
    const { requestId, workItemId, workItemType, expectedRevision, preview } = parsed.data;
    try {
      const target = getWorkItemTemplateTarget(workItemId);
      if (target.revision !== expectedRevision) {
        throw new RevisionConflictError(workItemId, expectedRevision, target.revision, 'Work Item');
      }
      if (!isWorkItemPristine(workItemId)) {
        throw new WorkItemHasHistoryError(workItemId, 1);
      }
      const resolved = resolveTemplate(target.projectId, workItemType, {
        repoPath: target.repoPath,
        validate: true,
      });
      if (preview) {
        return {
          type: 'action:result',
          payload: {
            requestId,
            ok: true,
            preview: {
              workItemId,
              fromType: target.type,
              toType: workItemType,
              templateId: resolved.templateId,
              templateVersion: resolved.version,
              stages: [...resolved.definition.workflow.stages],
            },
          },
        };
      }
      const workItem = changeWorkItemType(workItemId, workItemType, {
        templateId: resolved.templateId,
        templateVersion: resolved.version,
        origin: resolved.origin,
        definition: resolved.definition,
      }, expectedRevision);
      return { type: 'action:result', payload: { requestId, ok: true, workItem, revision: workItem.revision } };
    } catch (error) {
      return { type: 'action:result', payload: { requestId, ok: false, error: workItemActionError(error) } };
    }
  }

  function handleWorkItemAction(message: unknown): WorkItemActionResult {
    const parsed = WorkItemActionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:result', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid Work Item action payload.' } } };
    }
    try {
      // Resolve and validate before the insert: a template that is invalid or
      // references skills missing from the target repo must fail without
      // leaving a half-created Work Item behind.
      const snapshot = resolveSnapshotForWorkItem(
        parsed.data.epicId,
        parsed.data.repoId,
        parsed.data.workItemType,
      );
      const result = workItemService.create({
        epicId: parsed.data.epicId,
        repoId: parsed.data.repoId,
        title: parsed.data.title,
        type: parsed.data.workItemType,
        description: parsed.data.description,
        dependsOn: parsed.data.dependsOn,
        audit: { actor: 'web', requestId: parsed.data.requestId },
      }, snapshot);
      return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: true, workItem: result.entity, revision: result.revision ?? result.entity.revision } };
    } catch (error) {
      return { type: 'action:result', payload: { requestId: parsed.data.requestId, ok: false, error: workItemActionError(error) } };
    }
  }

  /** Maps a lifecycle policy failure onto a stable action-error code. The four
   * policy codes, the Work Item restore integrity code (PRJ-19), plus the
   * shared REVISION_CONFLICT / NOT_FOUND codes pass through verbatim; anything
   * else collapses to a generic failure. */
  function lifecycleActionError(error: unknown): LifecycleActionError {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === 'ENTITY_RUNNING' || code === 'ENTITY_HAS_HISTORY' || code === 'ENTITY_IN_USE' || code === 'ANCESTOR_ARCHIVED'
      || code === 'REPOSITORY_NOT_IN_PROJECT'
      || code === 'REVISION_CONFLICT' || code === 'PROJECT_NOT_FOUND' || code === 'EPIC_NOT_FOUND' || code === 'WORK_ITEM_NOT_FOUND') {
      return { code, message: error instanceof Error ? error.message : 'Lifecycle action failed.' };
    }
    return { code: 'PROJECT_ACTION_FAILED', message: 'Lifecycle action failed.' };
  }

  /** Single WS entry point for archive / delete / restoreArchive across the
   * three levels (PRJ-17). The policy engine runs inside the repo-layer write
   * transaction, so this handler only routes and shapes the result. */
  function handleLifecycleAction(message: unknown): LifecycleActionResult {
    const parsed = LifecycleActionMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:result', payload: { requestId: actionResultRequestId(message), ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid lifecycle action payload.' } } };
    }
    const data = parsed.data;
    const audit = { actor: 'web', requestId: data.requestId };
    try {
      let entity: ProjectRow | EpicRow | WorkItemRow;
      switch (data.type) {
        case 'action:archiveProject': entity = projectService.archive(data.projectId, data.expectedRevision, { audit }).entity; break;
        case 'action:deleteProject': entity = projectService.delete(data.projectId, data.expectedRevision, { audit }).entity; break;
        case 'action:restoreArchivedProject': entity = projectService.restoreArchive(data.projectId, data.expectedRevision, { audit }).entity; break;
        case 'action:archiveEpic': entity = epicService.archive(data.epicId, data.expectedRevision, { audit }).entity; break;
        case 'action:deleteEpic': entity = epicService.delete(data.epicId, data.expectedRevision, { audit }).entity; break;
        case 'action:restoreArchivedEpic': entity = epicService.restoreArchive(data.epicId, data.expectedRevision, { audit }).entity; break;
        case 'action:archiveWorkItem': entity = workItemService.archive(data.workItemId, data.expectedRevision, { audit }).entity; break;
        case 'action:deleteWorkItem': entity = workItemService.delete(data.workItemId, data.expectedRevision, { audit }).entity; break;
        case 'action:restoreArchivedWorkItem': entity = workItemService.restoreArchive(data.workItemId, data.expectedRevision, { audit }).entity; break;
        default: data satisfies never; throw new Error('Unknown lifecycle action type');
      }
      return { type: 'action:result', payload: { requestId: data.requestId, ok: true, entity, revision: entity.revision } };
    } catch (error) {
      return { type: 'action:result', payload: { requestId: data.requestId, ok: false, error: lifecycleActionError(error) } };
    }
  }


  /** Paginated `/archived` listing across Project/Epic/Work Item (PRJ-19).
   * Archived-only by construction — tombstoned (deleted) entities never
   * surface here, only through the audit trail. Each item carries the same
   * `AllowedLifecycle` projection the live pages use, so Restore reuses
   * `LifecycleActions` unmodified. */
  function handleQueryArchived(message: unknown): ArchivedQueryResult {
    const parsed = ArchivedQueryMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:archivedResult', payload: { requestId: actionResultRequestId(message), ok: false, error: { message: 'Invalid archived query payload.' } } };
    }
    const { requestId, filters, limit, offset } = parsed.data;
    try {
      const projects = (!filters.kind || filters.kind === 'project') && !filters.epicId && !filters.repoId
        ? listArchivedProjects({ limit, offset }) : [];
      const epics = (!filters.kind || filters.kind === 'epic') && !filters.epicId && !filters.repoId
        ? listArchivedEpics({ limit, offset, projectId: filters.projectId }) : [];
      const workItemScope = { lifecycle: 'archived' as const, projectId: filters.projectId, epicId: filters.epicId, repoId: filters.repoId };
      const workItems = (!filters.kind || filters.kind === 'work_item')
        ? listWorkItemsByScope({ ...workItemScope, limit, offset }) : [];

      const lifecycleByKey = projectLifecycleActions([
        ...projects.map((project) => ({ kind: 'project' as const, id: project.projectId })),
        ...epics.map((epic) => ({ kind: 'epic' as const, id: epic.epicId })),
        ...workItems.map((entry) => ({ kind: 'work_item' as const, id: entry.featureId })),
      ]);
      const projectNameCache = new Map<string, string>();
      const projectName = (id: string): string => {
        const cached = projectNameCache.get(id);
        if (cached !== undefined) return cached;
        const name = getProject(id, { includeArchived: true, includeDeleted: true })?.name ?? id;
        projectNameCache.set(id, name);
        return name;
      };

      const items: ArchivedEntry[] = [
        ...projects.map((project): ArchivedEntry => ({
          kind: 'project', id: project.projectId, title: project.name, parentLabel: null, parentId: null,
          repoLabel: null, workItemType: null, archivedAt: project.archivedAt ?? project.updatedAt,
          revision: project.revision, allowed: lifecycleByKey[`project:${project.projectId}`] ?? DEFAULT_ALLOWED_LIFECYCLE,
        })),
        ...epics.map((epic): ArchivedEntry => ({
          kind: 'epic', id: epic.epicId, title: epic.title, parentLabel: projectName(epic.projectId), parentId: epic.projectId,
          repoLabel: null, workItemType: null, archivedAt: epic.archivedAt ?? epic.updatedAt,
          revision: epic.revision, allowed: lifecycleByKey[`epic:${epic.epicId}`] ?? DEFAULT_ALLOWED_LIFECYCLE,
        })),
        ...workItems.map((entry): ArchivedEntry => ({
          kind: 'work_item', id: entry.featureId, title: entry.title, parentLabel: entry.epicTitle, parentId: entry.epicId,
          repoLabel: entry.repoLabel, workItemType: entry.workItemType, archivedAt: entry.archivedAt ?? '',
          revision: entry.revision, allowed: lifecycleByKey[`work_item:${entry.featureId}`] ?? DEFAULT_ALLOWED_LIFECYCLE,
        })),
      ];

      const total = ((!filters.kind || filters.kind === 'project') ? countArchivedProjects() : 0)
        + ((!filters.kind || filters.kind === 'epic') ? countArchivedEpics(filters.projectId) : 0)
        + ((!filters.kind || filters.kind === 'work_item') ? countWorkItemsByScope(workItemScope) : 0);

      return { type: 'action:archivedResult', payload: { requestId, ok: true, items, total, limit, offset } };
    } catch (error) {
      logCaughtError('web/server.handleQueryArchived', error);
      return { type: 'action:archivedResult', payload: { requestId, ok: false, error: { message: error instanceof Error ? error.message : 'Archived query failed.' } } };
    }
  }

  /** Audit timeline for a single entity (PRJ-19), most recent first. */
  function handleQueryAuditTrail(message: unknown): AuditTrailQueryResult {
    const parsed = AuditTrailQueryMessageSchema.safeParse(message);
    if (!parsed.success) {
      return { type: 'action:auditTrailResult', payload: { requestId: actionResultRequestId(message), ok: false, error: { message: 'Invalid audit trail query payload.' } } };
    }
    const { requestId, entityKind, entityId } = parsed.data;
    try {
      const events: AuditTimelineEntry[] = listAuditEvents(entityKind, entityId).map((event) => ({
        id: event.id, actor: event.actor, action: event.action,
        beforeJson: event.beforeJson, afterJson: event.afterJson, createdAt: event.createdAt,
      }));
      return { type: 'action:auditTrailResult', payload: { requestId, ok: true, entityKind, entityId, events } };
    } catch (error) {
      logCaughtError('web/server.handleQueryAuditTrail', error);
      return { type: 'action:auditTrailResult', payload: { requestId, ok: false, error: { message: error instanceof Error ? error.message : 'Audit trail query failed.' } } };
    }
  }

  function updateAppConfig(patch: AppConfigPatch, featureCwd: string): void {
    saveAppConfigPatch(patch);
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: 'Saved App config.' });
  }

  async function saveSecret(patch: SecretPatch, featureCwd: string): Promise<void> {
    if (!patch.account.trim()) throw new Error('Secret account is required.');
    if (!patch.value) throw new Error('Secret value is required.');
    await setSecret(patch.account, patch.value);
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: `Saved secret for ${patch.account}.` });
  }

  async function removeSecret(account: string, featureCwd: string): Promise<void> {
    if (!account.trim()) throw new Error('Secret account is required.');
    await clearSecret(account);
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: `Cleared secret for ${account}.` });
  }

  const outputUnsubscribe = msqEventBus.subscribe('run:output', (event) => {
    const data: WebSocketServerMessage = { type: 'run:output', payload: event };
    for (const client of clients.values()) {
      if (
        client.authenticated
        && client.outputSubscriptions.has(event.runId)
        && client.socket.readyState === 1 /* OPEN */
      ) {
        client.socket.send(JSON.stringify(data));
      }
    }
  });

  function startFeature(
    featureId: string,
    _featureCwd: string,
  ): void {
    let context: ReturnType<typeof resolveWorkItemExecutionContext>;
    try {
      console.log(`[startFeature] featureId=${featureId}`);
      assertWritableDbPath();
      context = resolveWorkItemExecutionContext(featureId);
      resolveRuntimeConfig(context.cwd);
      const backlog = loadBacklogFromCatalog(context.repoId, context.cwd);
      validateBacklogSkills(backlog, context.cwd);
      assertNoCrossRepositoryDependencies(backlog, context.repoId, getFeatureIdOwner);
      const plan = selectStartableFeaturePlan(backlog, featureId, listCompletedFeatureIds(context.repoId));
      if (plan.pendingDependencies.length > 0) {
        throw new Error(`pending dependencies: ${plan.pendingDependencies.join(', ')}. Complete them before starting ${featureId}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[startFeature] error: ${message}`);
      if (stack) console.error(stack);
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: ${message}` });
      return;
    }

    const entrypoint = process.argv[1];
    if (!entrypoint) {
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: CLI entrypoint was not resolved.` });
      return;
    }

    const child = spawn(
      process.execPath,
      [...process.execArgv, entrypoint, 'run', '--feature', featureId],
      {
        detached: true,
        stdio: 'ignore',
        cwd: context.cwd,
      },
    );
    child.once('error', (error) => {
      msqEventBus.emit('ui:notice', { message: `Could not start ${featureId}: ${error.message}` });
    });
    child.unref();
    msqEventBus.emit('ui:info', { message: `Starting ${featureId}...` });
  }

  /** Mirrors `src/commands/resume.ts`: validates the override tool is available
   * before spawning, so an unavailable tool never creates a run (FR-002/FR-003).
   * The backlog itself is never touched — the override is passed as spawn args
   * only (FR-004). */
  function resumeWithOverride(
    pipelineId: number,
    featureId: string,
    tool?: string,
    model?: string,
    effort?: string,
  ): void {
    const pipeline = getPipeline(pipelineId);
    if (!pipeline) {
      msqEventBus.emit('ui:notice', { message: `Pipeline ${String(pipelineId)} not found — resume aborted.` });
      return;
    }
    if (!pipeline.cwd) {
      msqEventBus.emit('ui:notice', { message: `Pipeline ${String(pipelineId)} has no cwd persisted — resume aborted.` });
      return;
    }

    if (tool) {
      const adapter = getAdapter(tool);
      if (!adapter.isAvailable?.()) {
        msqEventBus.emit('ui:notice', { message: `Tool "${tool}" is unavailable — resume aborted, no run created.` });
        return;
      }
    }

    const entrypoint = process.argv[1];
    if (!entrypoint) {
      msqEventBus.emit('ui:notice', { message: `Could not resume ${featureId}: CLI entrypoint was not resolved.` });
      return;
    }

    const args = [...process.execArgv, entrypoint, 'resume', String(pipelineId)];
    if (tool) args.push('--tool', tool);
    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);

    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      cwd: pipeline.cwd,
    });
    child.once('error', (error) => {
      msqEventBus.emit('ui:notice', { message: `Could not resume ${featureId}: ${error.message}` });
    });
    child.unref();
    msqEventBus.emit('ui:info', { message: `Resuming ${featureId}...` });
  }

  function toFeaturePatch(patch: FeatureConfigPatch): FeaturePatch {
    return {
      ...(patch.spec !== undefined ? { spec: patch.spec } : {}),
      ...(patch.tool !== undefined ? { tool: patch.tool } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.effort !== undefined ? { effort: patch.effort as Feature['effort'] } : {}),
      ...(patch.thinking !== undefined ? { thinking: patch.thinking as Feature['thinking'] } : {}),
      ...(patch.maxTokens !== undefined ? { maxTokens: patch.maxTokens } : {}),
      ...(patch.autoStart !== undefined ? { autoStart: patch.autoStart } : {}),
      ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
      ...(patch.workflow !== undefined
        ? { workflow: patch.workflow as FeaturePatch['workflow'] }
        : {}),
      ...(patch.retry !== undefined ? { retry: patch.retry as FeaturePatch['retry'] } : {}),
    };
  }

  function featureConfigSaveIssues(error: unknown): FeatureConfigSaveIssue[] {
    const errorWithIssues = typeof error === 'object' && error !== null
      ? error as { issues?: unknown }
      : undefined;
    if (Array.isArray(errorWithIssues?.issues)) {
      const issues = errorWithIssues.issues.flatMap((issue): FeatureConfigSaveIssue[] => {
        if (typeof issue !== 'object' || issue === null) return [];
        const candidate = issue as { message?: unknown; path?: unknown };
        if (typeof candidate.message !== 'string') return [];
        const message = candidate.message;
        const pathValue = Array.isArray(candidate.path) ? candidate.path.map((value) => String(value)).join('.') : undefined;
        const path = pathValue === '' ? undefined : pathValue;
        return [{ path, message }];
      });
      if (issues.length > 0) return issues;
    }
    return [{ message: error instanceof Error ? error.message : String(error) }];
  }

  function updateFeatureConfig(featureId: string, patch: FeatureConfigPatch, _featureCwd: string): FeatureConfigSaveResult {
    try {
      console.log(`[updateFeatureConfig] featureId=${featureId}, patch=`, patch);
      assertWritableDbPath();
      if (patch.workflow?.approvals?.channel !== undefined) {
        assertConfiguredNotificationChannel(patch.workflow.approvals.channel);
      }
      const context = resolveWorkItemExecutionContext(featureId);
      updateCatalogFeature(context.repoId, featureId, toFeaturePatch(patch));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[updateFeatureConfig] error: ${message}`);
      if (stack) console.error(stack);
      return { type: 'featureConfig:saveResult', payload: { featureId, ok: false, issues: featureConfigSaveIssues(error) } };
    }
    return { type: 'featureConfig:saveResult', payload: { featureId, ok: true } };
  }

  function updateTaskConfig(featureId: string, taskId: string, patch: TaskConfigPatch, featureCwd: string): void {
    try {
      console.log(`[updateTaskConfig] featureId=${featureId}, taskId=${taskId}, patch=`, patch);
      assertWritableDbPath();
      resolveWorkItemExecutionContext(featureId);
      updateCatalogTask(featureId, taskId, patch as Partial<Task>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[updateTaskConfig] error: ${message}`);
      if (stack) console.error(stack);
      msqEventBus.emit('ui:notice', { message: `Could not save task ${taskId}: ${message}` });
      return;
    }
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: `Saved task ${taskId}.` });
  }

  function updateProjectDefaults(patch: ProjectDefaultsPatch, featureCwd: string): void {
    try {
      console.log(`[updateProjectDefaults] patch=`, patch);
      assertWritableDbPath();
      if (patch.workflow?.approvals?.channel !== undefined) {
        assertConfiguredNotificationChannel(patch.workflow.approvals.channel);
      }
      // The legacy Settings wire message has no Work Item selector. Runtime
      // execution itself never uses this ambient compatibility path; starts
      // and item-level changes resolve their persisted Work Item context.
      const { repoId } = resolveRepo(featureCwd);
      updateCatalogDefaults(repoId, patch as CatalogDefaultsPatch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[updateProjectDefaults] error: ${message}`);
      if (stack) console.error(stack);
      msqEventBus.emit('ui:notice', { message: `Could not save project defaults: ${message}` });
      return;
    }
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: 'Saved project defaults.' });
  }

  function updateBudgetConfig(patch: BudgetConfigPatch, featureCwd: string): void {
    try {
      if (!Number.isInteger(patch.alertAtPercent) || patch.alertAtPercent < 0 || patch.alertAtPercent > 100) {
        throw new Error('alertAtPercent must be a whole number between 0 and 100.');
      }
      const config = loadConfig();
      saveConfig({
        ...config,
        budget: { ...config.budget, alertAtPercent: patch.alertAtPercent },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[updateBudgetConfig] error: ${message}`);
      msqEventBus.emit('ui:notice', { message: `Could not save budget settings: ${message}` });
      return;
    }
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: 'Saved budget settings.' });
  }

  function updateNotifications(patch: NotificationsPatch, featureCwd: string): void {
    try {
      saveNotificationsPatch(patch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      msqEventBus.emit('ui:notice', { message: `Could not save notifications: ${message}` });
      return;
    }
    resetWebStateCaches();
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: 'Saved notifications.' });
  }

  function updateToolsRegistry(tools: ToolRegistryEntry[], featureCwd: string): void {
    try {
      console.log(`[updateToolsRegistry] tools=${tools.map((tool) => tool.id).join(',')}`);
      // loadConfig + saveConfig are intentional here: this is App-level state,
      // not catalog state, and ConfigSchema owns duplicate-id/full-entry validation.
      saveConfig(ConfigSchema.parse({ ...loadConfig(), tools }));
      resetWebStateCaches();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[updateToolsRegistry] error: ${message}`);
      msqEventBus.emit('ui:notice', { message: `Could not save tools registry: ${message}` });
      return;
    }
    reconcileWebState(featureCwd);
    msqEventBus.emit('ui:info', { message: 'Saved tools registry.' });
  }

  // Poll the DB for new output rows written by separated feature-runner
  // processes (started as detached `msq run --feature` children). Those
  // processes share the SQLite database, but NOT the in-process `msqEventBus`
  // — so the `outputUnsubscribe` subscriber above only fires for adapters
  // that run in this same process. The poll picks up output written by
  // other processes every 1s and forwards new rows to subscribed clients.
  const outputPollInterval = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.authenticated || client.socket.readyState !== 1) continue;
      if (client.outputSubscriptions.size === 0) continue;
      for (const runId of client.outputSubscriptions) {
        const afterId = client.outputLastIdByRun.get(runId) ?? 0;
        const rows = listRunOutputAfterId(runId, afterId);
        if (rows.length === 0) continue;
        const lastRow = rows[rows.length - 1];
        if (!lastRow) continue;
        const newLastId = lastRow.id;
        client.outputLastIdByRun.set(runId, newLastId);
        for (const row of rows) {
          client.socket.send(JSON.stringify({
            type: 'run:output',
            payload: {
              id: row.id,
              runId: row.runId,
              featureId: row.featureId,
              tool: row.tool,
              line: row.line,
              stream: row.stream,
              source: row.source,
              createdAt: row.createdAt,
              toolName: row.toolName ?? undefined,
              level: row.level ?? undefined,
            },
          }));
        }
      }
    }
  }, 1000);
  outputPollInterval.unref();

  const reconcilePollInterval = setInterval(() => {
    const hasAuthenticatedClients = Array.from(clients.values()).some(
      (client) => client.authenticated && client.socket.readyState === 1 /* OPEN */,
    );
    if (!hasAuthenticatedClients) return;
    reconcileWebState(cwd);
  }, 1000);
  reconcilePollInterval.unref();

  return {
    server: httpServer,
    wss,
    url: `http://${options.host}:${String(options.port)}`,
    close: async (): Promise<void> => {
      clearInterval(outputPollInterval);
      clearInterval(reconcilePollInterval);
      outputUnsubscribe();
      stopTelegramPoller();
      for (const unsubscribe of eventUnsubscribers) unsubscribe();
      for (const client of clients.values()) {
        client.socket.terminate();
      }
      clients.clear();
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          wss.close(() => {
            resolve();
          });
        });
      });
    },
  };
}

export async function startWebServer(options: {
  host: string;
  port: number;
  auth: 'token' | 'none';
  token: string;
  cwd?: string;
}): Promise<RunningWebServer> {
  const running = createWebServer(options);
  return new Promise((resolve, reject) => {
    running.server.once('error', reject);
    running.server.listen(options.port, options.host, () => {
      running.server.off('error', reject);
      resolve(running);
    });
  });
}
