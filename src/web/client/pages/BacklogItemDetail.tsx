import React, { useEffect, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { WorkItemActions } from '../components/WorkItemActions.js';
import { FeatureConfigDetail } from '../components/FeatureConfigDetail.js';
import { WorkflowStepper } from '../components/navigation/WorkflowStepper.js';
import { Tabs } from '../components/navigation/Tabs.js';
import { MarkdownView } from '../components/MarkdownView.js';
import { PageHeader, type PageHeaderProps } from '../PageHeader.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import { startEligibility } from '../lib/startEligibility.js';
import { pillStatus } from '../lib/pillStatus.js';
import type { MsqWebState, FeatureConfigPatch, FeatureConfigSaveResult, TaskConfigPatch, WebSocketClientMessage, WebSocketServerMessage, MsqWorkItemType } from '../../types.js';
import type { RunHistoryEntry } from '../../../db/repo.js';

export interface BacklogItemDetailProps {
  state: MsqWebState;
  featureId: string;
  runHistories: Record<string, RunHistoryEntry[]>;
  onSubscribeHistory: (featureId: string) => () => void;
  onBack: () => void;
  onStart: (featureId: string) => void;
  onSaveConfig: (featureId: string, patch: FeatureConfigPatch) => void;
  workflowSaveResult?: FeatureConfigSaveResult;
  onSaveTaskConfig: (featureId: string, taskId: string, patch: TaskConfigPatch) => void;
  onOpenRun: (featureId: string) => void;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  /** Contextual breadcrumb override (e.g. Projects › Project › Epic when opened from the hierarchy). */
  breadcrumb?: PageHeaderProps['breadcrumb'];
}

let typeChangeSequence = 0;
const typeChangeRequestId = (): string => `type-change-${String(Date.now())}-${String(++typeChangeSequence)}`;

export function BacklogItemDetail({
  state,
  featureId,
  runHistories: _runHistories,
  onSubscribeHistory,
  onBack,
  onStart,
  onSaveConfig,
  workflowSaveResult,
  send,
  actionResults,
  breadcrumb,
}: BacklogItemDetailProps): React.JSX.Element {
  const feature = state.featureCatalog[featureId];
  const [specDraft, setSpecDraft] = useState('');
  const [specView, setSpecView] = useState<'edit' | 'preview'>('edit');
  const [typeChange, setTypeChange] = useState<{
    pendingRequestId?: string;
    proposedType?: MsqWorkItemType;
    preview?: { stages: string[]; templateId: string; templateVersion: number };
    error?: string;
  }>({});
  const handledTypeChangeResults = React.useRef(new Set<string>());
  const doneFeatureIds = new Set(state.doneFeatureIds);
  const failedFeatureIds = new Set<string>();
  const hasRunHistory = state.runs.some((run) => run.featureId === featureId);
  for (const run of state.runs) {
    if (run.status === 'failed') {
      failedFeatureIds.add(run.featureId);
    }
  }
  const repositories = 'repositories' in state ? state.repositories : [];
  const eligibility = startEligibility({
    dependsOn: feature?.dependsOn ?? [],
    repoId: feature?.repoId,
    integrityIssue: feature?.integrityIssue,
    doneFeatureIds,
    repositories,
  });
  const activeRun = state.runs.find((run) => run.featureId === featureId);
  const { activeProjectId, setActiveProject } = useActiveProject();
  const itemProjectId = feature?.projectId ?? null;
  const projects = 'projects' in state ? state.projects : [];
  const projectName = projects.find((project) => project.projectId === itemProjectId)?.name;
  function returnToItemContext(): void {
    if (itemProjectId && itemProjectId !== activeProjectId) setActiveProject(itemProjectId);
  }

  useEffect(() => onSubscribeHistory(featureId), [featureId, onSubscribeHistory]);
  useEffect(() => { setSpecDraft(feature?.description ?? ''); }, [feature?.description]);

  const specDirty = specDraft !== (feature?.description ?? '');
  const specPreviewSource = specDirty ? specDraft : (feature?.description ?? '');

  useEffect(() => {
    if (!typeChange.pendingRequestId) return;
    const result = actionResults[typeChange.pendingRequestId];
    if (!result || handledTypeChangeResults.current.has(typeChange.pendingRequestId)) return;
    handledTypeChangeResults.current.add(typeChange.pendingRequestId);
    if (result.payload.ok && 'preview' in result.payload && 'stages' in result.payload.preview) {
      const { preview } = result.payload;
      setTypeChange((current) => ({
        ...current,
        pendingRequestId: undefined,
        preview: { stages: preview.stages, templateId: preview.templateId, templateVersion: preview.templateVersion },
        error: undefined,
      }));
    } else if (result.payload.ok && 'workItem' in result.payload) {
      setTypeChange({});
    } else {
      setTypeChange((current) => ({
        ...current,
        pendingRequestId: undefined,
        error: 'error' in result.payload ? result.payload.error.message : 'Work Item type change was not acknowledged.',
      }));
    }
  }, [actionResults, typeChange.pendingRequestId]);

  function requestTypePreview(toType: MsqWorkItemType): void {
    if (!feature) return;
    const id = typeChangeRequestId();
    setTypeChange({ pendingRequestId: id, proposedType: toType, preview: undefined, error: undefined });
    send({ type: 'action:changeWorkItemType', requestId: id, workItemId: featureId, workItemType: toType, expectedRevision: feature.revision, preview: true });
  }

  function confirmTypeChange(): void {
    if (!feature || !typeChange.proposedType) return;
    const id = typeChangeRequestId();
    setTypeChange((current) => ({ ...current, pendingRequestId: id, error: undefined }));
    send({ type: 'action:changeWorkItemType', requestId: id, workItemId: featureId, workItemType: typeChange.proposedType, expectedRevision: feature.revision });
  }

  function cancelTypeChange(): void {
    setTypeChange({});
  }

  if (!feature) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader
          title={featureId}
          breadcrumb={
            <a href="#/board" style={{ color: 'var(--text-dim)' }}>
              Board
            </a>
          }
        />
        <div style={{ padding: 28, color: 'var(--text-dim)' }}>No backlog item found for {featureId}.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={feature.title}
        breadcrumb={breadcrumb ?? (
          <span>
            <a href="#/board" onClick={returnToItemContext} style={{ color: 'var(--text-dim)' }}>
              Board
            </a>{' '}
            / {projectName ? `${projectName} · ` : ''}{feature.repoLabel ? `${feature.repoLabel} · ` : ''}{featureId} · not started yet
          </span>
        )}
        actions={
          <>
            <WorkItemActions
              id={feature.persistedId ?? featureId}
              name={feature.title}
              revision={feature.revision}
              allowed={state.lifecycle?.[`work_item:${feature.persistedId ?? featureId}`]}
              eligibility={eligibility}
              pill={pillStatus(activeRun ?? {})}
              pipelineId={activeRun?.pipelineId}
              send={send}
              actionResults={actionResults}
              onStart={() => { onStart(featureId); }}
              startLabel="start feature"
              startTitle="Start feature"
            />
            <Button variant="neutral" size="sm" onClick={() => { returnToItemContext(); onBack(); }}>
              close
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <section style={{ marginBottom: 20, padding: 16, border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span title={`type: ${feature.workItemType}`} style={{ display: 'inline-block', padding: '2px 6px', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{feature.workItemType}</span>
            {feature.templateId && (
              <span title={`workflow template: ${feature.templateId}${feature.templateVersion != null ? ` v${String(feature.templateVersion)}` : ''}`} style={{ display: 'inline-block', padding: '2px 6px', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>
                {feature.templateId}{feature.templateVersion != null && ` v${String(feature.templateVersion)}`}
              </span>
            )}
            {!typeChange.proposedType && (
              hasRunHistory ? (
                <span title="This Work Item has run history — its type is locked." style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  type locked (has run history)
                </span>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['feature', 'bug'] as const).filter((candidate) => candidate !== feature.workItemType).map((candidate) => (
                    <Button key={candidate} variant="neutral" size="sm" onClick={() => { requestTypePreview(candidate); }}>
                      change to {candidate}
                    </Button>
                  ))}
                </div>
              )
            )}
          </div>
          {typeChange.proposedType && (
            <div style={{ marginBottom: 12, padding: 12, border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunken)' }}>
              <div style={{ marginBottom: 8, color: 'var(--text-primary)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                Change type: {feature.workItemType} → {typeChange.proposedType}
              </div>
              {typeChange.error && <div role="alert" style={{ marginBottom: 8, color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>{typeChange.error}</div>}
              {typeChange.preview && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
                    New template: {typeChange.preview.templateId} v{typeChange.preview.templateVersion}
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 2 }}>current workflow</div>
                    <WorkflowStepper stages={feature.workflow.stages} currentStage={null} allPending size="compact" />
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 2 }}>new workflow</div>
                    <WorkflowStepper stages={typeChange.preview.stages} currentStage={null} allPending size="compact" />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button variant="primary" size="sm" disabled={!typeChange.preview || Boolean(typeChange.pendingRequestId)} onClick={confirmTypeChange}>
                  {typeChange.pendingRequestId ? 'applying…' : 'confirm change'}
                </Button>
                <Button variant="neutral" size="sm" disabled={Boolean(typeChange.pendingRequestId) && !typeChange.preview} onClick={cancelTypeChange}>
                  cancel
                </Button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Specification</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>{feature.specFile ?? 'Stored in the backlog catalog'}</div>
            </div>
            <Button variant="primary" size="sm" disabled={!specDirty} onClick={() => { onSaveConfig(featureId, { spec: specDraft }); }}>
              save spec
            </Button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Tabs
              tabs={[
                { id: 'edit', label: 'Edit' },
                { id: 'preview', label: 'Preview' },
              ]}
              activeId={specView}
              onSelect={(id) => { setSpecView(id as 'edit' | 'preview'); }}
            />
          </div>
          {specView === 'edit' ? (
            <textarea
              aria-label="Feature specification"
              value={specDraft}
              onChange={(event) => { setSpecDraft(event.target.value); }}
              placeholder="Write the feature specification in markdown…"
              style={{ width: '100%', minHeight: 280, boxSizing: 'border-box', resize: 'vertical', background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 1.5, padding: 12 }}
            />
          ) : (
            <div
              data-testid="spec-preview"
              style={{ width: '100%', minHeight: 280, boxSizing: 'border-box', background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', padding: 14, overflow: 'auto' }}
            >
              <MarkdownView
                source={specPreviewSource}
                emptyFallback="Nothing to preview yet — switch to Edit to draft the spec."
              />
              {specDirty && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-dim)', color: 'var(--text-warn, var(--accent-warn))', fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
                  previewing unsaved changes
                </div>
              )}
            </div>
          )}
        </section>
        <FeatureConfigDetail
          feature={feature}
          backlogSettings={state.backlogSettings}
          approvalChannels={state.runtimeConfig.notifications.channels.map((channel) => channel.type)}
          toolIds={state.runtimeConfig.tools.map((tool) => tool.id)}
          onSaveConfig={(patch) => { onSaveConfig(featureId, patch); }}
          workflowSaveResult={workflowSaveResult}
          doneFeatureIds={doneFeatureIds}
          failedFeatureIds={failedFeatureIds}
        />
      </div>
    </div>
  );
}
