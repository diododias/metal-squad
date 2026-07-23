import React, { useEffect, useMemo, useState } from 'react';
import { MetricCard } from '../components/data/MetricCard.js';
import { BarList } from '../components/data/BarList.js';
import { TrendBars, type TrendPoint } from '../components/data/TrendBars.js';
import { Table, type TableColumn } from '../components/data/Table.js';
import { Button } from '../components/core/Button.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { Tabs } from '../components/navigation/Tabs.js';
import { PageHeader } from '../PageHeader.js';
import { formatDurationMs, formatPercent, formatTokens } from '../lib/format.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import { useAnalytics } from '../hooks/useAnalytics.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';
import type { AnalyticsRunDrilldownRow, AnalyticsSort, AnalyticsWorkItemRow } from '../../../db/analytics.js';

export interface AnalyticsPageProps {
  state: MsqWebState;
  send?: (message: WebSocketClientMessage) => void;
  analyticsMessage?: WebSocketServerMessage | null;
}

type AnalyticsTab = 'overview' | 'work-items' | 'breakdowns' | 'insights' | 'quality';
type Period = 7 | 30 | 90;

const TABS = [
  { id: 'overview', label: 'Overview' }, { id: 'work-items', label: 'Work Items' },
  { id: 'breakdowns', label: 'Breakdowns' }, { id: 'insights', label: 'Insights' },
  { id: 'quality', label: 'Data Quality' },
] as const;

const sectionStyle: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', padding: 16 };
const muted: React.CSSProperties = { color: 'var(--text-dim)', fontSize: 'var(--text-sm)' };
const noopAnalyticsSend = (): void => undefined;
const WORK_ITEM_PAGE_SIZE = 25;

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return <section style={sectionStyle} aria-label={title}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 400 }}>{title}</h2>{action}
    </div>{children}
  </section>;
}

function EmptyState(): React.JSX.Element {
  return <div style={{ ...sectionStyle, textAlign: 'center', padding: 28 }}><strong>No token usage for this filter.</strong><p style={muted}>Clear filters, expand the period, or show all projects.</p></div>;
}

function LoadingState({ label = 'Updating analytics…' }: { label?: string }): React.JSX.Element {
  return <div aria-live="polite" style={{ ...muted, display: 'flex', alignItems: 'center', gap: 7 }}><span className="msq-status-spinner" />{label}</div>;
}

function qualityLabel(confidence: 'exact' | 'derived' | 'unknown'): string { return confidence === 'exact' ? 'exact' : confidence === 'derived' ? 'derived' : 'unknown'; }

function eventLabel(event: string): string {
  const labels: Record<string, string> = {
    retry: 'Retry', blocked_resumed: 'Resume', resume_override: 'Resume override', gate_wait: 'Gate wait',
    'timeout:approval-created': 'Timeout', 'timeout:approval-resolved': 'Timeout resolved', blocked: 'Blocked',
    failed: 'Failed', publish_failure: 'Publish failure',
  };
  return labels[event] ?? event;
}

