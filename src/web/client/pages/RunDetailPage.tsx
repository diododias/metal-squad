import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { WorkflowStepper } from '../components/navigation/WorkflowStepper.js';
import { Tabs } from '../components/navigation/Tabs.js';
import { ApprovalBanner } from '../components/feedback/ApprovalBanner.js';
import { QuestionBanner } from '../components/feedback/QuestionBanner.js';
import { AgentTranscript, type TranscriptEntry } from '../components/transcript/AgentTranscript.js';
import { RunStatusStrip } from '../components/status/RunStatusStrip.js';
import { FeatureConfigDetail } from '../components/FeatureConfigDetail.js';
import { PageHeader } from '../PageHeader.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import { useIsMobile } from '../Responsive.js';
import { formatClockTime, formatElapsed, formatPercent, formatPublishTarget, formatTokens, getPublishStatusLabel, getRunStatusLabel, parseTimestampMs } from '../lib/format.js';
import { summarizeTaskRuns } from '../lib/workflow.js';
import { STAGE_ORDER } from '../../../core/workflow/stageOrder.js';
import type { MsqWebState, FeatureConfigPatch, WebSocketClientMessage } from '../../types.js';
import type { RunSummary, TaskRun } from '../../../db/repo.js';
import type { RunBreakdown } from '../../../core/stats.js';
import type { OutputLine } from '../hooks/useLocalOutput.js';
import type { SessionStatusSnapshot, ToolCallRecord } from '../../../core/adapters/types.js';
import { detectStderrLevel } from '../../../core/adapters/types.js';

export interface RunDetailPageProps {
  state: MsqWebState;
  featureId: string;
  runDetails: Record<number, { taskRuns: TaskRun[]; breakdown: RunBreakdown | null; sessionStatus: SessionStatusSnapshot | null; statusHistory: SessionStatusSnapshot[]; toolCalls: ToolCallRecord[] }>;
  linesByRun: Record<number, OutputLine[]>;
  onSubscribeRun: (runId: number) => () => void;
  onBack: () => void;
  send: (message: WebSocketClientMessage) => void;
}

const TABS = [
  { id: 'summary', label: 'Run Summary' },
  { id: 'spec', label: 'Feature Spec' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'config', label: 'Feature Config' },
  { id: 'output', label: 'Live Output' },
];

const resumeEfforts = ['low', 'medium', 'high'] as const;

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  padding: '6px 9px',
};

type TimedEntry = TranscriptEntry & { sortKey: number };

const HEARTBEAT_DIAGNOSTIC_PATTERN = /^\[msq\]\s+.+?\s+running for\s+\d+s\s+\(stdout\s+\d+B\s+stderr\s+\d+B\s+idle\s+\d+s\)\s*(.*)$/;

/** Heartbeat lines carry a verbose diagnostic payload
 * (`[msq] <label> running for Ns (stdout XB stderr YB idle Zs) <suffix>`).
 * Surface only the agent activity suffix (or "thinking…" when no suffix exists),
 * mirroring the TUI formatHeartbeat behavior, so the Live Output tab doesn't get
 * flooded by metrics that mean nothing to the user. */
function formatHeartbeat(line: string): string {
  const match = HEARTBEAT_DIAGNOSTIC_PATTERN.exec(line.trim());
  if (!match) return line;
  const suffix = (match[1] ?? '').trim();
  return suffix || 'thinking…';
}

