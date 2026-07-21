import React, { useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { DependencyTag } from '../components/FeatureConfigDetail.js';
import { LifecycleActions } from '../components/LifecycleActions.js';
import { WorkflowStepper } from '../components/navigation/WorkflowStepper.js';
import { ProgressBar } from '../components/data/ProgressBar.js';
import { PageHeader } from '../PageHeader.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 8;

export function EpicDetailPage({ state, projectId, epicId, send, actionResults, onBack, onOpenBacklogItem }: {
  state: MsqWebState;
  projectId: string;
  epicId: string;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  onBack: () => void;
  onOpenBacklogItem: (featureId: string) => void;
}): React.JSX.Element {
  const project = state.projects.find((item) => item.projectId === projectId);
  const epic = state.epics.find((item) => item.epicId === epicId && item.projectId === projectId && item.archivedAt === null);
  const [page, setPage] = useState(0);

  const items = useMemo(
    () => Object.values(state.featureCatalog).filter((item) => item.epicId === epicId),
    [epicId, state.featureCatalog],
  );
  const doneFeatureIds = useMemo(() => new Set(state.runs.filter((run) => run.status === 'done').map((run) => run.featureId)), [state.runs]);
  const failedFeatureIds = useMemo(() => new Set(state.runs.filter((run) => run.status === 'failed').map((run) => run.featureId)), [state.runs]);

  if (!project || !epic) {
    return <div style={{ padding: 24 }}>
      <p>Epic not found or no longer active.</p>
      <Button onClick={onBack}>back to Project</Button>
    </div>;
  }

  const completed = items.filter((item) => doneFeatureIds.has(item.id)).length;
  const visible = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const repoCounts = new Map<string, number>();
  items.forEach((item) => repoCounts.set(item.repoLabel ?? 'unresolved', (repoCounts.get(item.repoLabel ?? 'unresolved') ?? 0) + 1));

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <PageHeader
      title={epic.title}
      breadcrumb={[
        { label: 'Projects', href: '/projects' },
        { label: project.name, href: `/projects/${projectId}` },
      ]}
      actions={<LifecycleActions
        kind="epic"
        id={epic.epicId}
        name={epic.title}
        revision={epic.revision}
        allowed={state.lifecycle?.[`epic:${epic.epicId}`]}
        send={send}
        actionResults={actionResults}
      />}
    />
    <main style={{ overflow: 'auto', padding: 20, display: 'grid', gap: 16 }}>
      <Card>
        {epic.description && <p style={muted}>{epic.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <ProgressBar
              percent={items.length ? (completed / items.length) * 100 : 0}
              tone="ok"
              label={`derived progress: ${String(completed)}/${String(items.length)}`}
            />
          </div>
          <StatusPill status={epic.status === 'done' ? 'done' : epic.status === 'in_progress' ? 'running' : 'aborted'} label={`manual: ${epic.status}`} spinner={false} />
        </div>
        <div style={tags}>{[...repoCounts].map(([label, count]) => <Tag key={label}>{label}: {count}</Tag>)}</div>
      </Card>
      <section>
        <h2 style={heading}>Work Items</h2>
        {items.length === 0 && <Card><p style={muted}>No Work Items in this Epic yet.</p></Card>}
        {visible.map((item) => {
          const run = state.runs.find((candidate) => candidate.featureId === item.id);
          return <div
            key={item.id}
            role="link"
            tabIndex={0}
            aria-label={item.title}
            onClick={() => { onOpenBacklogItem(item.id); }}
            onKeyDown={(event) => { if (event.key === 'Enter') onOpenBacklogItem(item.id); }}
            style={rowStyle}
            onFocus={(event) => { event.currentTarget.style.outline = '1px solid var(--accent-info)'; }}
            onBlur={(event) => { event.currentTarget.style.outline = 'none'; }}
          >
            <strong>{item.title}</strong>
            <div style={tags}>
              <Tag>{item.workItemType}</Tag>
              <Tag>{item.repoLabel ?? 'unresolved repo'}</Tag>
              <StatusPill status={run?.status ?? 'aborted'} label={run?.status ?? 'not started'} spinner={false} />
              {item.dependsOn.map((dependency) => <DependencyTag key={dependency} depId={dependency} doneFeatureIds={doneFeatureIds} failedFeatureIds={failedFeatureIds} />)}
            </div>
            {item.workflow.stages.length > 0 && <div style={{ marginTop: 8 }}>
              <WorkflowStepper stages={item.workflow.stages} currentStage={null} allPending size="compact" />
            </div>}
            {item.integrityIssue && <p role="alert" style={{ color: 'var(--accent-warn)', margin: '8px 0 0' }}>{item.integrityIssue}</p>}
          </div>;
        })}
        {items.length > PAGE_SIZE && <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <Button size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); }}>previous</Button>
          <Button size="sm" disabled={(page + 1) * PAGE_SIZE >= items.length} onClick={() => { setPage(page + 1); }}>next</Button>
        </div>}
      </section>
    </main>
  </div>;
}

const heading: React.CSSProperties = { margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 400 };
const muted: React.CSSProperties = { color: 'var(--text-dim)', margin: '4px 0' };
const tags: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 };
const rowStyle: React.CSSProperties = {
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-panel)',
  padding: 12,
  marginBottom: 10,
  cursor: 'pointer',
};
