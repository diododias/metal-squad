import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { EditableSelectField } from '../components/core/EditableSelectField.js';
import { EditableTextField } from '../components/core/EditableTextField.js';
import { EditableToggleField } from '../components/core/EditableToggleField.js';
import { Tabs } from '../components/navigation/Tabs.js';
import { Tag } from '../components/core/Tag.js';
import { PageHeader } from '../PageHeader.js';
import type { AppConfigPatch, MsqWebState, ProjectDefaultsPatch, WebSocketClientMessage } from '../../types.js';
import type { ToolRegistryEntry } from '../../../config/index.js';

export interface ConfigPageProps {
  state: MsqWebState;
  isMobile: boolean;
  send: (message: WebSocketClientMessage) => void;
}

const SUB_TABS = [
  { id: 'runtime', label: 'Runtime' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'tools', label: 'Tools' },
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

interface RuntimeDraft {
  concurrency: string;
  toolTimeoutMs: string;
  heartbeatMs: string;
  staleRunThresholdMinutes: string;
  promptContextCharLimit: string;
  webHost: string;
  webPort: string;
  webAuth: 'token' | 'none';
}

function runtimeDraftFrom(config: MsqWebState['runtimeConfig']): RuntimeDraft {
  return {
    concurrency: String(config.concurrency),
    toolTimeoutMs: String(config.toolTimeoutMs),
    heartbeatMs: String(config.heartbeatMs),
    staleRunThresholdMinutes: String(config.staleRunThresholdMinutes),
    promptContextCharLimit: String(config.promptContextCharLimit),
    webHost: config.web.host,
    webPort: String(config.web.port),
    webAuth: config.web.auth,
  };
}

function positiveWholeNumber(value: string, max?: number): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && (max === undefined || number <= max) ? number : undefined;
}

