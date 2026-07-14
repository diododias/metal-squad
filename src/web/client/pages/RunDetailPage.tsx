import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { MetricCard } from '../components/data/MetricCard.js';
import { WorkflowStepper } from '../components/navigation/WorkflowStepper.js';
import { Tabs } from '../components/navigation/Tabs.js';
import { ApprovalBanner } from '../components/feedback/ApprovalBanner.js';
import { AgentTranscript, type TranscriptEntry } from '../components/transcript/AgentTranscript.js';
import { ToolCallGroup } from '../components/transcript/ToolCallGroup.js';
import { RunStatusIndicator } from '../components/status/RunStatusIndicator.js';
import { FeatureConfigDetail } from '../components/FeatureConfigDetail.js';
import { PageHeader } from '../PageHeader.js';
import { formatElapsed, formatPercent, formatTokens, getRunStatusLabel } from '../lib/format.js';
import { summarizeTaskRuns } from '../lib/workflow.js';
import type { MsqWebState, FeatureConfigPatch, WebSocketClientMessage } from '../../types.js';
import type { TaskRun } from '../../../db/repo.js';
import type { RunBreakdown } from '../../../core/stats.js';
import type { OutputLine } from '../hooks/useLocalOutput.js';
import type { SessionStatusSnapshot, ToolCallRecord } from '../../../core/adapters/types.js';

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

function outputToTranscript(lines: OutputLine[]): TranscriptEntry[] {
  return lines.map((line, i) => {
    const source = line.source ?? 'stdout';
    const type: TranscriptEntry['type'] = source === 'tool' ? 'tool' : source === 'agent' ? 'agent' : 'system';
    return {
      id: line.id ?? i,
      type,
      tool: line.tool,
      text: line.line,
      command: type === 'tool' ? line.line : undefined,
    };
  });
}

function snapshotFromRun(run: NonNullable<MsqWebState['runs'][number]>): SessionStatusSnapshot | null {
  if (!run.sessionStatus || !run.sessionStartedAt || !run.sessionUpdatedAt) return null;
  return {
    runId: run.runId,
    featureId: run.featureId,
    tool: run.tool,
    status: run.sessionStatus,
    startedAt: run.sessionStartedAt,
    updatedAt: run.sessionUpdatedAt,
    elapsedMs: run.sessionElapsedMs ?? 0,
    lastOutputAt: run.sessionLastOutputAt ?? null,
    idleMs: run.sessionIdleMs ?? null,
    reason: run.sessionReason ?? null,
    terminal: run.sessionTerminal ?? false,
  };
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
  const run = state.runs.find((r) => r.featureId === featureId);
  const feature = state.featureCatalog[featureId];
  const runId = run?.runId;

  useEffect(() => {
    if (runId == null) return undefined;
    return onSubscribeRun(runId);
  }, [runId, onSubscribeRun]);

  const detail = run ? runDetails[run.runId] : undefined;
  const stageGroups = useMemo(() => summarizeTaskRuns(detail?.taskRuns ?? [], feature?.workflow.stages), [detail, feature]);
  const transcript = useMemo(() => outputToTranscript(run ? (linesByRun[run.runId] ?? []) : []), [run, linesByRun]);
  const sessionStatus = detail?.sessionStatus ?? (run ? snapshotFromRun(run) : null);
  const toolCalls = detail?.toolCalls ?? [];

  if (!run) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader
          title={featureId}
          breadcrumb={
            <a href="#/runs" style={{ color: 'var(--text-dim)' }}>
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

  const stages = feature?.workflow.stages ?? ['specify', 'plan', 'tasks', 'implement', 'validate'];
  const canPause = run.pipelineStatus === 'running';
  const canAbort = run.pipelineStatus === 'running' || run.pipelineStatus === 'blocked';
  const pendingPrompt = run.pendingStageRequestPrompt;

  function resolveApproval(response: 'advance' | 'hold' | 'retry'): void {
    if (run == null) return;
    if (run.pendingStageRequestId != null) {
      send({ type: 'action:resolveStageRequest', requestId: run.pendingStageRequestId, response });
    } else if (run.gateId != null) {
      const decision = response === 'advance' ? 'approved' : response === 'retry' ? 'retried' : 'skipped';
      send({ type: 'action:resolveGate', gateId: run.gateId, decision });
    }
  }

  function saveConfig(patch: FeatureConfigPatch): void {
    send({ type: 'action:updateFeatureConfig', featureId, patch });
  }

  const tabContent: Record<string, React.ReactNode> = {
    summary: (
      <div>
        <div style={{ marginBottom: 14 }}>
          <RunStatusIndicator status={sessionStatus} fallbackStatus={run.status} spinnerEnabled={state.runtimeConfig.web.statusSpinner} />
        </div>
        <WorkflowStepper stages={stages} currentStage={run.pipelineCurrentStage ?? run.stage} />
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
      <FeatureConfigDetail feature={feature} backlogSettings={state.backlogSettings} onSaveConfig={saveConfig} />
    ) : (
      <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Feature config not found in catalog.</div>
    ),
    output: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {toolCalls.length > 0 && <ToolCallGroup groupKey={`${String(runId ?? 0)}:${run.stage ?? 'run'}:0`} calls={toolCalls} />}
        {transcript.length > 0 ? <AgentTranscript entries={transcript.filter((entry) => entry.type !== 'tool' || toolCalls.length === 0)} /> : toolCalls.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No output captured for this run yet.</div>}
      </div>
    ),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={feature?.title ?? featureId}
        breadcrumb={
          <span>
            <a href="#/runs" style={{ color: 'var(--text-dim)' }}>
              Runs
            </a>{' '}
            / {featureId}
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
            <Button variant="neutral" size="sm" onClick={onBack}>
              close
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {pendingPrompt && (
          <div style={{ marginBottom: 16 }}>
            <ApprovalBanner prompt={pendingPrompt} onAdvance={() => { resolveApproval('advance'); }} onHold={() => { resolveApproval('hold'); }} onRetry={() => { resolveApproval('retry'); }} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
          <MetricCard label="Status" value={sessionStatus?.status ?? getRunStatusLabel(run)} status={run.status} />
          <MetricCard label="Tool" value={run.tool} />
          <MetricCard label="Model" value={feature?.model ?? '—'} />
          <MetricCard label="Tokens" value={formatTokens(run.totalTokens)} />
          <MetricCard label="Context" value={formatPercent(run.contextWindowPercent)} />
          <MetricCard label="Elapsed" value={formatElapsed(run.startedAt, run.endedAt)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Tabs tabs={TABS} activeId={activeTab} onSelect={setActiveTab} />
        </div>
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