export function WorkItemDrilldownDrawer({
  workItem, runs, loading, onClose,
}: {
  workItem: AnalyticsWorkItemRow;
  runs: AnalyticsRunDrilldownRow[];
  loading: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const pipelines = new Map<string, AnalyticsRunDrilldownRow[]>();
  for (const run of runs) {
    const key = run.pipelineId === null ? `run-${String(run.runId)}` : `pipeline-${String(run.pipelineId)}`;
    const grouped = pipelines.get(key) ?? [];
    grouped.push(run);
    pipelines.set(key, grouped);
  }
  return <aside role="dialog" aria-label={`Work Item ${workItem.workItemId}`} style={{ position: 'fixed', inset: '60px 0 0 auto', width: 'min(620px, 100%)', overflow: 'auto', background: 'var(--bg-base)', borderLeft: '1px solid var(--border-strong)', padding: 20, boxShadow: '-8px 0 24px rgba(0,0,0,.25)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><h2 style={{ marginTop: 0 }}>Work Item {workItem.workItemId}</h2><Button size="sm" onClick={onClose}>Close</Button></div>
    <p style={muted}>Total {formatTokens(workItem.totalTokens)} · Useful {formatTokens(Math.max(0, workItem.totalTokens - workItem.wasteTokens))} · Waste {formatTokens(workItem.wasteTokens)} · {workItem.runs} runs · context max {formatPercent(workItem.contextMaxPercent)}</p>
    <h3>Run timeline</h3>
    {loading ? <LoadingState label="Loading run detail…" /> : runs.length === 0 ? <p style={muted}>No runs match this Work Item.</p> : [...pipelines.entries()].map(([key, pipelineRuns]) => <section key={key} style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 10, marginTop: 10 }}>
      <h4 style={{ margin: '0 0 8px' }}>{pipelineRuns[0]?.pipelineId === null ? 'Standalone run' : `Pipeline #${String(pipelineRuns[0]?.pipelineId)}`}</h4>
      {pipelineRuns.map((run) => <article key={run.runId} style={{ padding: '8px 0', borderTop: '1px solid var(--border-dim)' }}>
        <div><StatusPill status={run.status} spinner={false} /> <strong>Run #{run.runId}</strong> · {run.stage ?? 'No stage'} · {run.tool}/{run.model ?? 'Unknown Model'}</div>
        <div style={muted}>Started {new Date(run.startedAt).toLocaleString()} · {run.endedAt ? `duration ${formatDurationMs(run.durationMs)}` : 'Still running — completion time pending'} · context {formatPercent(run.contextWindowPercent)}</div>
        {!run.hasTokenTelemetry ? <p style={{ ...muted, margin: '5px 0' }}><em>No token telemetry captured</em></p> : <p style={{ ...muted, margin: '5px 0' }}>Total {formatTokens(run.totalTokens)} · Useful {formatTokens(run.usefulTokens)} · Waste {formatTokens(run.wasteTokens)}</p>}
        {run.summary && <p style={{ ...muted, margin: '5px 0' }}>Output summary: {run.summary}</p>}
        {run.retries.length > 0 && <div style={muted}>Attempts: {run.retries.map((retry) => `#${String(retry.attempt)} ${retry.tool ?? run.tool}/${retry.model ?? run.model ?? 'Unknown Model'}`).join(', ')}</div>}
        {run.tasks.length > 0 && <details><summary>Task token breakdown ({String(run.tasks.length)})</summary><ul style={{ ...muted, paddingLeft: 18 }}>{run.tasks.map((task) => <li key={task.taskId}>{task.title} · {task.stage ?? '—'} · {task.status} · {formatTokens(task.totalTokens)} · context {formatPercent(task.contextWindowPercent)}</li>)}</ul></details>}
        {run.events.length > 0 && <div style={{ ...muted, marginTop: 5 }}>Events: {run.events.map((event) => eventLabel(event.event)).join(' · ')}</div>}
      </article>)}
    </section>)}
    <a href={`#/runs/${workItem.workItemId}`} style={{ display: 'inline-block', marginTop: 14, color: 'var(--accent-info)' }}>Open Run Detail</a>
  </aside>;
}

export function AnalyticsPage({ state, send = noopAnalyticsSend, analyticsMessage = null }: AnalyticsPageProps): React.JSX.Element {
  const { activeProjectId } = useActiveProject();
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [period, setPeriod] = useState<Period>(30);
  const [allProjects, setAllProjects] = useState(false);
  const [comparePrevious, setComparePrevious] = useState(true);
  const [epic, setEpic] = useState('');
  const [repository, setRepository] = useState('');
  const [workItem, setWorkItem] = useState('');
  const [tool, setTool] = useState('');
  const [model, setModel] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [quality, setQuality] = useState<'exact' | 'derived' | 'unknown' | ''>('');
  const [workItemPage, setWorkItemPage] = useState(0);
  const [workItemSort, setWorkItemSort] = useState<Required<AnalyticsSort>>({ by: 'totalTokens', direction: 'desc' });
  const [selectedWorkItem, setSelectedWorkItem] = useState<AnalyticsWorkItemRow | null>(null);
  const {
    workItems: workItemsResult, breakdown: breakdownResult, runDrilldown: runDrilldownResult,
    requestWorkItems, requestBreakdown, requestRunDrilldown, onAnalyticsMessage,
  } = useAnalytics(send);

  const filters = useMemo(() => ({
    sinceDays: period, ...(allProjects ? {} : activeProjectId ? { projectId: activeProjectId } : {}),
    ...(epic ? { epicId: epic } : {}), ...(repository ? { repoId: repository } : {}), ...(workItem ? { workItemId: workItem } : {}),
    ...(tool ? { tool } : {}), ...(model ? { model } : {}), ...(stage ? { stage } : {}), ...(status ? { status } : {}), ...(quality ? { dataQuality: quality } : {}),
  }), [activeProjectId, allProjects, epic, model, period, quality, repository, stage, status, tool, workItem]);

  useEffect(() => { if (analyticsMessage) onAnalyticsMessage(analyticsMessage); }, [analyticsMessage, onAnalyticsMessage]);
  useEffect(() => { requestBreakdown(filters); }, [filters, requestBreakdown]);
  useEffect(() => { setWorkItemPage(0); }, [filters]);
  useEffect(() => { if (tab === 'work-items') requestWorkItems(filters, { limit: WORK_ITEM_PAGE_SIZE, offset: workItemPage * WORK_ITEM_PAGE_SIZE }, workItemSort); }, [filters, requestWorkItems, tab, workItemPage, workItemSort]);
  useEffect(() => { if (selectedWorkItem) requestRunDrilldown({ ...filters, workItemId: selectedWorkItem.workItemId }, { limit: 50 }); }, [filters, requestRunDrilldown, selectedWorkItem]);

  const result = breakdownResult?.ok ? breakdownResult : null;
  const summary = result?.summary ?? state.analytics.summary;
  const groups = result?.groups ?? state.analytics.topGroups;
  const dataQuality = result?.dataQuality ?? state.analytics.dataQuality;
  const workItems = workItemsResult?.ok ? workItemsResult.rows : [];
  const runs = runDrilldownResult?.ok ? runDrilldownResult.rows : [];
  const activeChips = [
    !allProjects && activeProjectId ? `Project: ${state.projects.find((project) => project.projectId === activeProjectId)?.name ?? activeProjectId}` : allProjects ? 'All projects' : '',
    epic && `Epic: ${epic}`, repository && `Repository: ${repository}`, workItem && `Work Item: ${workItem}`,
    tool && `Tool: ${tool}`, model && `Model: ${model}`, stage && `Stage: ${stage}`, status && `Status: ${status}`, quality && `Quality: ${quality}`,
  ].filter((chip): chip is string => Boolean(chip));
  const isPartial = dataQuality.derivedRuns > 0 || dataQuality.unknownRuns > 0 || dataQuality.missingTokenRuns > 0;

  const clearFilters = (): void => { setAllProjects(false); setEpic(''); setRepository(''); setWorkItem(''); setTool(''); setModel(''); setStage(''); setStatus(''); setQuality(''); };
  const exportCurrentView = (format: 'csv' | 'json'): void => {
    const payload = { filters, period, generatedAt: new Date().toISOString(), schemaVersion: 1, totals: summary, dataQuality, rows: tab === 'work-items' ? workItems : groups.byWorkItem };
    const content = format === 'json' ? JSON.stringify(payload, null, 2) : ['workItemId,totalTokens,wasteTokens,runs,dataQuality', ...workItems.map((row) => `${row.workItemId},${String(row.totalTokens)},${String(row.wasteTokens)},${String(row.runs)},${row.confidence}`)].join('\n');
    const href = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }));
    const link = document.createElement('a'); link.href = href; link.download = `analytics-${tab}.${format}`; link.click(); URL.revokeObjectURL(href);
  };

  const trend: TrendPoint[] = (result?.timeSeries ?? []).map((bucket) => ({ label: bucket.bucket.slice(5), value: bucket.totalTokens }));
  const workItemColumns: TableColumn<AnalyticsWorkItemRow & { id: string }>[] = [
    { key: 'projectId', label: 'Project' }, { key: 'epicId', label: 'Epic' }, { key: 'repoId', label: 'Repository' },
    { key: 'workItemId', label: 'Work Item', sortable: true, render: (row): React.JSX.Element => { const catalogItem = state.featureCatalog[row.workItemId]; return <><strong>{row.workItemId}</strong><br /><span style={muted}>{catalogItem ? `${catalogItem.title} · ${catalogItem.workItemType}` : 'unknown'}</span></>; } },
    { key: 'derivedStatus', label: 'Status', render: (row) => <span>{row.derivedStatus === 'unknown/unscoped' ? 'unknown' : row.derivedStatus}<br /><span style={muted}>{`${String(row.doneRuns)} done · ${String(row.failedRuns)} failed · ${String(row.blockedRuns)} blocked · ${String(row.abortedRuns)} aborted`}</span></span> },
    { key: 'totalTokens', label: 'Total', sortable: true, align: 'right', render: (row) => formatTokens(row.totalTokens) },
    { key: 'inputTokens', label: 'Input', sortable: true, align: 'right', render: (row) => formatTokens(row.inputTokens) },
    { key: 'cachedInputTokens', label: 'Cached', sortable: true, align: 'right', render: (row) => formatTokens(row.cachedInputTokens) },
    { key: 'outputTokens', label: 'Output', sortable: true, align: 'right', render: (row) => formatTokens(row.outputTokens) },
    { key: 'runs', label: 'Runs', sortable: true, align: 'right' }, { key: 'wasteTokens', label: 'Waste', sortable: true, align: 'right', render: (row) => formatTokens(row.wasteTokens) },
    { key: 'lastRunAt', label: 'Last run', sortable: true, render: (row) => row.lastRunAt ? new Date(row.lastRunAt).toLocaleDateString() : '—' },
    { key: 'dominantTool', label: 'Tool / model', render: (row) => `${row.dominantTool === 'unknown/unscoped' ? 'unknown' : row.dominantTool} / ${row.dominantModel === 'unknown/unscoped' ? 'unknown' : row.dominantModel}` },
    { key: 'contextMaxPercent', label: 'Context max', sortable: true, align: 'right', render: (row) => formatPercent(row.contextMaxPercent) },
    { key: 'confidence', label: 'Quality', render: (row) => <Tag tone={row.confidence === 'exact' ? 'accent' : 'default'}>{qualityLabel(row.confidence)}</Tag> },
  ];

  const setServerSort = (key: string): void => {
    const by = key as AnalyticsSort['by'];
    if (!by) return;
    setWorkItemSort((current) => ({ by, direction: current.by === by && current.direction === 'desc' ? 'asc' : 'desc' }));
    setWorkItemPage(0);
  };

  function Overview(): React.JSX.Element {
    if (summary.runs === 0 && !breakdownResult) return <EmptyState />;
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <MetricCard label="Total tokens" value={formatTokens(summary.totalTokens)} />
        <MetricCard label="Useful tokens" value={formatTokens(Math.max(0, summary.totalTokens - summary.wasteTokens))} />
        <MetricCard label="Waste" value={`${formatTokens(summary.wasteTokens)} (${summary.totalTokens ? formatPercent((summary.wasteTokens / summary.totalTokens) * 100) : '—'})`} />
        <MetricCard label="Avg / run" value={summary.runs ? formatTokens(Math.round(summary.totalTokens / summary.runs)) : '—'} />
        <MetricCard label="Context P95" value={formatPercent(summary.contextP95Percent)} />
      </div>
      {isPartial && <div role="status" style={{ borderLeft: '3px solid var(--accent-warn)', background: 'var(--accent-warn-10)', padding: '9px 12px', ...muted }}>Some historical runs are classified as unknown or derived. Charts remain useful, but model/project comparisons may be partial.</div>}
      <Section title="Tokens over time" action={breakdownResult && !result ? <LoadingState /> : undefined}>
        {trend.length ? <><TrendBars points={trend} valueFormatter={formatTokens} /><p style={muted}>Text equivalent: {trend.map((point) => `${point.label} ${formatTokens(point.value)}`).join(', ')}</p></> : <p style={muted}>Trend will populate when the selected period has telemetry.</p>}
      </Section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
        <Section title="Top consumers"><BarList items={groups.byWorkItem.map((group) => ({ id: group.key, label: group.key, value: group.totalTokens }))} valueFormatter={formatTokens} /></Section>
        <Section title="Token breakdown"><dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}><dt>Input</dt><dd>{formatTokens(summary.inputTokens)}</dd><dt>Cached input</dt><dd>{formatTokens(summary.cachedInputTokens)}</dd><dt>Output</dt><dd>{formatTokens(summary.outputTokens)}</dd></dl></Section>
      </div>
    </div>;
  }

  function WorkItems(): React.JSX.Element {
    const error = workItemsResult && !workItemsResult.ok ? workItemsResult.error : null;
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={muted}>Select a column heading to sort the complete ledger on the server.</span>
      {error ? <div role="alert" style={{ color: 'var(--accent-danger)' }}>Work Items could not load: {error.message}</div> : workItemsResult === null ? <LoadingState label="Loading Work Items…" /> : workItems.length ? <div style={{ overflowX: 'auto' }}><Table columns={workItemColumns} rows={workItems.map((row) => ({ ...row, id: row.workItemId }))} onRowClick={setSelectedWorkItem} sort={{ key: workItemSort.by, direction: workItemSort.direction }} onSort={setServerSort} /></div> : <EmptyState />}
      {workItemsResult?.ok && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><span style={muted}>{workItemsResult.total ? `${String(workItemPage * WORK_ITEM_PAGE_SIZE + 1)}–${String(Math.min((workItemPage + 1) * WORK_ITEM_PAGE_SIZE, workItemsResult.total))} of ${String(workItemsResult.total)}` : '0 Work Items'} · Work Items without tokens remain visible as —.</span><span style={{ display: 'flex', gap: 6 }}><Button size="sm" disabled={workItemPage === 0} onClick={() => { setWorkItemPage((page) => Math.max(0, page - 1)); }}>Previous</Button><Button size="sm" disabled={(workItemPage + 1) * WORK_ITEM_PAGE_SIZE >= workItemsResult.total} onClick={() => { setWorkItemPage((page) => page + 1); }}>Next</Button></span></div>}
    </div>;
  }

  function Breakdowns(): React.JSX.Element {
    const cards = [['Project', groups.byProject], ['Epic', groups.byEpic], ['Tool', groups.byTool], ['Model', groups.byModel], ['Stage', groups.byStage], ['Status', groups.byStatus]] as const;
    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>{cards.map(([label, values]) => <Section key={label} title={`Tokens by ${label}`}><BarList items={values.map((group) => ({ id: group.key, label: group.key, value: group.totalTokens }))} valueFormatter={formatTokens} /></Section>)}</div>;
  }

  function Insights(): React.JSX.Element {
    const findings = [
      { title: 'Waste summary', value: `${formatTokens(summary.wasteTokens)} across failed, blocked, and aborted runs.`, tab: 'work-items' as const },
      { title: 'Outliers', value: summary.contextMaxPercent ? `Context reached ${formatPercent(summary.contextMaxPercent)} at maximum.` : 'No context telemetry captured.', tab: 'breakdowns' as const },
      { title: 'Data confidence', value: `${String(dataQuality.unknownRuns)} runs are unknown and ${String(dataQuality.derivedRuns)} are derived.`, tab: 'quality' as const },
    ];
    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>{findings.map((finding) => <button key={finding.title} onClick={() => { setTab(finding.tab); }} style={{ ...sectionStyle, color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}><strong>{finding.title}</strong><p style={muted}>{finding.value}</p><span style={{ color: 'var(--accent-info)' }}>Investigate →</span></button>)}</div>;
  }

  function Quality(): React.JSX.Element {
    const issues = [['Runs without project snapshot', dataQuality.missingProjectSnapshotRuns], ['Runs without token telemetry', dataQuality.missingTokenRuns], ['Unknown rows', dataQuality.unknownRuns], ['Derived rows', dataQuality.derivedRuns]];
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}><MetricCard label="Valid rows" value={dataQuality.exactRuns} /><MetricCard label="Derived rows" value={dataQuality.derivedRuns} /><MetricCard label="Unknown rows" value={dataQuality.unknownRuns} /><MetricCard label="No telemetry" value={dataQuality.missingTokenRuns} /></div><Section title="Issues"><ul style={{ margin: 0, paddingLeft: 20 }}>{issues.map(([label, count]) => <li key={label} style={{ marginBottom: 8 }}><button onClick={() => { setQuality(count === dataQuality.derivedRuns ? 'derived' : 'unknown'); setTab('work-items'); }} style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent-info)', cursor: 'pointer' }}>{label}: {count}</button></li>)}</ul></Section></div>;
  }

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <PageHeader title="Analytics" description="Token consumption, efficiency and operational waste" actions={<div style={{ display: 'flex', gap: 6 }}><Button size="sm" onClick={() => { exportCurrentView('csv'); }}>Export CSV</Button><Button size="sm" onClick={() => { exportCurrentView('json'); }}>Export JSON</Button></div>} filters={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><label>Period <select value={period} onChange={(event) => { setPeriod(Number(event.target.value) as Period); }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><label><input type="checkbox" checked={comparePrevious} onChange={(event) => { setComparePrevious(event.target.checked); }} /> Compare previous period</label><label><input type="checkbox" checked={allProjects} onChange={(event) => { setAllProjects(event.target.checked); }} /> All projects</label><label>Epic <input value={epic} onChange={(event) => { setEpic(event.target.value); }} placeholder="any" /></label><label>Repository <input value={repository} onChange={(event) => { setRepository(event.target.value); }} placeholder="any" /></label><label>Work Item <input value={workItem} onChange={(event) => { setWorkItem(event.target.value); }} placeholder="any" /></label><label>Tool <input value={tool} onChange={(event) => { setTool(event.target.value); }} placeholder="any" /></label><label>Model <input value={model} onChange={(event) => { setModel(event.target.value); }} placeholder="any" /></label><label>Stage <input value={stage} onChange={(event) => { setStage(event.target.value); }} placeholder="any" /></label><label>Status <input value={status} onChange={(event) => { setStatus(event.target.value); }} placeholder="any" /></label><label>Quality <select value={quality} onChange={(event) => { setQuality(event.target.value as typeof quality); }}><option value="">all</option><option value="exact">exact</option><option value="derived">derived</option><option value="unknown">unknown</option></select></label></div>
      <div aria-label="Active filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{activeChips.map((chip) => <Tag key={chip}>{chip} ×</Tag>)}{activeChips.length > 0 && <button onClick={clearFilters} style={{ background: 'none', border: 0, color: 'var(--accent-info)', cursor: 'pointer' }}>Clear all</button>}</div>
    </div>} />
    <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Tabs tabs={[...TABS]} activeId={tab} onSelect={(id) => { setTab(id as AnalyticsTab); }} />
      {tab === 'overview' && <Overview />}{tab === 'work-items' && <WorkItems />}{tab === 'breakdowns' && <Breakdowns />}{tab === 'insights' && <Insights />}{tab === 'quality' && <Quality />}
    </div>
    {selectedWorkItem && <WorkItemDrilldownDrawer workItem={selectedWorkItem} runs={runs} loading={runDrilldownResult === null} onClose={() => { setSelectedWorkItem(null); }} />}
  </div>;
}
