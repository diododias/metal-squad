import React from 'react';
import { Card } from '../core/Card.js';
import { StatusPill, type PillStatus } from '../core/StatusPill.js';
import { Tag } from '../core/Tag.js';

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
  title?: string | null;
  status: PillStatus;
  stage?: string | null;
  tool?: string | null;
  model?: string | null;
  effort?: string | null;
  elapsed?: string | null;
  tokens?: number | null;
  tasksTotal?: number | null;
  tasksDone?: number | null;
}

export interface KanbanCardProps {
  run: KanbanCardRun;
  selected?: boolean;
  onClick?: () => void;
}

export function KanbanCard({ run, selected, onClick }: KanbanCardProps): React.JSX.Element {
  const tasksLabel = run.tasksTotal != null ? `${String(run.tasksDone ?? 0)}/${String(run.tasksTotal)} tasks` : null;

  return (
    <Card selected={selected} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flex: '1 1 0%',
            minWidth: 0,
          }}
        >
          {run.title ?? run.featureId}
        </div>
        <div style={{ flexShrink: 0 }}>
          <StatusPill status={run.status} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {toShortFeatureId(run.featureId)}
        </span>
        {run.stage && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--accent-info)' }}>→ {run.stage}</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {run.tool && <Tag>{run.tool}</Tag>}
        {run.model && <Tag>{run.model}</Tag>}
        {run.effort && <Tag tone="accent">{run.effort}</Tag>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>
        {run.elapsed && <span>{run.elapsed}</span>}
        {run.tokens != null && <span>{run.tokens.toLocaleString()} tok</span>}
        {tasksLabel && <span>{tasksLabel}</span>}
      </div>
    </Card>
  );
}