function isTerminalRunStatus(status: RunSummary['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'aborted' || status === 'blocked';
}

function outputToTranscript(lines: OutputLine[], runStatus: RunSummary['status']): TimedEntry[] {
  const isTerminal = isTerminalRunStatus(runStatus);
  return lines
    .filter((line) => {
      // After a run finishes, stale heartbeat rows persisted before completion would
      // otherwise linger in the Live Output tab as "running for Ns" diagnostics —
      // they no longer describe reality once the adapter exited, so drop them. While
      // the run is still active, keep heartbeats as the live "thinking…" indicator.
      if (line.source === 'heartbeat' && isTerminal) return false;
      return true;
    })
    .map((line, i) => {
      const source = line.source ?? 'stdout';
      // Historical rows (and any adapter path that doesn't tag `level` itself) still
      // carry the raw stderr log line, so re-detect error/warn from the text as a
      // fallback rather than trusting only the persisted `level` column.
      const level = line.level ?? detectStderrLevel(line.line);
      const isError = level === 'error';
      const type: TranscriptEntry['type'] = source === 'tool' || isError ? 'tool' : source === 'agent' ? 'agent' : 'system';
      const raw = line.line;
      const text = source === 'heartbeat'
        ? formatHeartbeat(raw)
        : level === 'warn' ? `[warn] ${raw}` : raw;
      return {
        id: line.id ?? i,
        type,
        status: isError ? 'error' : undefined,
        tool: line.toolName ?? line.tool,
        text,
        command: type === 'tool' && !isError && source === 'tool' ? text : undefined,
        output: type === 'tool' && isError ? text : undefined,
        time: formatClockTime(line.createdAt),
        sortKey: parseTimestampMs(line.createdAt) ?? i,
      };
    });
}

function toolCallsToTranscript(calls: ToolCallRecord[]): TimedEntry[] {
  return calls.map((call) => ({
    id: `tool-${call.id}`,
    type: 'tool',
    status: call.phase === 'started' ? 'running' : call.phase === 'failed' ? 'error' : 'done',
    tool: call.name,
    command: call.arguments == null ? undefined : JSON.stringify(call.arguments),
    output: call.error ?? call.output ?? undefined,
    time: formatClockTime(call.startedAt),
    sortKey: parseTimestampMs(call.startedAt) ?? call.sequence,
  }));
}

export function RunDetailPage({
  state,
  featureId,
  runDetails,
  linesByRun,
  onSubscribeRun,
  onBack,
  send,
}: RunDetailPageProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('summary');
  const isMobile = useIsMobile();
  const [overrideTool, setOverrideTool] = useState('');
  const [overrideModel, setOverrideModel] = useState('');
  const [overrideEffort, setOverrideEffort] = useState('');
  const run = state.runs.find((r) => r.featureId === featureId);
  const feature = state.featureCatalog[featureId];
  const runId = run?.runId;
  const { activeProjectId, setActiveProject } = useActiveProject();
  const itemProjectId = feature?.projectId ?? null;
  const projects = 'projects' in state ? state.projects : [];
  const projectName = projects.find((project) => project.projectId === itemProjectId)?.name;
  function returnToItemContext(): void {
    if (itemProjectId && itemProjectId !== activeProjectId) setActiveProject(itemProjectId);
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (runId == null) return undefined;
    return onSubscribeRun(runId);
  }, [runId, onSubscribeRun]);

  const detail = run ? runDetails[run.runId] : undefined;
  const stageGroups = useMemo(() => summarizeTaskRuns(detail?.taskRuns ?? [], feature?.workflow.stages), [detail, feature]);
  const toolCalls = useMemo(() => detail?.toolCalls ?? [], [detail]);
  const combinedOutput = useMemo(() => {
    const lineEntries = outputToTranscript(run ? (linesByRun[run.runId] ?? []) : [], run?.status ?? 'running').filter(
      // Duplicate tool-echo lines are dropped once structured tool calls cover them, but
      // error lines (e.g. raw stderr router failures) have no structured counterpart and
      // must always surface, even when the run has other successful tool calls.
      (entry) => entry.type !== 'tool' || entry.status === 'error' || toolCalls.length === 0,
    );
    const toolEntries = toolCallsToTranscript(toolCalls);
    return [...lineEntries, ...toolEntries].sort((a, b) => a.sortKey - b.sortKey);
  }, [run, linesByRun, toolCalls]);
  const toolIds = state.runtimeConfig.tools.map((tool) => tool.id);

  useEffect(() => {
    if (activeTab !== 'output') return;
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [activeTab, combinedOutput]);

  if (!run) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader
          title={featureId}
          breadcrumb={
            <a href="#/runs" onClick={returnToItemContext} style={{ color: 'var(--text-dim)' }}>
              Runs
            </a>
          }
        />
        <div style={{ padding: 28, color: 'var(--text-dim)' }}>
          No run found for {featureId}. It may still be in Todo — start it from the Board.
        </div>
      </div>
    );
  }

  const stages = feature?.workflow.stages ?? [...STAGE_ORDER];
  const canPause = run.pipelineStatus === 'running';
  const canAbort = run.pipelineStatus === 'running' || run.pipelineStatus === 'blocked';
  const canResumeWithOverride = run.pipelineId != null
    && (run.pipelineStatus === 'paused' || run.pipelineStatus === 'aborted');
  const pendingPrompt = run.pendingStageRequestPrompt;

  function resumeWithOverride(tool?: string): void {
    if (run?.pipelineId == null) return;
    send({
      type: 'action:resumeWithOverride',
      pipelineId: run.pipelineId,
      featureId,
      tool: tool ?? overrideTool,
      model: overrideModel || undefined,
      effort: overrideEffort || undefined,
    });
  }

  function resolveApproval(response: 'advance' | 'hold' | 'retry'): void {
    if (run == null) return;
    if (run.pendingStageRequestId != null) {
      send({ type: 'action:resolveStageRequest', requestId: run.pendingStageRequestId, response });
    } else if (run.gateId != null) {
      const decision = response === 'advance' ? 'approved' : response === 'retry' ? 'retried' : 'skipped';
      send({ type: 'action:resolveGate', gateId: run.gateId, decision });
    }
  }

  function resolveQuestion(response: string): void {
    if (run?.pendingStageRequestId == null) return;
    send({ type: 'action:resolveStageRequest', requestId: run.pendingStageRequestId, response });
  }

  function saveConfig(patch: FeatureConfigPatch): void {
    send({ type: 'action:updateFeatureConfig', featureId, patch });
  }

  const tabContent: Record<string, React.ReactNode> = {
    summary: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <WorkflowStepper stages={stages} currentStage={run.pipelineCurrentStage ?? run.stage} completed={run.status === 'done'} />
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stageGroups.map((g) => (
            <div key={g.stage} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>
              <span>{g.stage}</span>
              <span>
                {g.done}/{g.total} done · {formatTokens(g.totalTokens)} tok
              </span>
            </div>
          ))}
          {stageGroups.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No task run data yet.</div>}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            padding: 12,
            border: '1px solid var(--border-dim)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-panel)',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase' }}>Publish</div>
            <div style={{ color: 'var(--text-base)', fontSize: 'var(--text-sm)' }}>{getPublishStatusLabel(run)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase' }}>Branch / PR</div>
            <div style={{ color: 'var(--text-base)', fontSize: 'var(--text-sm)' }}>
              {run.prUrl ? (
                <a href={run.prUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-info)' }}>
                  {formatPublishTarget(run)}
                </a>
              ) : (
                formatPublishTarget(run)
              )}
            </div>
            {run.branchName && run.branchName !== formatPublishTarget(run) && (
              <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>{run.branchName}</div>
            )}
          </div>
          <div>
            <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase' }}>Commit</div>
            <div style={{ color: 'var(--text-base)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
              {run.commitSha ? run.commitSha.slice(0, 12) : '—'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase' }}>Base</div>
            <div style={{ color: 'var(--text-base)', fontSize: 'var(--text-sm)' }}>{run.baseBranch ?? '—'}</div>
          </div>
          {run.publishError && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase' }}>Publish check</div>
              <div style={{ color: 'var(--accent-danger)', fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>{run.publishError}</div>
            </div>
          )}
        </div>
      </div>
    ),
    spec: <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-dim)', fontSize: 'var(--text-sm)' }}>{feature?.description ?? `No spec declared for ${featureId}.`}</div>,
    workflow: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(feature?.tasks ?? []).length ? (
          feature?.tasks?.map((t) => (
            <div key={t.id} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>
              {t.id} — {t.title} <span style={{ color: 'var(--text-faint)' }}>({t.status})</span>
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No task breakdown declared.</div>
        )}
      </div>
    ),
    config: feature ? (
      <FeatureConfigDetail
        feature={feature}
        backlogSettings={state.backlogSettings}
        approvalChannels={state.runtimeConfig.notifications.channels.map((channel) => channel.type)}
        toolIds={toolIds}
        onSaveConfig={saveConfig}
      />
    ) : (
      <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Feature config not found in catalog.</div>
    ),
    output: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {combinedOutput.length > 0 ? (
          <AgentTranscript entries={combinedOutput} />
        ) : (
          <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No output captured for this run yet.</div>
        )}
      </div>
    ),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
      <PageHeader
        title={feature?.title ?? featureId}
        breadcrumb={
          <span>
            <a href="#/runs" onClick={returnToItemContext} style={{ color: 'var(--text-dim)' }}>
              Runs
            </a>{' '}
            / {projectName ? `${projectName} · ` : ''}{feature?.repoLabel ? `${feature.repoLabel} · ` : ''}{featureId}
          </span>
        }
        actions={
          <>
            {canPause && (
              <Button
                variant="pause"
                size="sm"
                onClick={() => {
                  if (run.pipelineId) send({ type: 'action:pausePipeline', pipelineId: run.pipelineId });
                }}
              >
                pause
              </Button>
            )}
            {run.pipelineStatus === 'paused' && (
              <Button
                variant="ok"
                size="sm"
                onClick={() => {
                  if (run.pipelineId) send({ type: 'action:resumePipeline', pipelineId: run.pipelineId });
                }}
              >
                resume
              </Button>
            )}
            {canAbort && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (run.pipelineId) send({ type: 'action:abortPipeline', pipelineId: run.pipelineId });
                }}
              >
                abort
              </Button>
            )}
            {!isMobile && (
              <Button variant="neutral" size="sm" onClick={() => { returnToItemContext(); onBack(); }}>
                close
              </Button>
            )}
          </>
        }
      />
      {isMobile && (
        <button
          aria-label="Close run detail"
          title="Close"
          onClick={() => { returnToItemContext(); onBack(); }}
          style={{
            position: 'absolute',
            top: 'calc(12px + env(safe-area-inset-top, 0px))',
            right: 12,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-dim)',
            background: 'var(--bg-panel)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: isMobile ? 12 : 20 }}>
        {pendingPrompt && (
          <div style={{ marginBottom: 16 }}>
            {run.pendingStageRequestKind === 'input' ? (
              <QuestionBanner prompt={pendingPrompt} options={run.pendingStageRequestOptions ?? undefined} onAnswer={resolveQuestion} />
            ) : (
              <ApprovalBanner
                prompt={pendingPrompt}
                onAdvance={() => { resolveApproval('advance'); }}
                onAdvanceWithTool={(tool) => { resumeWithOverride(tool); }}
                onHold={() => { resolveApproval('hold'); }}
                onRetry={() => { resolveApproval('retry'); }}
              />
            )}
          </div>
        )}
        {canResumeWithOverride && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              marginBottom: 16,
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-panel)',
            }}
          >
            <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)' }}>Resume with another tool:</span>
            <select
              aria-label="Resume tool override"
              value={overrideTool}
              onChange={(e) => { setOverrideTool(e.target.value); }}
              style={inputStyle}
            >
              <option value="">tool (default)</option>
              {toolIds.map((tool) => (
                <option key={tool} value={tool}>{tool}</option>
              ))}
            </select>
            <input
              aria-label="Resume model override"
              value={overrideModel}
              onChange={(e) => { setOverrideModel(e.target.value); }}
              placeholder="model (optional)"
              style={{ ...inputStyle, minWidth: 140 }}
            />
            <select
              aria-label="Resume effort override"
              value={overrideEffort}
              onChange={(e) => { setOverrideEffort(e.target.value); }}
              style={inputStyle}
            >
              <option value="">effort (optional)</option>
              {resumeEfforts.map((effort) => (
                <option key={effort} value={effort}>{effort}</option>
              ))}
            </select>
            <Button variant="ok" size="sm" onClick={() => { resumeWithOverride(); }}>
              resume with override
            </Button>
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <RunStatusStrip
            status={run.status}
            statusLabel={getRunStatusLabel(run)}
            spinnerEnabled={state.runtimeConfig.web.statusSpinner}
            tool={run.tool}
            model={feature?.model}
            tokens={formatTokens(run.pipelineTotalTokens ?? run.totalTokens)}
            contextPercent={formatPercent(run.contextWindowPercent)}
            elapsed={formatElapsed(run.startedAt, run.endedAt)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Tabs
            tabs={TABS}
            activeId={activeTab}
            onSelect={(id) => {
              stickToBottomRef.current = true;
              setActiveTab(id);
            }}
          />
        </div>
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
          style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
        >
          {tabContent[activeTab]}
        </div>
      </div>
    </div>
  );
}
