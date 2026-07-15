import React, { useMemo, useState } from 'react';
import { MetricCard } from '../components/data/MetricCard.js';
import { BarList } from '../components/data/BarList.js';
import { FeatureIdentity } from '../components/data/FeatureIdentity.js';
import { TrendBars, type TrendPoint } from '../components/data/TrendBars.js';
import { PageHeader } from '../PageHeader.js';
import { formatTokens } from '../lib/format.js';
import type { MsqWebState } from '../../types.js';

export interface AnalyticsPageProps {
  state: MsqWebState;
}

type Period = 'day' | 'week' | 'month';
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 };

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', padding: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '20px', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>{title}</h3>
      {children}
    </div>
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function AnalyticsPage({ state }: AnalyticsPageProps): React.JSX.Element {
  const [period, setPeriod] = useState<Period>('week');

  const filteredRows = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - PERIOD_DAYS[period]);
    return state.dashboard.rows.filter((row) => new Date(row.startedAt) >= since);
  }, [state.dashboard.rows, period]);

  const totalTokens = filteredRows.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);
  const sessionCount = filteredRows.length;

  const trend: TrendPoint[] = useMemo(() => {
    const buckets = new Map<string, { tokens: number; sessions: number }>();
    for (const row of filteredRows) {
      const key = dayKey(row.startedAt);
      const bucket = buckets.get(key) ?? { tokens: 0, sessions: 0 };
      bucket.tokens += row.totalTokens ?? 0;
      bucket.sessions += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, v]) => ({ label: label.slice(5), value: v.tokens }));
  }, [filteredRows]);

  const sessionTrend: TrendPoint[] = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const row of filteredRows) {
      const key = dayKey(row.startedAt);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label: label.slice(5), value }));
  }, [filteredRows]);

  const byFeature = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of filteredRows) {
      totals.set(row.featureId, (totals.get(row.featureId) ?? 0) + (row.totalTokens ?? 0));
    }
    return [...totals.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([featureId, value]) => ({ id: featureId, label: <FeatureIdentity title={state.featureCatalog[featureId]?.title} id={featureId} />, value }));
  }, [filteredRows, state.featureCatalog]);

  const activeFeatures = state.runs.filter((r) => r.status === 'running' || r.status === 'blocked').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="Analytics"
        breadcrumb="Token consumption and session activity across all features"
        filters={
          <div style={{ display: 'flex', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: 'fit-content' }}>
            {(['day', 'week', 'month'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => { setPeriod(opt); }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  padding: '7px 14px',
                  border: 'none',
                  cursor: 'pointer',
                  background: period === opt ? 'var(--accent-info-10)' : 'transparent',
                  color: period === opt ? 'var(--accent-info)' : 'var(--text-dim)',
                  fontWeight: period === opt ? 600 : 400,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <MetricCard label={`Tokens (${period})`} value={formatTokens(totalTokens)} />
          <MetricCard label={`Sessions (${period})`} value={sessionCount} />
          <MetricCard label="Active features" value={activeFeatures} />
          <MetricCard label="Avg tokens / session" value={sessionCount ? formatTokens(Math.round(totalTokens / sessionCount)) : '—'} />
        </div>

        <Section title="Tokens & sessions over time">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            <div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 10 }}>Tokens</div>
              <TrendBars points={trend} valueFormatter={formatTokens} color="var(--accent-info)" />
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 10 }}>Sessions</div>
              <TrendBars points={sessionTrend} color="var(--accent-ok)" />
            </div>
          </div>
        </Section>

        <Section title="Tokens by feature">
          {byFeature.length ? <BarList items={byFeature} valueFormatter={formatTokens} /> : <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No data for this period.</div>}
        </Section>
      </div>
    </div>
  );
}
