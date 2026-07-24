import React, { useEffect, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { WorkItemActions } from '../components/WorkItemActions.js';
import { CreateWorkItemModal } from '../components/project/CreateWorkItemModal.js';
import { FeatureConfigDetail } from '../components/FeatureConfigDetail.js';
import { Tabs } from '../components/navigation/Tabs.js';
import { MarkdownView } from '../components/MarkdownView.js';
import { WorkItemTypeBadge } from '../components/data/WorkItemTypeBadge.js';
import { PageHeader, type PageHeaderProps } from '../PageHeader.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import { startEligibility } from '../lib/startEligibility.js';
import { pillStatus } from '../lib/pillStatus.js';
import type { MsqWebState, FeatureConfigPatch, FeatureConfigSaveResult, TaskConfigPatch, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';
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
  const [showClone, setShowClone] = useState(false);
  const doneFeatureIds = new Set(state.doneFeatureIds);
  const failedFeatureIds = new Set<string>();
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
        description={feature.description ?? undefined}
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
              onClone={() => { setShowClone(true); }}
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
            <WorkItemTypeBadge workItemType={feature.workItemType === 'bug' ? 'bug' : 'feature'} />
            {feature.templateId && (
              <span title={`workflow template: ${feature.templateId}${feature.templateVersion != null ? ` v${String(feature.templateVersion)}` : ''}`} style={{ display: 'inline-block', padding: '2px 6px', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>
                {feature.templateId}{feature.templateVersion != null && ` v${String(feature.templateVersion)}`}
              </span>
            )}
          </div>
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
      {feature.projectId && feature.epicId && feature.repoId && <CreateWorkItemModal
        open={showClone}
        projectId={feature.projectId}
        initialDraft={{
          title: `${feature.title} (copy)`, epicId: feature.epicId, repoId: feature.repoId,
          workItemType: feature.workItemType === 'bug' ? 'bug' : 'feature',
          description: feature.description, dependsOn: feature.dependsOn,
        }}
        state={state}
        send={send}
        actionResults={actionResults}
        onClose={() => { setShowClone(false); }}
      />}
    </div>
  );
}
