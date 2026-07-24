import React from 'react';
import { Card } from '../core/Card.js';
import { StatusPill } from '../core/StatusPill.js';
import { WorkflowStepper } from '../navigation/WorkflowStepper.js';
import { formatTokens } from '../../lib/format.js';
import { pillStatus, type PillStatusInput } from '../../lib/pillStatus.js';
import { WorkItemActions } from '../WorkItemActions.js';
import { shortId } from '../../lib/entityId.js';
import { WorkItemTypeBadge } from './WorkItemTypeBadge.js';
import { useLiveElapsed } from '../../hooks/useLiveElapsed.js';
import type { StartEligibility } from '../../lib/startEligibility.js';
import type { AllowedLifecycle, WebSocketClientMessage, WebSocketServerMessage } from '../../../types.js';
import type { PipelineStatus } from '../../../../db/repo.js';

/** @deprecated Use shortId('work_item', id, type) for new entity displays. */
export function toShortFeatureId(featureId: string): string {
  return shortId('work_item', featureId);
}

/** Short display label for a model id (`claude-sonnet-4-5` → `sonnet-4-5`);
 * the full value stays available via the cell's hover title. */
export function toShortModelLabel(model: string): string {
  return model.replace(/^claude-/, '');
}

export interface KanbanCardRun {
  featureId: string;
  persistedId?: string | null;
  title?: string | null;
  epicTitle?: string | null;
  status: PillStatusInput['status'];
  pipelineStatus?: PipelineStatus | null;
  stage?: string | null;
  stages?: string[];
  tool?: string | null;
  model?: string | null;
  effort?: string | null;
  autoAdvance?: boolean;
  elapsed?: string | null;
  startedAt?: string | null;
  tokens?: number | null;
  wasteTokens?: number | null;
  tasksTotal?: number | null;
  tasksDone?: number | null;
  prUrl?: string | null;
  prNumber?: number | null;
  pipelineId?: number | null;
  repoLabel?: string | null;
  workItemType?: 'feature' | 'bug' | null;
  templateId?: string | null;
  templateVersion?: number | null;
  repoUnhealthy?: boolean;
}

export interface KanbanCardProps {
  run: KanbanCardRun;
  selected?: boolean;
  onClick?: () => void;
  /** Policy-permitted lifecycle actions for this Work Item (PRJ-18), computed
   * server-side. Omitted by surfaces that don't offer lifecycle from the card. */
  lifecycle?: {
    allowed: AllowedLifecycle | undefined;
    revision: number;
    send: (message: WebSocketClientMessage) => void;
    actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
    onRequestCancel?: () => void;
    eligibility: StartEligibility;
    onStart: () => void;
    /** Opens the shared creation modal with this completed Work Item's draft. */
    onClone?: () => void;
  };
}

const mutedTextStyle: React.CSSProperties = {
  fontSize: 'var(--text-2xs)',
  color: 'var(--text-faint)',
  fontFamily: 'var(--font-mono)',
  lineHeight: 1.3,
};

interface ToolRailCell {
  key: string;
  icon: string;
  label: string;
  title: string;
  color?: string;
}

function buildToolRailCells(run: KanbanCardRun): ToolRailCell[] {
  const cells: ToolRailCell[] = [];
  if (run.tool) cells.push({ key: 'tool', icon: '◷', label: run.tool, title: `tool: ${run.tool}` });
  if (run.model) cells.push({ key: 'model', icon: '⚙', label: toShortModelLabel(run.model), title: `model: ${run.model}` });
  if (run.effort) cells.push({ key: 'effort', icon: '▁▃▅', label: run.effort, title: `effort: ${run.effort}` });
  if (run.repoLabel) cells.push({ key: 'repo', icon: '⌂', label: run.repoLabel, title: `repository: ${run.repoLabel}` });
  if (run.autoAdvance) cells.push({ key: 'auto', icon: '≫', label: 'auto', title: 'auto-advance', color: 'var(--accent-ok)' });
  return cells;
}

