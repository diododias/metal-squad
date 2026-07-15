import React, { useState } from 'react';
import { Table, type TableColumn } from '../components/data/Table.js';
import { FeatureIdentity } from '../components/data/FeatureIdentity.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { PageHeader } from '../PageHeader.js';
import { formatElapsed, formatPublishTarget, formatTokens, getPublishStatusLabel } from '../lib/format.js';
import type { MsqWebState } from '../../types.js';
import type { RunSummary } from '../../../db/repo.js';

export interface RunsPageProps {
  state: MsqWebState;
  onOpenRun: (featureId: string) => void;
}

type SortKey = 'startedAt' | 'totalTokens' | 'status';

export function RunsPage({ state, onOpenRun }: RunsPageProps): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('startedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = [...state.runs].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'totalTokens') return ((a.totalTokens ?? 0) - (b.totalTokens ?? 0)) * dir;
    return (a[sortKey] > b[sortKey] ? 1 : -1) * dir;
  });

  function sortBy(key: SortKey): void {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const columns: TableColumn<RunSummary>[] = [
    { key: 'featureId', label: 'Feature', render: (r) => <FeatureIdentity title={state.featureCatalog[r.featureId]?.title} id={r.featureId} /> },
    { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
    { key: 'tool', label: 'Tool', render: (r) => <Tag>{r.tool}</Tag> },
    { key: 'model', label: 'Model', render: (r) => state.featureCatalog[r.featureId]?.model ?? '—' },
    {
      key: 'publish',
      label: 'Publish',
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Tag tone={r.publishVerified ? 'accent' : 'default'}>{getPublishStatusLabel(r)}</Tag>
          <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>{formatPublishTarget(r)}</span>
        </div>
      ),
    },
    { key: 'totalTokens', label: 'Tokens', align: 'right', render: (r) => formatTokens(r.totalTokens) },
    { key: 'elapsed', label: 'Elapsed', align: 'right', render: (r) => formatElapsed(r.startedAt, r.endedAt) },
    { key: 'startedAt', label: 'Started', render: (r) => new Date(r.startedAt).toLocaleString() },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="Runs"
        filters={
          <div style={{ display: 'flex', gap: 6, fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>
            <span>sort:</span>
            {(['startedAt', 'totalTokens', 'status'] as const).map((k) => (
              <span
                key={k}
                onClick={() => { sortBy(k); }}
                style={{ cursor: 'pointer', color: sortKey === k ? 'var(--accent-info)' : 'var(--text-dim)', textTransform: 'uppercase' }}
              >
                {k}
                {sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </span>
            ))}
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px' }}>
        <div style={{ overflowX: 'auto' }}>
          <Table columns={columns} rows={rows.map((r) => ({ ...r, id: r.runId }))} onRowClick={(r) => { onOpenRun(r.featureId); }} />
        </div>
      </div>
    </div>
  );
}
