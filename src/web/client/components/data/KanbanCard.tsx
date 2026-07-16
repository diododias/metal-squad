import React from 'react';
import { Card } from '../core/Card.js';
import { StatusPill, type PillStatus } from '../core/StatusPill.js';
import { WorkflowStepper } from '../navigation/WorkflowStepper.js';
import { formatTokens } from '../../lib/format.js';

/** Deterministic 8-hex-digit short id from a feature id string, so the same
 * feature always renders the same F-XXXXXXXX badge without a backend. */
export function toShortFeatureId(featureId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < featureId.length; i += 1) {
    hash ^= featureId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
  return `F-${hex}`;
}

export interface KanbanCardRun {
  featureId: string;
  persistedId?: string | null;
  title?: string | null;
  epicTitle?: string | null;
  status: PillStatus | (string & {});
  stage?: string | null;
  stages?: string[];
  tool?: string | null;
  model?: string | null;
  effort?: string | null;
  autoAdvance?: boolean;
  elapsed?: string | null;
  tokens?: number | null;
  tasksTotal?: number | null;
  tasksDone?: number | null;
  prUrl?: string | null;
  prNumber?: number | null;
}

export interface KanbanCardProps {
  run: KanbanCardRun;
  selected?: boolean;
  onClick?: () => void;
}

const mutedLineStyle: React.CSSProperties = {
  fontSize: 'var(--text-2xs)',
  color: 'var(--text-faint)',
  fontFamily: 'var(--font-mono)',
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function KanbanCard({ run, selected, onClick }: KanbanCardProps): React.JSX.Element {
  const tasksLabel = run.tasksTotal != null ? `${String(run.tasksDone ?? 0)}/${String(run.tasksTotal)} tasks` : null;
  const isDone = run.status === 'done';
  const displayId = run.persistedId ?? toShortFeatureId(run.featureId);
  const displayTitle = run.title?.trim();
  const toolLine = [run.tool, run.model, run.effort].filter(Boolean).join(' · ');

  return (
    <Card
      selected={selected}
      onClick={onClick}
      style={isDone ? { borderLeft: '3px solid var(--accent-ok)' } : undefined}
    >
      {/* Muted context line: epic title · feature id */}
      <div style={{ ...mutedLineStyle, marginBottom: 4 }}>
        {run.epicTitle ? `${run.epicTitle} · ${displayId}` : displayId}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
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
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
          {run.autoAdvance && (
            <span
              title="auto-advance"
              aria-label="Auto-advance enabled"
              style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}
            >
              ⏩ auto
            </span>
          )}
          <StatusPill status={run.status} />
        </div>
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
              variant="bar"
              allPending={run.status === 'todo'}
            />
          </div>
        )
      )}

      {toolLine && (
        <div style={{ ...mutedLineStyle, color: 'var(--text-dim)', marginBottom: 8 }}>{toolLine}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>
        {run.elapsed && <span>{run.elapsed}</span>}
        {run.tokens != null && <span>{formatTokens(run.tokens)} tok</span>}
        {tasksLabel && <span>{tasksLabel}</span>}
      </div>
    </Card>
  );
}
