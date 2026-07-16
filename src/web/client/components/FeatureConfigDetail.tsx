import React, { useEffect, useRef, useState } from 'react';
import { Button } from './core/Button.js';
import { EditableSelectField } from './core/EditableSelectField.js';
import { EditableTextField } from './core/EditableTextField.js';
import { EditableToggleField } from './core/EditableToggleField.js';
import { Tag } from './core/Tag.js';
import type { FeatureCatalogEntry, BacklogSettings } from '../../../ui/catalog.js';
import type { FeatureConfigPatch, FeatureConfigSaveResult, TaskConfigPatch } from '../../types.js';

const executionTools = ['claude', 'codex', 'opencode'] as const;
const executionEfforts = ['low', 'medium', 'high'] as const;

interface ExecutionDraft {
  tool: string;
  model: string;
  effort: string;
  thinking: string;
  maxTokens: string;
  autoStart: boolean;
}

interface WorkflowDraft {
  mode: string;
  syncTasksToBacklog: boolean;
  approvalChannel: string;
  autoAdvance: boolean;
}

function executionDraftFrom(feature: FeatureCatalogEntry): ExecutionDraft {
  return {
    tool: feature.tool,
    model: feature.model ?? '',
    effort: feature.effort,
    thinking: feature.thinking ?? 'off',
    maxTokens: feature.maxTokens?.toString() ?? '',
    autoStart: feature.autoStart ?? false,
  };
}

function workflowDraftFrom(feature: FeatureCatalogEntry): WorkflowDraft {
  return {
    mode: feature.workflow.mode,
    syncTasksToBacklog: feature.workflow.syncTasksToBacklog,
    approvalChannel: feature.workflow.approvals.channel,
    autoAdvance: feature.workflow.autoAdvance,
  };
}

function sameWorkflowDraft(left: WorkflowDraft, right: WorkflowDraft): boolean {
  return left.mode === right.mode
    && left.syncTasksToBacklog === right.syncTasksToBacklog
    && left.approvalChannel === right.approvalChannel
    && left.autoAdvance === right.autoAdvance;
}

function sameStageOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((stage, index) => stage === right[index]);
}

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', padding: 14 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <div style={{ fontSize: 'var(--text-sm)' }}>{children}</div>
    </div>
  );
}

function ConfigField({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-dim)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--text-faint)', margin: '12px 0 6px' }}>
      {children}
    </div>
  );
}

export interface FeatureConfigDetailProps {
  feature: FeatureCatalogEntry;
  backlogSettings: BacklogSettings;
  onSaveConfig: (patch: FeatureConfigPatch) => void;
  onSaveTaskConfig?: (taskId: string, patch: TaskConfigPatch) => void;
  workflowSaveResult?: FeatureConfigSaveResult;
}

