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
import { formatPercent, formatTokens } from '../lib/format.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import { useAnalytics } from '../hooks/useAnalytics.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';
import type { AnalyticsInsight, AnalyticsRunDrilldownRow, AnalyticsTokenGroup, AnalyticsWorkItemRow } from '../../../db/analytics.js';

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
  const [search, setSearch] = useState('');
  const [selectedWorkItem, setSelectedWorkItem] = useState<AnalyticsWorkItemRow | null>(null);
  const {
    workItems: workItemsResult, breakdown: breakdownResult, runDrilldown: runDrilldownResult, exportResult,
    requestWorkItems, requestBreakdown, requestRunDrilldown, requestExport, onAnalyticsMessage,
  } = useAnalytics(send);

  const filters = useMemo(() => ({
    sinceDays: period, ...(allProjects ? {} : activeProjectId ? { projectId: activeProjectId } : {}),
    ...(epic ? { epicId: epic } : {}), ...(repository ? { repoId: repository } : {}), ...(workItem ? { workItemId: workItem } : {}),
    ...(tool ? { tool } : {}), ...(model ? { model } : {}), ...(stage ? { stage } : {}), ...(status ? { status } : {}), ...(quality ? { dataQuality: quality } : {}),
  }), [activeProjectId, allProjects, epic, model, period, quality, repository, stage, status, tool, workItem]);

  useEffect(() => { if (analyticsMessage) onAnalyticsMessage(analyticsMessage); }, [analyticsMessage, onAnalyticsMessage]);
  useEffect(() => { requestBreakdown(filters); }, [filters, requestBreakdown]);
  useEffect(() => { if (tab === 'work-items') requestWorkItems(filters, { limit: 50 }, { by: 'totalTokens', direction: 'desc' }); }, [filters, requestWorkItems, tab]);
  useEffect(() => { if (selectedWorkItem) requestRunDrilldown({ ...filters, workItemId: selectedWorkItem.workItemId }, { limit: 50 }); }, [filters, requestRunDrilldown, selectedWorkItem]);
  useEffect(() => {
    if (!exportResult?.ok) return;
    const href = URL.createObjectURL(new Blob([exportResult.content], { type: exportResult.format === 'json' ? 'application/json' : 'text/csv' }));
    const link = document.createElement('a'); link.href = href; link.download = exportResult.filename; link.click(); URL.revokeObjectURL(href);
  }, [exportResult]);

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

  const clearFilters = (): void => { setAllProjects(false); setEpic(''); setRepository(''); setWorkItem(''); setTool(''); setModel(''); setStage(''); setStatus(''); setQuality(''); setSearch(''); };
  const exportCurrentView = (format: 'csv' | 'json'): void => { requestExport(filters, format); };

  const trend: TrendPoint[] = (result?.timeSeries ?? []).map((bucket) => ({ label: bucket.bucket.slice(5), value: bucket.totalTokens }));
  const workItemColumns: TableColumn<AnalyticsWorkItemRow & { id: string }>[] = [
    { key: 'workItemId', label: 'Work Item', render: (row) => <strong>{row.workItemId}</strong> },
    { key: 'projectId', label: 'Project' }, { key: 'epicId', label: 'Epic' }, { key: 'repoId', label: 'Repo' },
    { key: 'totalTokens', label: 'Total', align: 'right', render: (row) => formatTokens(row.totalTokens) },
    { key: 'inputTokens', label: 'Input', align: 'right', render: (row) => formatTokens(row.inputTokens) },
    { key: 'cachedInputTokens', label: 'Cached', align: 'right', render: (row) => formatTokens(row.cachedInputTokens) },
    { key: 'outputTokens', label: 'Output', align: 'right', render: (row) => formatTokens(row.outputTokens) },
    { key: 'wasteTokens', label: 'Waste', align: 'right', render: (row) => formatTokens(row.wasteTokens) },
    { key: 'runs', label: 'Runs', align: 'right' },
    { key: 'confidence', label: 'Quality', render: (row) => <Tag tone={row.confidence === 'exact' ? 'accent' : 'default'}>{qualityLabel(row.confidence)}</Tag> },
  ];
  const filteredWorkItems = workItems.filter((row) => row.workItemId.toLowerCase().includes(search.toLowerCase()));

  const groupLabel = (group: AnalyticsTokenGroup, kind: 'tool' | 'model' | 'stage' | 'effort' | 'thinking'): React.JSX.Element => <span>
    <strong>{group.key}</strong><span style={muted}> · {formatTokens(group.totalTokens)} · {group.runs} runs · avg {formatTokens(Math.round(group.totalTokens / Math.max(group.runs, 1)))} · waste {formatTokens(group.wasteTokens)} · success {group.successRatePercent === null ? '—' : formatPercent(group.successRatePercent)}{kind === 'model' ? ` · ${qualityLabel(group.confidence)}` : ''}{kind === 'tool' && group.fallbackRuns > 0 ? ` · ${String(group.fallbackRuns)} fallback/retry` : ''}</span>
  </span>;

  const selectBreakdown = (kind: 'tool' | 'model' | 'stage', key: string): void => {
    if (kind === 'tool') setTool(key);
    if (kind === 'model') setModel(key);
    if (kind === 'stage') setStage(key);
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
      {result?.forecast && <Section title="Budget forecast"><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}><span>Burn rate / day</span><strong>{formatTokens(Math.round(result.forecast.tokensPerDay))}</strong><span>Burn rate / week</span><strong>{formatTokens(Math.round(result.forecast.tokensPerWeek))}</strong><span>Tokens / completed Work Item</span><strong>{result.forecast.tokensPerDoneWorkItem === null ? '—' : formatTokens(Math.round(result.forecast.tokensPerDoneWorkItem))}</strong><span>Budget</span><strong>{result.forecast.budgetLimitTokens === null ? 'No configured limit' : `${formatTokens(result.forecast.remainingTokens ?? 0)} remaining`}</strong><span>Forecast</span><strong>{result.forecast.status === 'exceeded' ? 'Budget exceeded' : result.forecast.estimatedDaysToLimit === null ? 'Unavailable' : `${String(result.forecast.estimatedDaysToLimit)} days to limit`}</strong><span>Cost</span><strong>Cost unavailable</strong></div></Section>}
      {comparePrevious && result?.comparison && <Section title="Compared with previous period"><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}><span>Total tokens</span><strong>{formatTokens(result.comparison.totalTokensDelta)}</strong><span>Avg / run</span><strong>{result.comparison.averageTokensPerRunDelta === null ? '—' : formatTokens(Math.round(result.comparison.averageTokensPerRunDelta))}</strong><span>Waste</span><strong>{formatTokens(result.comparison.wasteTokensDelta)}</strong><span>Success rate</span><strong>{result.comparison.successRatePercentDelta === null ? '—' : formatPercent(result.comparison.successRatePercentDelta)}</strong></div></Section>}
    </div>;
  }

  function WorkItems(): React.JSX.Element {
    const error = workItemsResult && !workItemsResult.ok ? workItemsResult.error : null;
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input aria-label="Search Work Item" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="Search Work Item…" style={{ padding: 8, background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)' }} /><span style={muted}>Sort: Tokens desc · server-side</span></div>
      {error ? <div role="alert" style={{ color: 'var(--accent-danger)' }}>Work Items could not load: {error.message}</div> : workItemsResult === null ? <LoadingState label="Loading Work Items…" /> : filteredWorkItems.length ? <div style={{ overflowX: 'auto' }}><Table columns={workItemColumns} rows={filteredWorkItems.map((row) => ({ ...row, id: row.workItemId }))} onRowClick={setSelectedWorkItem} /></div> : <EmptyState />}
      <span style={muted}>1–{filteredWorkItems.length} of {filteredWorkItems.length} · Work Items without tokens remain visible as — when returned by the query.</span>
    </div>;
  }

  function Breakdowns(): React.JSX.Element {
    const passiveCards = [['Project', groups.byProject], ['Epic', groups.byEpic], ['Status', groups.byStatus]] as const;
    const interactiveCards: [string, AnalyticsTokenGroup[], 'tool' | 'model' | 'stage'][] = [
      ['Tool', groups.byTool, 'tool' as const], ['Model', groups.byModel, 'model' as const], ['Stage', groups.byStage, 'stage' as const],
    ];
    const secondaryCards: [string, AnalyticsTokenGroup[], 'effort' | 'thinking'][] = [['Effort', groups.byEffort ?? [], 'effort'], ['Thinking', groups.byThinking ?? [], 'thinking']];
    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
      {interactiveCards.map(([label, values, kind]) => <Section key={label} title={`Tokens by ${label}`} action={<span style={muted}>Click to filter</span>}><BarList items={values.map((group) => ({ id: group.key, label: groupLabel(group, kind), value: group.totalTokens, ariaLabel: `Filter by ${label} ${group.key}`, onClick: (): void => { selectBreakdown(kind, group.key); } }))} valueFormatter={formatTokens} /></Section>)}
      {secondaryCards.filter(([, values]) => values.length > 0).map(([label, values, kind]) => <Section key={label} title={`${label} breakdown`}><BarList items={values.map((group) => ({ id: group.key, label: groupLabel(group, kind), value: group.totalTokens }))} valueFormatter={formatTokens} /></Section>)}
      {passiveCards.map(([label, values]) => <Section key={label} title={`Tokens by ${label}`}><BarList items={values.map((group) => ({ id: group.key, label: group.key, value: group.totalTokens }))} valueFormatter={formatTokens} /></Section>)}
    </div>;
  }

  function Insights(): React.JSX.Element {
    const findings = result?.insights ?? [];
    const investigate = (finding: AnalyticsInsight): void => {
      setWorkItem(finding.filters.workItemId ?? ''); setTool(finding.filters.tool ?? '');
      setModel(finding.filters.model ?? ''); setStatus(finding.filters.status ?? '');
      setTab(finding.kind === 'data_quality' ? 'quality' : 'work-items');
    };
    if (!findings.length) return <EmptyState />;
    return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>{findings.map((finding) => <button key={finding.id} onClick={() => { investigate(finding); }} style={{ ...sectionStyle, borderLeft: `3px solid ${finding.severity === 'critical' ? 'var(--accent-danger)' : 'var(--accent-warn)'}`, color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}><strong>{finding.title}</strong><p style={muted}>{finding.evidence}</p><p style={muted}>Observed {formatTokens(finding.observedTokens)}{finding.baselineTokens === null ? '' : ` · baseline ${formatTokens(finding.baselineTokens)}`}</p><span style={{ color: 'var(--accent-info)' }}>Investigate →</span></button>)}</div>;
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
    {selectedWorkItem && <aside role="dialog" aria-label={`Work Item ${selectedWorkItem.workItemId}`} style={{ position: 'fixed', inset: '60px 0 0 auto', width: 'min(520px, 100%)', overflow: 'auto', background: 'var(--bg-base)', borderLeft: '1px solid var(--border-strong)', padding: 20, boxShadow: '-8px 0 24px rgba(0,0,0,.25)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><h2 style={{ marginTop: 0 }}>Work Item {selectedWorkItem.workItemId}</h2><Button size="sm" onClick={() => { setSelectedWorkItem(null); }}>Close</Button></div><p style={muted}>Total {formatTokens(selectedWorkItem.totalTokens)} · Waste {formatTokens(selectedWorkItem.wasteTokens)} · {selectedWorkItem.runs} runs · context max {formatPercent(selectedWorkItem.contextMaxPercent)}</p><h3>Run timeline</h3>{runDrilldownResult === null ? <LoadingState label="Loading run detail…" /> : runs.length ? <ul style={{ paddingLeft: 18 }}>{runs.map((run: AnalyticsRunDrilldownRow) => <li key={run.runId} style={{ marginBottom: 9 }}><StatusPill status={run.status} spinner={false} /> #{run.runId} {run.tool}/{run.model ?? 'Unknown Model'} · {run.stage ?? '—'} · {formatTokens(run.totalTokens)} · context {formatPercent(run.contextWindowPercent)} {run.totalTokens === 0 && <em> No token telemetry captured</em>}</li>)}</ul> : <p style={muted}>No runs match this Work Item.</p>}<Button size="sm" onClick={() => { window.location.hash = `/runs/${selectedWorkItem.workItemId}`; }}>Open Run Detail</Button></aside>}
  </div>;
}