export function KanbanCard({ run, selected, onClick, lifecycle }: KanbanCardProps): React.JSX.Element {
  const status = pillStatus(run);
  const isRunning = run.status === 'running';
  const liveElapsed = useLiveElapsed(run.startedAt ?? null, isRunning);
  const elapsedDisplay = isRunning && liveElapsed != null ? liveElapsed : (run.elapsed ?? null);
  const tasksLabel = run.tasksTotal != null ? `${String(run.tasksDone ?? 0)}/${String(run.tasksTotal)} tasks` : null;
  const isDone = status === 'done';
  const displayId = shortId('work_item', run.featureId, run.workItemType);
  const displayTitle = run.title?.trim();
  const railCells = buildToolRailCells(run);

  return (
    <Card
      selected={selected}
      onClick={onClick}
      style={isDone ? { borderLeft: '3px solid var(--accent-ok)' } : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: '1 1 0%', minWidth: 0, fontSize: 'var(--text-sm)' }}>
          {displayTitle && (
            <div
              style={{
                color: 'var(--text-primary)',
                fontWeight: 600,
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {displayTitle}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          <StatusPill status={status} />
        </div>
      </div>
      {(run.workItemType ?? run.templateId) && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {run.workItemType && <WorkItemTypeBadge workItemType={run.workItemType} />}
          {run.templateId && <span title={`workflow template: ${run.templateId}${run.templateVersion != null ? ` v${String(run.templateVersion)}` : ''}`} style={{ display: 'inline-block', padding: '2px 6px', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>{run.templateId}{run.templateVersion != null && ` v${String(run.templateVersion)}`}</span>}
        </div>
      )}
      {run.repoUnhealthy && <div title="Repository unavailable" style={{ marginBottom: 6, color: 'var(--accent-danger)', fontSize: 'var(--text-2xs)' }}>repository unavailable — cannot start</div>}

      {/* Muted context line below the title: epic truncates on its own line;
        * the feature id never truncates — it wraps to the line below whenever
        * the epic title leaves no room next to it. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 2, marginBottom: 6, ...mutedTextStyle }}>
        {run.epicTitle && (
          <span style={{ flexShrink: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {run.epicTitle}
          </span>
        )}
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{displayId}</span>
      </div>

      {isDone && run.prUrl ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <a
            href={run.prUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { e.stopPropagation(); }}
            style={{ fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-mono)', color: 'var(--accent-info)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            ↗ {run.prNumber != null ? `PR #${String(run.prNumber)}` : 'PR'}
          </a>
        </div>
      ) : (
        run.stages && run.stages.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <WorkflowStepper
              stages={run.stages}
              currentStage={isDone ? null : (run.stage ?? null)}
              completed={isDone}
              variant="bar"
              allPending={status === 'not_started'}
            />
          </div>
        )
      )}

      {/* Tool rail: tool / model / effort / auto as bordered icon cells;
        * hover shows the full value. */}
      {railCells.length > 0 && (
        <div
          style={{
            display: 'flex',
            maxWidth: '100%',
            width: 'fit-content',
            border: '1px solid var(--border-dim)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          {railCells.map((cell, i) => (
            <span
              key={cell.key}
              title={cell.title}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                fontSize: 'var(--text-2xs)',
                fontFamily: 'var(--font-mono)',
                color: cell.color ?? 'var(--text-dim)',
                borderLeft: i > 0 ? '1px solid var(--border-dim)' : 'none',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden="true">{cell.icon}</span>
              {cell.label}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>
        {elapsedDisplay && <span>{elapsedDisplay}</span>}
        {run.wasteTokens != null && run.wasteTokens > 0
          ? <span style={{ color: 'var(--accent-warn)' }}>{formatTokens(run.wasteTokens)} tok · WASTE</span>
          : run.tokens != null && <span>{formatTokens(run.tokens)} tok</span>}
        {tasksLabel && <span>{tasksLabel}</span>}
      </div>

      {lifecycle && (
        // The card itself is clickable; lifecycle controls must not navigate.
        <div onClick={(event) => { event.stopPropagation(); }}>
          <WorkItemActions
            id={run.persistedId ?? run.featureId}
            name={run.title?.trim() ?? run.featureId}
            revision={lifecycle.revision}
            allowed={lifecycle.allowed}
            eligibility={lifecycle.eligibility}
            pill={status}
            pipelineId={run.pipelineId ?? null}
            send={lifecycle.send}
            actionResults={lifecycle.actionResults}
            onRequestCancel={lifecycle.onRequestCancel}
            onStart={lifecycle.onStart}
            onClone={lifecycle.onClone}
          />
        </div>
      )}
    </Card>
  );
}