export function FeatureConfigDetail({ feature, backlogSettings, onSaveConfig, workflowSaveResult }: FeatureConfigDetailProps): React.JSX.Element {
  const stages = feature.workflow.stages;
  const [selectedStage, setSelectedStage] = useState(stages[0] ?? 'specify');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [newStage, setNewStage] = useState('');
  const [newStageSkill, setNewStageSkill] = useState('');
  const [newStageIssue, setNewStageIssue] = useState<string | null>(null);
  const [draftStages, setDraftStages] = useState<string[]>(() => [...stages]);
  const [stageOrderBaseline, setStageOrderBaseline] = useState<string[]>(() => [...stages]);
  const [pendingAddedStage, setPendingAddedStage] = useState<string | null>(null);
  const [pendingRemovedStage, setPendingRemovedStage] = useState<{ stage: string; nextStage: string } | null>(null);
  const [awaitingRemovedStageRefresh, setAwaitingRemovedStageRefresh] = useState<{ stage: string; nextStage: string } | null>(null);
  const [pendingStageOrder, setPendingStageOrder] = useState<string[] | null>(null);
  const [awaitingStageOrderRefresh, setAwaitingStageOrderRefresh] = useState<string[] | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [draftExecution, setDraftExecution] = useState<ExecutionDraft>(() => executionDraftFrom(feature));
  const [draftWorkflow, setDraftWorkflow] = useState<WorkflowDraft>(() => workflowDraftFrom(feature));
  const [workflowIssues, setWorkflowIssues] = useState<{ path?: string; message: string }[]>([]);
  const [workflowSavePending, setWorkflowSavePending] = useState(false);
  const [awaitingWorkflowRefresh, setAwaitingWorkflowRefresh] = useState<WorkflowDraft | null>(null);
  const workflowResultAtSaveStart = useRef<FeatureConfigSaveResult | undefined>(undefined);
  const stageOrderFeatureId = useRef(feature.id);

  useEffect(() => {
    if (stageOrderFeatureId.current === feature.id) return;
    stageOrderFeatureId.current = feature.id;
    setDraftStages([...stages]);
    setStageOrderBaseline([...stages]);
  }, [feature.id, stages]);

  useEffect(() => {
    if (!sameStageOrder(draftStages, stageOrderBaseline) || sameStageOrder(stageOrderBaseline, stages)) return;
    setDraftStages([...stages]);
    setStageOrderBaseline([...stages]);
  }, [draftStages, stageOrderBaseline, stages]);

  useEffect(() => {
    const guidance = feature.workflow.stepGuidance[selectedStage];
    setDraftPrompt(guidance?.prompt ?? '');
    setDraftSkills(guidance?.skills ?? []);
    setNewSkill('');
  }, [feature.id, selectedStage, feature.workflow.stepGuidance]);

  useEffect(() => {
    if (!pendingAddedStage || !stages.includes(pendingAddedStage)) return;
    setSelectedStage(pendingAddedStage);
    setPendingAddedStage(null);
  }, [pendingAddedStage, stages]);

  useEffect(() => {
    setDraftExecution({
      tool: feature.tool,
      model: feature.model ?? '',
      effort: feature.effort,
      thinking: feature.thinking ?? 'off',
      maxTokens: feature.maxTokens?.toString() ?? '',
      autoStart: feature.autoStart ?? false,
    });
  }, [feature.id, feature.tool, feature.model, feature.effort, feature.thinking, feature.maxTokens, feature.autoStart]);

  useEffect(() => {
    if (
      !workflowSavePending
      || workflowSaveResult?.payload.featureId !== feature.id
      || workflowSaveResult === workflowResultAtSaveStart.current
    ) return;
    if (workflowSaveResult.payload.ok) {
      if (pendingRemovedStage) {
        setAwaitingRemovedStageRefresh(pendingRemovedStage);
        setPendingRemovedStage(null);
      } else if (pendingStageOrder) {
        setAwaitingStageOrderRefresh(pendingStageOrder);
        setPendingStageOrder(null);
      } else {
        setAwaitingWorkflowRefresh(draftWorkflow);
      }
    } else {
      setWorkflowIssues(workflowSaveResult.payload.issues ?? [{ message: 'The workflow was not saved. Correct the issue and retry.' }]);
      setPendingRemovedStage(null);
      setPendingStageOrder(null);
    }
    setWorkflowSavePending(false);
  }, [draftWorkflow, feature.id, pendingRemovedStage, pendingStageOrder, workflowSavePending, workflowSaveResult]);

  useEffect(() => {
    if (!awaitingWorkflowRefresh || !sameWorkflowDraft(workflowDraftFrom(feature), awaitingWorkflowRefresh)) return;
    setDraftWorkflow(workflowDraftFrom(feature));
    setWorkflowIssues([]);
    setAwaitingWorkflowRefresh(null);
  }, [awaitingWorkflowRefresh, feature]);

  useEffect(() => {
    if (!awaitingRemovedStageRefresh || stages.includes(awaitingRemovedStageRefresh.stage)) return;
    setSelectedStage(stages.includes(awaitingRemovedStageRefresh.nextStage)
      ? awaitingRemovedStageRefresh.nextStage
      : (stages[0] ?? 'specify'));
    setAwaitingRemovedStageRefresh(null);
  }, [awaitingRemovedStageRefresh, stages]);

  useEffect(() => {
    if (!awaitingStageOrderRefresh || !sameStageOrder(stages, awaitingStageOrderRefresh)) return;
    setDraftStages([...stages]);
    setStageOrderBaseline([...stages]);
    setWorkflowIssues([]);
    setAwaitingStageOrderRefresh(null);
  }, [awaitingStageOrderRefresh, stages]);

  function saveGuidance(): void {
    onSaveConfig({
      workflow: {
        stepGuidance: {
          ...feature.workflow.stepGuidance,
          [selectedStage]: { skills: draftSkills, prompt: draftPrompt },
        },
      },
    });
    setSavedFlash(true);
    setTimeout(() => { setSavedFlash(false); }, 1400);
  }

  function revertGuidance(): void {
    const guidance = feature.workflow.stepGuidance[selectedStage];
    setDraftPrompt(guidance?.prompt ?? '');
    setDraftSkills(guidance?.skills ?? []);
  }

  function addStage(): void {
    const stage = newStage.trim();
    if (!stage) {
      setNewStageIssue('Enter a step name.');
      return;
    }
    if (stages.includes(stage)) {
      setNewStageIssue(`Step "${stage}" already exists.`);
      return;
    }

    const skill = newStageSkill.trim();
    onSaveConfig({
      workflow: {
        stages: [...stages, stage],
        stepGuidance: skill
          ? { ...feature.workflow.stepGuidance, [stage]: { skills: [skill] } }
          : feature.workflow.stepGuidance,
      },
    });
    setNewStage('');
    setNewStageSkill('');
    setNewStageIssue(null);
    setPendingAddedStage(stage);
  }

  function removeStage(stage: string): void {
    if (stages.length <= 1 || workflowSavePending || awaitingRemovedStageRefresh) return;
    const removedIndex = stages.indexOf(stage);
    if (removedIndex < 0) return;
    const nextStages = stages.filter((candidate) => candidate !== stage);
    const nextStage = nextStages[removedIndex] ?? nextStages[removedIndex - 1] ?? nextStages[0];
    if (!nextStage) return;
    const nextGuidance = Object.fromEntries(
      Object.entries(feature.workflow.stepGuidance).filter(([candidate]) => candidate !== stage),
    );

    setWorkflowIssues([]);
    workflowResultAtSaveStart.current = workflowSaveResult;
    setPendingRemovedStage({ stage, nextStage });
    setWorkflowSavePending(true);
    onSaveConfig({
      workflow: {
        stages: nextStages,
        stepGuidance: nextGuidance,
        sessionPolicy: {
          alwaysIsolatedStages: feature.workflow.sessionPolicy.alwaysIsolatedStages.filter((candidate) => candidate !== stage),
        },
      },
    });
  }

  const hasStageOrderChanges = !sameStageOrder(draftStages, stageOrderBaseline);
  const isStageOrderBusy = workflowSavePending || awaitingStageOrderRefresh !== null;

  function moveStage(stage: string, direction: 'up' | 'down'): void {
    if (isStageOrderBusy) return;
    setDraftStages((current) => {
      const index = current.indexOf(stage);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const currentStage = next[index];
      const targetStage = next[targetIndex];
      if (currentStage === undefined || targetStage === undefined) return current;
      [next[index], next[targetIndex]] = [targetStage, currentStage];
      return next;
    });
  }

  function saveStageOrder(): void {
    if (!hasStageOrderChanges || isStageOrderBusy) return;
    setWorkflowIssues([]);
    workflowResultAtSaveStart.current = workflowSaveResult;
    setPendingStageOrder(draftStages);
    setWorkflowSavePending(true);
    onSaveConfig({ workflow: { stages: draftStages } });
  }

  const executionBaseline = executionDraftFrom(feature);
  const executionPatch: FeatureConfigPatch = {};
  const hasChangedMaxTokens = draftExecution.maxTokens !== executionBaseline.maxTokens;
  let maxTokensError: string | undefined;

  if (draftExecution.tool !== executionBaseline.tool) executionPatch.tool = draftExecution.tool;
  const configuredCapabilities = backlogSettings.toolCapabilities?.[draftExecution.tool];
  // Preserve correction of legacy/unavailable saved tools: capabilities only
  // constrain tools known by the registry, while the existing unavailable-tool
  // guard still blocks the save until the user selects a valid tool.
  const executionCapabilities = configuredCapabilities ?? { model: true, effort: true, thinking: true };
  if (executionCapabilities.model && draftExecution.model !== executionBaseline.model) executionPatch.model = draftExecution.model;
  if (executionCapabilities.effort && draftExecution.effort !== executionBaseline.effort) executionPatch.effort = draftExecution.effort;
  if (executionCapabilities.thinking && draftExecution.thinking !== executionBaseline.thinking) executionPatch.thinking = draftExecution.thinking;
  if (draftExecution.autoStart !== executionBaseline.autoStart) executionPatch.autoStart = draftExecution.autoStart;

  if (hasChangedMaxTokens) {
    const parsed = Number(draftExecution.maxTokens);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      maxTokensError = 'Enter a positive whole number for maxTokens.';
    } else {
      executionPatch.maxTokens = parsed;
    }
  }

  const hasUnavailableTool = !executionTools.includes(draftExecution.tool as typeof executionTools[number]);
  const hasExecutionChanges = Object.keys(executionPatch).length > 0 || hasChangedMaxTokens;
  const unsupportedExecutionWarnings = configuredCapabilities ? [
    !executionCapabilities.model ? `${draftExecution.tool} does not support model; it will be ignored.` : undefined,
    !executionCapabilities.effort ? `${draftExecution.tool} does not support effort; it will be ignored.` : undefined,
    !executionCapabilities.thinking ? `${draftExecution.tool} does not support thinking; it will be ignored.` : undefined,
  ].filter((warning): warning is string => warning !== undefined) : [];
  const executionGuidance = maxTokensError
    ?? (hasUnavailableTool && hasExecutionChanges ? 'Select an available tool before saving execution settings.' : undefined);
  const canSaveExecution = hasExecutionChanges && !executionGuidance;

  function saveExecution(): void {
    if (!canSaveExecution || Object.keys(executionPatch).length === 0) return;
    onSaveConfig(executionPatch);
  }

  const workflowBaseline = workflowDraftFrom(feature);
  const workflowPatch: NonNullable<FeatureConfigPatch['workflow']> = {};
  if (draftWorkflow.mode !== workflowBaseline.mode) workflowPatch.mode = draftWorkflow.mode;
  if (draftWorkflow.syncTasksToBacklog !== workflowBaseline.syncTasksToBacklog) workflowPatch.syncTasksToBacklog = draftWorkflow.syncTasksToBacklog;
  const approvalPatch: { channel?: string } = {};
  if (draftWorkflow.approvalChannel !== workflowBaseline.approvalChannel) approvalPatch.channel = draftWorkflow.approvalChannel;
  if (Object.keys(approvalPatch).length > 0) workflowPatch.approvals = approvalPatch;
  if (draftWorkflow.autoAdvance !== workflowBaseline.autoAdvance) workflowPatch.autoAdvance = draftWorkflow.autoAdvance;
  const hasWorkflowChanges = Object.keys(workflowPatch).length > 0;
  const hasUnavailableApprovalChannel = draftWorkflow.approvalChannel !== 'telegram';
  const workflowGuidance = hasUnavailableApprovalChannel && hasWorkflowChanges
    ? 'Choose an available approval destination before saving.'
    : undefined;
  const canSaveWorkflow = hasWorkflowChanges && !workflowGuidance && !workflowSavePending && !awaitingWorkflowRefresh;

  function saveWorkflow(): void {
    if (!canSaveWorkflow) return;
    setWorkflowIssues([]);
    workflowResultAtSaveStart.current = workflowSaveResult;
    setWorkflowSavePending(true);
    onSaveConfig({ workflow: workflowPatch });
  }

  const resolvedStageSkills = backlogSettings.stageSkills[selectedStage] ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ConfigCard title="Execução">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          <EditableSelectField
            id="execution-tool"
            label="tool"
            value={draftExecution.tool}
            initialValue={executionBaseline.tool}
            options={executionTools.map((tool) => ({ value: tool, label: tool }))}
            onChange={(tool) => { setDraftExecution((draft) => ({ ...draft, tool: tool ?? '' })); }}
          />
          <EditableTextField
            id="execution-model"
            label="model"
            value={draftExecution.model}
            initialValue={executionBaseline.model}
            placeholder="default model"
            disabled={!executionCapabilities.model}
            onChange={(model) => { setDraftExecution((draft) => ({ ...draft, model })); }}
          />
          <EditableSelectField
            id="execution-effort"
            label="effort"
            value={draftExecution.effort}
            initialValue={executionBaseline.effort}
            options={executionEfforts.map((effort) => ({ value: effort, label: effort }))}
            disabled={!executionCapabilities.effort}
            onChange={(effort) => { setDraftExecution((draft) => ({ ...draft, effort: effort ?? '' })); }}
          />
          <EditableToggleField
            id="execution-thinking"
            label="thinking"
            value={draftExecution.thinking === 'on'}
            initialValue={executionBaseline.thinking === 'on'}
            disabled={!executionCapabilities.thinking}
            onChange={(thinking) => { setDraftExecution((draft) => ({ ...draft, thinking: thinking ? 'on' : 'off' })); }}
          />
          <EditableTextField
            id="execution-max-tokens"
            label="maxTokens (override)"
            value={draftExecution.maxTokens}
            initialValue={executionBaseline.maxTokens}
            placeholder="uses perFeatureMaxTokens when unset"
            onChange={(maxTokens) => { setDraftExecution((draft) => ({ ...draft, maxTokens })); }}
          />
          <EditableToggleField
            id="execution-auto-start"
            label="autoStart"
            value={draftExecution.autoStart}
            initialValue={executionBaseline.autoStart}
            onChange={(autoStart) => { setDraftExecution((draft) => ({ ...draft, autoStart })); }}
          />
          {executionGuidance && <span style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>{executionGuidance}</span>}
          {unsupportedExecutionWarnings.map((warning) => (
            <span key={warning} style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>{warning}</span>
          ))}
          {canSaveExecution && (
            <div>
              <Button variant="primary" size="sm" onClick={saveExecution}>save execution</Button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span style={{ color: 'var(--text-dim)' }}>dependsOn</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {feature.dependsOn.length ? feature.dependsOn.map((d) => <Tag key={d}>{d}</Tag>) : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span style={{ color: 'var(--text-dim)' }}>pendingDependencies</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(feature.pendingDependencies?.length ?? 0) > 0
              ? feature.pendingDependencies?.map((d) => <Tag key={d}>{d}</Tag>)
              : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-ok)' }}>ready</span>}
          </div>
        </div>
      </ConfigCard>

      <ConfigCard title="Spec & context">
        <ConfigField label="specFile" value={feature.specFile ?? '—'} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ color: 'var(--text-dim)' }}>context</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 320 }}>
            {(feature.context ?? []).map((c) => (
              <Tag key={c}>{c}</Tag>
            ))}
          </div>
        </div>
      </ConfigCard>

      <ConfigCard title="Workflow">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          <EditableSelectField
            id="workflow-mode"
            label="mode"
            value={draftWorkflow.mode}
            initialValue={workflowBaseline.mode}
            options={[{ value: 'single', label: 'single' }, { value: 'staged', label: 'staged' }]}
            onChange={(mode) => { setDraftWorkflow((draft) => ({ ...draft, mode: mode ?? '' })); }}
          />
          <EditableToggleField
            id="workflow-sync-tasks"
            label="syncTasksToBacklog"
            value={draftWorkflow.syncTasksToBacklog}
            initialValue={workflowBaseline.syncTasksToBacklog}
            onChange={(syncTasksToBacklog) => { setDraftWorkflow((draft) => ({ ...draft, syncTasksToBacklog })); }}
          />
          <EditableSelectField
            id="workflow-approval-channel"
            label="approvals.channel"
            value={draftWorkflow.approvalChannel}
            initialValue={workflowBaseline.approvalChannel}
            options={[{ value: 'telegram', label: 'telegram' }]}
            onChange={(approvalChannel) => { setDraftWorkflow((draft) => ({ ...draft, approvalChannel: approvalChannel ?? '' })); }}
          />
          <EditableToggleField
            id="workflow-auto-advance"
            label="workflow.autoAdvance"
            value={draftWorkflow.autoAdvance}
            initialValue={workflowBaseline.autoAdvance}
            onChange={(autoAdvance) => { setDraftWorkflow((draft) => ({ ...draft, autoAdvance })); }}
          />
          {workflowGuidance && <span style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>{workflowGuidance}</span>}
          {workflowIssues.map((issue, index) => (
            <span key={`${issue.path ?? 'workflow'}-${String(index)}`} style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
              {issue.path ? `${issue.path}: ${issue.message}` : issue.message}
            </span>
          ))}
          {canSaveWorkflow && <div><Button variant="primary" size="sm" onClick={saveWorkflow}>save workflow</Button></div>}
        </div>
        <ConfigField label="sessionPolicy.mode" value={feature.workflow.sessionPolicy.mode} />
      </ConfigCard>

      {feature.retry && (
        <ConfigCard title="Retry & fallback">
          <ConfigField label="maxAttempts" value={feature.retry.maxAttempts} />
          <ConfigField label="backoffMs" value={feature.retry.backoffMs} />
          <ConfigField label="onFail" value={feature.retry.onFail} />
          <ConfigField
            label="fallback"
            value={feature.retry.fallback.length ? feature.retry.fallback.map((f) => `${f.tool}/${f.model ?? '—'} (${f.effort ?? '—'})`).join(', ') : 'none'}
          />
        </ConfigCard>
      )}

      <ConfigCard title="Steps — prompt and skills per stage">
        <SubHeading>Add step</SubHeading>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            id="new-step-name"
            value={newStage}
            onChange={(e) => { setNewStage(e.target.value); setNewStageIssue(null); }}
            placeholder="step name…"
            style={{ flex: 1, minWidth: 140, background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '6px 9px' }}
          />
          <input
            id="new-step-guidance-skill"
            value={newStageSkill}
            onChange={(e) => { setNewStageSkill(e.target.value); }}
            placeholder="guidance skill (optional)…"
            style={{ flex: 1, minWidth: 180, background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '6px 9px' }}
          />
          <Button variant="neutral" size="sm" onClick={addStage}>add step</Button>
        </div>
        {newStageIssue && <div role="alert" style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', marginBottom: 8 }}>{newStageIssue}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {draftStages.map((s, index) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', border: `1px solid ${selectedStage === s ? 'var(--accent-info)' : 'var(--border-strong)'}`, borderRadius: 'var(--radius-pill)', background: selectedStage === s ? 'var(--accent-info-10)' : 'transparent' }}>
              <button
                onClick={() => { setSelectedStage(s); }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '6px 8px 6px 12px', border: 0, borderRadius: 'var(--radius-pill)', cursor: 'pointer', background: 'transparent', color: selectedStage === s ? 'var(--accent-info)' : 'var(--text-dim)', fontWeight: selectedStage === s ? 600 : 400 }}
              >
                {s}
              </button>
              <button
                type="button"
                aria-label={`Move ${s} up`}
                disabled={index === 0 || isStageOrderBusy}
                onClick={() => { moveStage(s, 'up'); }}
                style={{ border: 0, borderLeft: '1px solid var(--border-dim)', padding: '4px 6px', background: 'transparent', color: 'var(--text-dim)', cursor: index === 0 || isStageOrderBusy ? 'not-allowed' : 'pointer' }}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${s} down`}
                disabled={index === draftStages.length - 1 || isStageOrderBusy}
                onClick={() => { moveStage(s, 'down'); }}
                style={{ border: 0, borderLeft: '1px solid var(--border-dim)', padding: '4px 6px', background: 'transparent', color: 'var(--text-dim)', cursor: index === draftStages.length - 1 || isStageOrderBusy ? 'not-allowed' : 'pointer' }}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove ${s}`}
                disabled={stages.length <= 1 || workflowSavePending || awaitingRemovedStageRefresh !== null || hasStageOrderChanges}
                onClick={() => { removeStage(s); }}
                style={{ border: 0, borderLeft: '1px solid var(--border-dim)', padding: '4px 8px', background: 'transparent', color: 'var(--text-dim)', cursor: stages.length <= 1 || hasStageOrderChanges ? 'not-allowed' : 'pointer' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {hasStageOrderChanges && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span aria-live="polite" style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>Proposed order: {draftStages.join(' → ')}</span>
            <Button variant="primary" size="sm" onClick={saveStageOrder} disabled={isStageOrderBusy}>save step order</Button>
          </div>
        )}
        {stages.length <= 1 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', marginBottom: 8 }}>A workflow must keep at least one step.</div>}

        <SubHeading>Resolved skills ({selectedStage}) — global, via stageSkills</SubHeading>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {resolvedStageSkills.length ? resolvedStageSkills.map((s) => <Tag key={s}>{s}</Tag>) : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>}
        </div>

        <SubHeading>Extra skills for this stage (workflow.stepGuidance.{selectedStage}.skills)</SubHeading>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {draftSkills.map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
          {draftSkills.length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <input
            value={newSkill}
            onChange={(e) => { setNewSkill(e.target.value); }}
            placeholder="add skill…"
            style={{
              flex: 1,
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: '6px 9px',
            }}
          />
          <Button
            variant="neutral"
            size="sm"
            onClick={() => {
              if (newSkill.trim()) {
                setDraftSkills((ds) => [...ds, newSkill.trim()]);
                setNewSkill('');
              }
            }}
          >
            add
          </Button>
        </div>

        <SubHeading>Custom stage prompt (workflow.stepGuidance.{selectedStage}.prompt)</SubHeading>
        <textarea
          value={draftPrompt}
          onChange={(e) => { setDraftPrompt(e.target.value); }}
          rows={5}
          placeholder={`Free text appended to the end of ${selectedStage}'s final prompt…`}
          style={{
            width: '100%',
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-dim)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            padding: 10,
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: '6px 0 12px', lineHeight: 1.5 }}>
          Appended to the end of the stage&apos;s final prompt — skills + extra skills + this text, separated by <code>---</code>.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="primary" size="sm" onClick={saveGuidance}>
            save step prompt
          </Button>
          <Button variant="neutral" size="sm" onClick={revertGuidance}>
            revert
          </Button>
          {savedFlash && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--accent-ok)' }}>✓ saved</span>}
        </div>
      </ConfigCard>
    </div>
  );
}
