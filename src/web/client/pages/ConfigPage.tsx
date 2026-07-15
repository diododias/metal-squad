import React, { useMemo, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs.js';
import { Tag } from '../components/core/Tag.js';
import { PageHeader } from '../PageHeader.js';
import type { MsqWebState, WebSocketClientMessage } from '../../types.js';

export interface ConfigPageProps {
  state: MsqWebState;
  isMobile: boolean;
  send: (message: WebSocketClientMessage) => void;
}

const SUB_TABS = [
  { id: 'runtime', label: 'Runtime' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'skills', label: 'Skills' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'budget', label: 'Budget' },
];

const SOURCE_TONE: Record<string, string> = {
  repo: 'var(--accent-info)',
  global: 'var(--text-dim)',
  backlog: 'var(--accent-warn)',
  feature: 'var(--text-primary)',
};

function SourceTag({ source }: { source: string }): React.JSX.Element {
  return <span style={{ fontSize: 'var(--text-2xs)', color: SOURCE_TONE[source] ?? 'var(--text-dim)', marginLeft: 8 }}>[{source}]</span>;
}

function Row({ label, value, source }: { label: string; value: React.ReactNode; source?: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-dim)', fontSize: 'var(--text-sm)' }}>
      <span style={{ color: 'var(--text-dim)' }}>
        {label}
        {source && <SourceTag source={source} />}
      </span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', padding: 14 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>{title}</h3>
      {children}
    </div>
  );
}

function RuntimeTab({ state }: { state: MsqWebState }): React.JSX.Element {
  const c = state.runtimeConfig;
  const sources = state.backlogSettings.configSources;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Runtime">
        <Row label="concurrency" value={c.concurrency} source="global" />
        <Row label="toolTimeoutMs" value={c.toolTimeoutMs.toLocaleString()} source="global" />
        <Row label="staleRunThresholdMinutes" value={c.staleRunThresholdMinutes} source="global" />
        <Row label="promptContextCharLimit" value={c.promptContextCharLimit.toLocaleString()} source="global" />
        <Row label="workflow.autoAdvanceStages" value={c.workflow.autoAdvanceStages ? 'on' : 'off'} source="global" />
        <Row label="workflow.pollIntervalMs" value={c.workflow.pollIntervalMs} source="global" />
        <Row label="web.host" value={c.web.host} source="global" />
        <Row label="web.port" value={c.web.port} source="global" />
        <Row label="web.auth" value={c.web.auth} source="global" />
      </Card>
      <Card title="Resolved sources">
        <Row label="global config" value={sources?.globalConfigPath ?? '—'} />
        <Row label="repo config" value={sources?.repoConfigPath ?? 'not found'} />
        <Row label="backlog" value={sources?.backlogPath ?? '—'} />
      </Card>
    </div>
  );
}

function DefaultsTab({ state }: { state: MsqWebState }): React.JSX.Element {
  const defaults = state.backlogSettings.resolvedDefaults;
  return (
    <Card title="Effective defaults (resolved)">
      {defaults ? (
        <>
          <Row label="tool" value={defaults.tool} />
          <Row label="model" value={defaults.model ?? '—'} />
          <Row label="effort" value={defaults.effort} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-dim)' }}>skills</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {defaults.skills.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </div>
          </div>
          {Object.entries(defaults.stageSkills).map(([stage, skills]) => (
            <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 'var(--text-sm)' }}>
              <span style={{ color: 'var(--text-dim)' }}>stageSkills.{stage}</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {skills.map((s) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No resolved defaults available.</div>
      )}
    </Card>
  );
}

function SkillsTab({ state }: { state: MsqWebState }): React.JSX.Element {
  return (
    <Card title="Discovered skills (repo > global > external > builtin)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state.skillsCatalog.map((s) => (
          <div key={s.name} style={{ borderBottom: '1px solid var(--border-dim)', paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{s.name}</span>
              <Tag tone="accent">{s.source}</Tag>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>{s.metadata.description}</div>
          </div>
        ))}
        {state.skillsCatalog.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No skills discovered.</div>}
      </div>
    </Card>
  );
}

function NotificationsTab({ state }: { state: MsqWebState }): React.JSX.Element {
  const n = state.runtimeConfig.notifications;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Channels">
        {n.channels.length ? (
          n.channels.map((c, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-dim)', fontSize: 'var(--text-sm)' }}>
              <Tag>{c.type}</Tag>
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No channels configured.</div>
        )}
      </Card>
      <Card title="Events">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {n.events.map((e) => (
            <Tag key={e} tone="accent">
              {e}
            </Tag>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BudgetTab({ state }: { state: MsqWebState }): React.JSX.Element {
  const budget = state.backlogSettings.budget;
  const runtimeBudget = state.runtimeConfig.budget;
  return (
    <Card title="Budget">
      <Row label="maxTokens (backlog)" value={budget?.maxTokens?.toLocaleString() ?? '—'} source="backlog" />
      <Row label="perFeatureMaxTokens (backlog)" value={budget?.perFeatureMaxTokens?.toLocaleString() ?? '—'} source="backlog" />
      <Row label="alertAtPercent" value={`${String(runtimeBudget.alertAtPercent)}%`} source="global" />
      <Row label="lastResetDate" value={runtimeBudget.lastResetDate ?? '—'} source="global" />
    </Card>
  );
}

export function ConfigPage({ state }: ConfigPageProps): React.JSX.Element {
  const [tab, setTab] = useState('runtime');

  const content = useMemo(() => {
    switch (tab) {
      case 'runtime':
        return <RuntimeTab state={state} />;
      case 'defaults':
        return <DefaultsTab state={state} />;
      case 'skills':
        return <SkillsTab state={state} />;
      case 'notifications':
        return <NotificationsTab state={state} />;
      case 'budget':
        return <BudgetTab state={state} />;
      default:
        return null;
    }
  }, [tab, state]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader title="Config" breadcrumb="Runtime, defaults, skills, notifications and budget" />
      <div style={{ padding: '0 20px' }}>
        <Tabs tabs={SUB_TABS} activeId={tab} onSelect={setTab} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>{content}</div>
    </div>
  );
}
