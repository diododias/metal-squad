import React, { useEffect, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { FeatureConfigDetail } from '../components/FeatureConfigDetail.js';
import { PageHeader } from '../PageHeader.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import type { MsqWebState, FeatureConfigPatch, FeatureConfigSaveResult, TaskConfigPatch } from '../../types.js';
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
}

export function BacklogItemDetail({
  state,
  featureId,
  runHistories,
  onSubscribeHistory,
  onBack,
  onStart,
  onSaveConfig,
  workflowSaveResult,
}: BacklogItemDetailProps): React.JSX.Element {
  const feature = state.featureCatalog[featureId];
  const [specDraft, setSpecDraft] = useState('');
  const doneFeatureIds = new Set(state.doneFeatureIds);
  const failedFeatureIds = new Set<string>();
  for (const run of state.runs) {
    if (run.status === 'failed') {
      failedFeatureIds.add(run.featureId);
    }
  }
  const blockedByDependencies = feature?.dependsOn.filter((dep) => !doneFeatureIds.has(dep)) ?? [];
  const repositories = 'repositories' in state ? state.repositories : [];
  const repoUnhealthy = repositories.find((repo) => repo.repoId === feature?.repoId)?.health === 'unavailable';
  const canStart = blockedByDependencies.length === 0 && !repoUnhealthy;
  const { activeProjectId, setActiveProject } = useActiveProject();
  const itemProjectId = feature?.projectId ?? null;
  const projects = 'projects' in state ? state.projects : [];
  const projectName = projects.find((project) => project.projectId === itemProjectId)?.name;
  function returnToItemContext(): void {
    if (itemProjectId && itemProjectId !== activeProjectId) setActiveProject(itemProjectId);
  }

  useEffect(() => onSubscribeHistory(featureId), [featureId, onSubscribeHistory]);
  useEffect(() => { setSpecDraft(feature?.description ?? ''); }, [feature?.description]);

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
        breadcrumb={
          <span>
            <a href="#/board" onClick={returnToItemContext} style={{ color: 'var(--text-dim)' }}>
              Board
            </a>{' '}
            / {projectName ? `${projectName} · ` : ''}{feature.repoLabel ? `${feature.repoLabel} · ` : ''}{featureId} · not started yet
          </span>
        }
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={!canStart}
              title={
                repoUnhealthy
                  ? 'Repository unavailable — cannot start.'
                  : blockedByDependencies.length > 0
                    ? `Pending dependencies: ${blockedByDependencies.join(', ')}`
                    : 'Start feature'
              }
              onClick={() => { onStart(featureId); }}
            >
              start feature
            </Button>
            <Button variant="neutral" size="sm" onClick={() => { returnToItemContext(); onBack(); }}>
              close
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <section style={{ marginBottom: 20, padding: 16, border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Specification</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>{feature.specFile ?? 'Stored in the backlog catalog'}</div>
            </div>
            <Button variant="primary" size="sm" disabled={specDraft === (feature.description ?? '')} onClick={() => { onSaveConfig(featureId, { spec: specDraft }); }}>
              save spec
            </Button>
          </div>
          <textarea
            aria-label="Feature specification"
            value={specDraft}
            onChange={(event) => { setSpecDraft(event.target.value); }}
            placeholder="Write the feature specification…"
            style={{ width: '100%', minHeight: 280, boxSizing: 'border-box', resize: 'vertical', background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 1.5, padding: 12 }}
          />
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
