import React, { useEffect } from 'react';
import { Button } from '../components/core/Button.js';
import { FeatureConfigDetail } from '../components/FeatureConfigDetail.js';
import { PageHeader } from '../PageHeader.js';
import type { MsqWebState, FeatureConfigPatch, TaskConfigPatch } from '../../types.js';
import type { RunHistoryEntry } from '../../../db/repo.js';

export interface BacklogItemDetailProps {
  state: MsqWebState;
  featureId: string;
  runHistories: Record<string, RunHistoryEntry[]>;
  onSubscribeHistory: (featureId: string) => () => void;
  onBack: () => void;
  onStart: (featureId: string) => void;
  onSaveConfig: (featureId: string, patch: FeatureConfigPatch) => void;
  onSaveTaskConfig: (featureId: string, taskId: string, patch: TaskConfigPatch) => void;
  onOpenRun: (featureId: string) => void;
}

export function BacklogItemDetail({
  state,
  featureId,
  onSubscribeHistory,
  onBack,
  onStart,
  onSaveConfig,
}: BacklogItemDetailProps): React.JSX.Element {
  const feature = state.featureCatalog[featureId];
  const blockedByDependencies = feature?.pendingDependencies ?? [];
  const canStart = blockedByDependencies.length === 0;

  useEffect(() => onSubscribeHistory(featureId), [featureId, onSubscribeHistory]);

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
            <a href="#/board" style={{ color: 'var(--text-dim)' }}>
              Board
            </a>{' '}
            / {featureId} · not started yet
          </span>
        }
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={!canStart}
              title={!canStart ? `Pending dependencies: ${blockedByDependencies.join(', ')}` : 'Start feature'}
              onClick={() => { onStart(featureId); }}
            >
              start feature
            </Button>
            <Button variant="neutral" size="sm" onClick={onBack}>
              close
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <FeatureConfigDetail feature={feature} backlogSettings={state.backlogSettings} onSaveConfig={(patch) => { onSaveConfig(featureId, patch); }} />
      </div>
    </div>
  );
}