function RuntimeTab({ state, send }: { state: MsqWebState; send: ConfigPageProps['send'] }): React.JSX.Element {
  const c = state.runtimeConfig;
  const sources = state.backlogSettings.configSources;
  const environment = state.environment;
  const secretsStatus = c.web.auth === 'token' ? 'configured' : 'empty';
  const baseline = useMemo(() => runtimeDraftFrom(c), [c]);
  const [draft, setDraft] = useState<RuntimeDraft>(baseline);
  const writable = c.writability.configWritable;

  useEffect(() => {
    setDraft(baseline);
  }, [baseline]);

  const concurrency = positiveWholeNumber(draft.concurrency);
  const toolTimeoutMs = positiveWholeNumber(draft.toolTimeoutMs);
  const heartbeatMs = positiveWholeNumber(draft.heartbeatMs);
  const staleRunThresholdMinutes = positiveWholeNumber(draft.staleRunThresholdMinutes);
  const promptContextCharLimit = positiveWholeNumber(draft.promptContextCharLimit);
  const webPort = positiveWholeNumber(draft.webPort, 65_535);
  const isValid = concurrency !== undefined
    && toolTimeoutMs !== undefined
    && heartbeatMs !== undefined
    && staleRunThresholdMinutes !== undefined
    && promptContextCharLimit !== undefined
    && webPort !== undefined
    && draft.webHost.trim().length > 0;
  const patch: AppConfigPatch = {};
  if (concurrency !== undefined && draft.concurrency !== baseline.concurrency) patch.concurrency = concurrency;
  if (toolTimeoutMs !== undefined && draft.toolTimeoutMs !== baseline.toolTimeoutMs) patch.toolTimeoutMs = toolTimeoutMs;
  if (heartbeatMs !== undefined && draft.heartbeatMs !== baseline.heartbeatMs) patch.heartbeatMs = heartbeatMs;
  if (staleRunThresholdMinutes !== undefined && draft.staleRunThresholdMinutes !== baseline.staleRunThresholdMinutes) patch.staleRunThresholdMinutes = staleRunThresholdMinutes;
  if (promptContextCharLimit !== undefined && draft.promptContextCharLimit !== baseline.promptContextCharLimit) patch.promptContextCharLimit = promptContextCharLimit;
  if (draft.webHost.trim() && draft.webHost !== baseline.webHost) patch.web = { ...patch.web, host: draft.webHost.trim() };
  if (webPort !== undefined && draft.webPort !== baseline.webPort) patch.web = { ...patch.web, port: webPort };
  if (draft.webAuth !== baseline.webAuth) patch.web = { ...patch.web, auth: draft.webAuth };
  const canSave = writable && isValid && Object.keys(patch).length > 0;

  function updateField<Key extends keyof RuntimeDraft>(key: Key, value: RuntimeDraft[Key]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save(): void {
    if (canSave) send({ type: 'action:updateAppConfig', patch });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Runtime">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <EditableTextField id="runtime-concurrency" label="concurrency" value={draft.concurrency} initialValue={baseline.concurrency} disabled={!writable} onChange={(value) => { updateField('concurrency', value); }} />
          <EditableTextField id="runtime-tool-timeout" label="toolTimeoutMs" value={draft.toolTimeoutMs} initialValue={baseline.toolTimeoutMs} disabled={!writable} onChange={(value) => { updateField('toolTimeoutMs', value); }} />
          <EditableTextField id="runtime-heartbeat" label="heartbeatMs" value={draft.heartbeatMs} initialValue={baseline.heartbeatMs} disabled={!writable} onChange={(value) => { updateField('heartbeatMs', value); }} />
          <EditableTextField id="runtime-stale-threshold" label="staleRunThresholdMinutes" value={draft.staleRunThresholdMinutes} initialValue={baseline.staleRunThresholdMinutes} disabled={!writable} onChange={(value) => { updateField('staleRunThresholdMinutes', value); }} />
          <EditableTextField id="runtime-prompt-limit" label="promptContextCharLimit" value={draft.promptContextCharLimit} initialValue={baseline.promptContextCharLimit} disabled={!writable} onChange={(value) => { updateField('promptContextCharLimit', value); }} />
          <EditableTextField id="runtime-web-host" label="web.host" value={draft.webHost} initialValue={baseline.webHost} disabled={!writable} onChange={(value) => { updateField('webHost', value); }} />
          <EditableTextField id="runtime-web-port" label="web.port" value={draft.webPort} initialValue={baseline.webPort} disabled={!writable} onChange={(value) => { updateField('webPort', value); }} />
          <EditableSelectField id="runtime-web-auth" label="web.auth" value={draft.webAuth} initialValue={baseline.webAuth} disabled={!writable} options={[{ value: 'token', label: 'token' }, { value: 'none', label: 'none' }]} onChange={(value) => { updateField('webAuth', value === 'none' ? 'none' : 'token'); }} />
          {!writable && <span style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>config.json is read-only; runtime settings cannot be changed.</span>}
          {!isValid && <span style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>Enter positive whole numbers; web.port must be between 1 and 65535.</span>}
          <div><Button variant="primary" size="sm" onClick={save} disabled={!canSave}>save runtime</Button></div>
        </div>
      </Card>
      <Card title="Environment / Sources">
        <Row label="global config" value={sources?.globalConfigPath ?? '—'} />
        <Row label="repo config" value={sources?.repoConfigPath ?? 'not found'} />
        <Row label="backlog" value={sources?.backlogPath ?? '—'} />
        <Row
          label="database"
          value={`${environment.databasePath} · ${environment.dbWritable ? 'writable' : 'read-only'}`}
          source={environment.databaseSource}
        />
        <Row label="data dir" value={environment.dataDir} />
        <Row
          label="config dir"
          value={`${environment.configDir} · ${environment.configWritable ? 'writable' : 'read-only'}`}
        />
        <Row
          label="repo"
          value={environment.repoPath ? `${environment.repoPath} · ${environment.repoId ?? 'unknown'}` : 'not found'}
        />
        <Row label="catalog" value="DB (importado via backlog load)" />
        <Row label="web" value={`${c.web.host}:${String(c.web.port)} · ${c.web.auth}`} />
        <Row label="secrets" value={secretsStatus} />
        <Row label="version" value={environment.version ?? '—'} />
      </Card>
    </div>
  );
}

interface DefaultsDraft {
  tool: string;
  model: string;
  effort: string;
  thinking: string;
  skills: string;
  stageSkills: Record<string, string>;
  workflowMode: string;
  workflowStages: string;
  syncTasksToBacklog: boolean;
  approvalChannel: string;
  autoAdvance: boolean;
  maxTokens: string;
}

function defaultsDraftFrom(defaults: NonNullable<MsqWebState['backlogSettings']['projectDefaults']>): DefaultsDraft {
  return {
    tool: defaults.tool,
    model: defaults.model ?? '',
    effort: defaults.effort,
    thinking: defaults.thinking,
    skills: defaults.skills.join(', '),
    stageSkills: Object.fromEntries(Object.entries(defaults.stageSkills).map(([stage, skills]) => [stage, skills.join(', ')])),
    workflowMode: defaults.workflow.mode,
    workflowStages: defaults.workflow.stages.join(', '),
    syncTasksToBacklog: defaults.workflow.syncTasksToBacklog,
    approvalChannel: defaults.workflow.approvals.channel,
    autoAdvance: defaults.workflow.approvals.autoAdvance,
    maxTokens: defaults.maxTokens?.toString() ?? '',
  };
}

function csvList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function DefaultsTab({ state, send }: { state: MsqWebState; send: ConfigPageProps['send'] }): React.JSX.Element {
  const defaults = state.backlogSettings.projectDefaults;
  const baseline = useMemo(() => defaultsDraftFrom(defaults), [defaults]);
  const [draft, setDraft] = useState<DefaultsDraft>(baseline);
  const capabilities = state.backlogSettings.toolCapabilities?.[draft.tool] ?? { model: true, effort: true, thinking: true };

  useEffect(() => {
    setDraft(baseline);
  }, [baseline]);

  const stages = csvList(draft.workflowStages);
  const stageOrderIsValid = stages.length > 0 && new Set(stages).size === stages.length;
  const maxTokens = draft.maxTokens === '' ? undefined : Number(draft.maxTokens);
  const maxTokensIsValid = maxTokens === undefined || (Number.isInteger(maxTokens) && maxTokens > 0);
  const thinkingWarning = draft.thinking === 'on' && !capabilities.thinking
    ? `${draft.tool} does not support thinking; it will be ignored.`
    : undefined;
  const guidance = !stageOrderIsValid
    ? 'Workflow stages must contain at least one unique stage.'
    : !maxTokensIsValid
      ? 'Enter a positive whole number for maxTokens.'
      : undefined;
  const stageSkills = Object.fromEntries(
    Object.entries(draft.stageSkills).map(([stage, skills]) => [stage, csvList(skills)]),
  );
  const patch: ProjectDefaultsPatch = {};
  if (draft.tool !== baseline.tool) patch.tool = draft.tool;
  if (draft.model !== baseline.model && draft.model.trim()) patch.model = draft.model.trim();
  if (draft.effort !== baseline.effort) patch.effort = draft.effort;
  if (draft.thinking !== baseline.thinking) patch.thinking = draft.thinking;
  if (!sameJson(csvList(draft.skills), csvList(baseline.skills))) patch.skills = csvList(draft.skills);
  if (!sameJson(stageSkills, Object.fromEntries(Object.entries(baseline.stageSkills).map(([stage, skills]) => [stage, csvList(skills)])))) {
    patch.stageSkills = stageSkills;
  }
  const workflowPatch: NonNullable<ProjectDefaultsPatch['workflow']> = {};
  if (draft.workflowMode !== baseline.workflowMode) workflowPatch.mode = draft.workflowMode;
  if (!sameJson(stages, csvList(baseline.workflowStages))) workflowPatch.stages = stages;
  if (draft.syncTasksToBacklog !== baseline.syncTasksToBacklog) workflowPatch.syncTasksToBacklog = draft.syncTasksToBacklog;
  if (draft.approvalChannel !== baseline.approvalChannel || draft.autoAdvance !== baseline.autoAdvance) {
    workflowPatch.approvals = {};
    if (draft.approvalChannel !== baseline.approvalChannel) workflowPatch.approvals.channel = draft.approvalChannel;
    if (draft.autoAdvance !== baseline.autoAdvance) workflowPatch.approvals.autoAdvance = draft.autoAdvance;
  }
  if (Object.keys(workflowPatch).length > 0) patch.workflow = workflowPatch;
  if (draft.maxTokens !== baseline.maxTokens && maxTokens !== undefined && maxTokensIsValid) patch.maxTokens = maxTokens;

  const canSave = Object.keys(patch).length > 0 && guidance === undefined;
  function save(): void {
    if (canSave) send({ type: 'action:updateProjectDefaults', patch });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Project defaults">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <EditableSelectField
            id="defaults-tool"
            label="tool"
            value={draft.tool}
            initialValue={baseline.tool}
            options={state.runtimeConfig.tools.map((tool) => ({ value: tool.id, label: tool.id }))}
            onChange={(tool) => { setDraft((current) => ({ ...current, tool: tool ?? '' })); }}
          />
          <EditableTextField
            id="defaults-model"
            label="model"
            value={draft.model}
            initialValue={baseline.model}
            placeholder="default model"
            onChange={(model) => { setDraft((current) => ({ ...current, model })); }}
          />
          <EditableSelectField
            id="defaults-effort"
            label="effort"
            value={draft.effort}
            initialValue={baseline.effort}
            options={['low', 'medium', 'high'].map((effort) => ({ value: effort, label: effort }))}
            onChange={(effort) => { setDraft((current) => ({ ...current, effort: effort ?? '' })); }}
          />
          <EditableSelectField
            id="defaults-thinking"
            label="thinking"
            value={draft.thinking}
            initialValue={baseline.thinking}
            options={[{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }]}
            onChange={(thinking) => { setDraft((current) => ({ ...current, thinking: thinking ?? 'off' })); }}
          />
          {thinkingWarning && <span style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>{thinkingWarning}</span>}
          <EditableTextField
            id="defaults-skills"
            label="skills (comma-separated)"
            value={draft.skills}
            initialValue={baseline.skills}
            placeholder="skill-a, skill-b"
            onChange={(skills) => { setDraft((current) => ({ ...current, skills })); }}
          />
          <EditableTextField
            id="defaults-max-tokens"
            label="maxTokens"
            value={draft.maxTokens}
            initialValue={baseline.maxTokens}
            placeholder="optional positive whole number"
            onChange={(maxTokens) => { setDraft((current) => ({ ...current, maxTokens })); }}
          />
        </div>
      </Card>

      <Card title="Workflow defaults">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <EditableSelectField
            id="defaults-workflow-mode"
            label="workflow.mode"
            value={draft.workflowMode}
            initialValue={baseline.workflowMode}
            options={[{ value: 'single', label: 'single' }, { value: 'staged', label: 'staged' }]}
            onChange={(mode) => { setDraft((current) => ({ ...current, workflowMode: mode ?? '' })); }}
          />
          <EditableTextField
            id="defaults-workflow-stages"
            label="workflow.stages (comma-separated)"
            value={draft.workflowStages}
            initialValue={baseline.workflowStages}
            onChange={(workflowStages) => { setDraft((current) => ({ ...current, workflowStages })); }}
          />
          {stages.map((stage) => (
            <EditableTextField
              key={stage}
              id={`defaults-stage-skills-${stage}`}
              label={`stageSkills.${stage} (comma-separated)`}
              value={draft.stageSkills[stage] ?? ''}
              initialValue={baseline.stageSkills[stage] ?? ''}
              placeholder="stage skill-a, stage skill-b"
              onChange={(skills) => { setDraft((current) => ({ ...current, stageSkills: { ...current.stageSkills, [stage]: skills } })); }}
            />
          ))}
          <EditableToggleField
            id="defaults-workflow-sync"
            label="workflow.syncTasksToBacklog"
            value={draft.syncTasksToBacklog}
            initialValue={baseline.syncTasksToBacklog}
            onChange={(syncTasksToBacklog) => { setDraft((current) => ({ ...current, syncTasksToBacklog })); }}
          />
          <EditableSelectField
            id="defaults-workflow-approval-channel"
            label="workflow.approvals.channel"
            value={draft.approvalChannel}
            initialValue={baseline.approvalChannel}
            options={[{ value: 'telegram', label: 'telegram' }]}
            onChange={(approvalChannel) => { setDraft((current) => ({ ...current, approvalChannel: approvalChannel ?? '' })); }}
          />
          <EditableToggleField
            id="defaults-workflow-auto-advance"
            label="workflow.approvals.autoAdvance"
            value={draft.autoAdvance}
            initialValue={baseline.autoAdvance}
            onChange={(autoAdvance) => { setDraft((current) => ({ ...current, autoAdvance })); }}
          />
          {guidance && <span style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>{guidance}</span>}
          <div><Button variant="primary" size="sm" onClick={save} disabled={!canSave}>save defaults</Button></div>
        </div>
      </Card>
    </div>
  );
}

function emptyTool(): ToolRegistryEntry {
  return {
    id: '', adapter: 'claude', command: '', baseArgs: [], env: {}, versionCheck: ['--version'],
    capabilities: { model: true, effort: true, thinking: true },
    thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 0,
  };
}

function listFromCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

type ToolDraft = ToolRegistryEntry & {
  capabilities: { model: boolean; effort: boolean; thinking: boolean };
  thinkingBudget: { low: number; medium: number; high: number };
};

function ToolEditor({ tool, idReadOnly = false, onSave, onCancel }: { tool: ToolRegistryEntry; idReadOnly?: boolean; onSave: (tool: ToolRegistryEntry) => void; onCancel: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState<ToolDraft>({
    ...tool,
    capabilities: tool.capabilities ?? { model: true, effort: true, thinking: true },
    thinkingBudget: tool.thinkingBudget ?? { low: 0, medium: 0, high: 0 },
  });
  const [baseArgs, setBaseArgs] = useState(tool.baseArgs.join(', '));
  const [versionCheck, setVersionCheck] = useState(tool.versionCheck.join(', '));
  const [env, setEnv] = useState(JSON.stringify(tool.env));
  const [issue, setIssue] = useState<string | null>(null);

  function save(): void {
    let parsedEnv: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(env);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some((value) => typeof value !== 'string')) throw new Error();
      parsedEnv = parsed as Record<string, string>;
    } catch {
      setIssue('env must be a JSON object with string values.');
      return;
    }
    if (!draft.id.trim() || !draft.command.trim()) {
      setIssue('id and command are required.');
      return;
    }
    onSave({ ...draft, id: draft.id.trim(), command: draft.command.trim(), baseArgs: listFromCsv(baseArgs), versionCheck: listFromCsv(versionCheck), env: parsedEnv });
  }

  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '6px 8px', fontFamily: 'var(--font-mono)' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      <label>id<input aria-label="Tool id" readOnly={idReadOnly} style={input} value={draft.id} onChange={(event) => { setDraft({ ...draft, id: event.target.value }); }} /></label>
      <label>adapter<select aria-label="Tool adapter" style={input} value={draft.adapter} onChange={(event) => { setDraft({ ...draft, adapter: event.target.value as ToolRegistryEntry['adapter'] }); }}><option value="claude">claude</option><option value="codex">codex</option><option value="opencode">opencode</option></select></label>
      <label>command<input aria-label="Tool command" style={input} value={draft.command} onChange={(event) => { setDraft({ ...draft, command: event.target.value }); }} /></label>
      <label>baseArgs (comma-separated)<input aria-label="Tool base arguments" style={input} value={baseArgs} onChange={(event) => { setBaseArgs(event.target.value); }} /></label>
      <label>versionCheck (comma-separated)<input aria-label="Tool version check" style={input} value={versionCheck} onChange={(event) => { setVersionCheck(event.target.value); }} /></label>
      <label>minTimeoutMs<input aria-label="Tool minimum timeout" type="number" min="0" style={input} value={draft.minTimeoutMs} onChange={(event) => { setDraft({ ...draft, minTimeoutMs: Number(event.target.value) }); }} /></label>
      <label style={{ gridColumn: '1 / -1' }}>env (JSON)<input aria-label="Tool environment" style={input} value={env} onChange={(event) => { setEnv(event.target.value); }} /></label>
      {(['model', 'effort', 'thinking'] as const).map((key) => <label key={key}><input type="checkbox" checked={draft.capabilities[key]} onChange={(event) => { setDraft({ ...draft, capabilities: { ...draft.capabilities, [key]: event.target.checked } }); }} /> supports {key}</label>)}
      {(['low', 'medium', 'high'] as const).map((key) => <label key={key}>thinking {key}<input aria-label={`Tool thinking ${key}`} type="number" min="0" style={input} value={draft.thinkingBudget[key]} onChange={(event) => { setDraft({ ...draft, thinkingBudget: { ...draft.thinkingBudget, [key]: Number(event.target.value) } }); }} /></label>)}
      {issue && <span style={{ gridColumn: '1 / -1', color: 'var(--accent-warn)' }}>{issue}</span>}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}><Button variant="primary" size="sm" onClick={save}>save tool</Button><Button variant="neutral" size="sm" onClick={onCancel}>cancel</Button></div>
    </div>
  );
}

function ToolsTab({ state, send }: { state: MsqWebState; send: ConfigPageProps['send'] }): React.JSX.Element {
  const tools = state.runtimeConfig.tools;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const inUse = (id: string): boolean => state.backlogSettings.projectDefaults.tool === id || Object.values(state.featureCatalog).some((feature) => feature.tool === id);
  const save = (next: ToolRegistryEntry, originalId?: string): void => {
    const nextTools = originalId ? tools.map((tool) => tool.id === originalId ? next : tool) : [...tools, next];
    send({ type: 'action:updateToolsRegistry', tools: nextTools });
    setEditingId(null);
    setAdding(false);
  };

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <Card title="Tools registry">
      <p style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)', marginTop: 0 }}>App-level tool definitions. Changes are saved to config.json and become available in tool selects immediately.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tools.map((tool) => <div key={tool.id} style={{ borderBottom: '1px solid var(--border-dim)', paddingBottom: 12 }}>
          {editingId === tool.id ? <ToolEditor tool={tool} idReadOnly={inUse(tool.id)} onSave={(next) => { save(next, tool.id); }} onCancel={() => { setEditingId(null); }} /> : <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><strong>{tool.id}</strong><Tag tone="accent">{tool.adapter}</Tag><span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{tool.command}</span><Button variant="neutral" size="sm" onClick={() => { setEditingId(tool.id); setAdding(false); }}>edit</Button><Button variant="destructive" size="sm" disabled={inUse(tool.id) || tools.length <= 1} title={inUse(tool.id) ? 'A tool referenced by defaults or a feature cannot be removed.' : tools.length <= 1 ? 'The registry must retain at least one tool.' : 'Remove tool'} onClick={() => { send({ type: 'action:updateToolsRegistry', tools: tools.filter((candidate) => candidate.id !== tool.id) }); }}>remove</Button>{inUse(tool.id) && <span style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)' }}>in use — removal blocked</span>}</div>}
        </div>)}
        {adding ? <ToolEditor tool={emptyTool()} onSave={(next) => { save(next); }} onCancel={() => { setAdding(false); }} /> : <div><Button variant="primary" size="sm" onClick={() => { setAdding(true); setEditingId(null); }}>add tool</Button></div>}
      </div>
    </Card>
  </div>;
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

export function ConfigPage({ state, send }: ConfigPageProps): React.JSX.Element {
  const [tab, setTab] = useState('runtime');

  const content = useMemo(() => {
    switch (tab) {
      case 'runtime':
        return <RuntimeTab state={state} send={send} />;
      case 'defaults':
        return <DefaultsTab state={state} send={send} />;
      case 'tools':
        return <ToolsTab state={state} send={send} />;
      case 'skills':
        return <SkillsTab state={state} />;
      case 'notifications':
        return <NotificationsTab state={state} />;
      case 'budget':
        return <BudgetTab state={state} />;
      default:
        return null;
    }
  }, [tab, state, send]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader title="Settings" breadcrumb="Runtime, defaults, skills, notifications and budget" />
      <div style={{ padding: '0 20px' }}>
        <Tabs tabs={SUB_TABS} activeId={tab} onSelect={setTab} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>{content}</div>
    </div>
  );
}
