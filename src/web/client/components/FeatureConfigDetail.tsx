import React, { useEffect, useState } from 'react';
import { Button } from './core/Button.js';
import { Tag } from './core/Tag.js';
import type { FeatureCatalogEntry, BacklogSettings } from '../../../ui/catalog.js';
import type { FeatureConfigPatch, TaskConfigPatch } from '../../types.js';

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', padding: 14 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <div style={{ fontSize: 'var(--text-sm)' }}>{children}</div>
    </div>
  );
}

function ConfigField({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-dim)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--text-faint)', margin: '12px 0 6px' }}>
      {children}
    </div>
  );
}

export interface FeatureConfigDetailProps {
  feature: FeatureCatalogEntry;
  backlogSettings: BacklogSettings;
  onSaveConfig: (patch: FeatureConfigPatch) => void;
  onSaveTaskConfig?: (taskId: string, patch: TaskConfigPatch) => void;
}

export function FeatureConfigDetail({ feature, backlogSettings, onSaveConfig }: FeatureConfigDetailProps): React.JSX.Element {
  const stages = feature.workflow.stages;
  const [selectedStage, setSelectedStage] = useState(stages[0] ?? 'specify');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const guidance = feature.workflow.stepGuidance[selectedStage];
    setDraftPrompt(guidance?.prompt ?? '');
    setDraftSkills(guidance?.skills ?? []);
    setNewSkill('');
  }, [feature.id, selectedStage, feature.workflow.stepGuidance]);

  function saveGuidance(): void {
    onSaveConfig({
      workflow: {
        stepGuidance: {
          ...feature.workflow.stepGuidance,
          [selectedStage]: { skills: draftSkills, prompt: draftPrompt },
        },
      },
    });
    setSavedFlash(true);
    setTimeout(() => { setSavedFlash(false); }, 1400);
  }

  function revertGuidance(): void {
    const guidance = feature.workflow.stepGuidance[selectedStage];
    setDraftPrompt(guidance?.prompt ?? '');
    setDraftSkills(guidance?.skills ?? []);
  }

  const resolvedStageSkills = backlogSettings.stageSkills[selectedStage] ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ConfigCard title="Execução">
        <ConfigField label="tool" value={feature.tool} />
        <ConfigField label="model" value={feature.model ?? '—'} />
        <ConfigField label="effort" value={feature.effort} />
        <ConfigField label="maxTokens (override)" value={feature.maxTokens?.toLocaleString() ?? 'none (uses perFeatureMaxTokens)'} />
        <ConfigField label="autoStart" value={feature.autoStart ? 'on' : 'off'} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span style={{ color: 'var(--text-dim)' }}>dependsOn</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {feature.dependsOn.length ? feature.dependsOn.map((d) => <Tag key={d}>{d}</Tag>) : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span style={{ color: 'var(--text-dim)' }}>pendingDependencies</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(feature.pendingDependencies?.length ?? 0) > 0
              ? feature.pendingDependencies?.map((d) => <Tag key={d}>{d}</Tag>)
              : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-ok)' }}>ready</span>}
          </div>
        </div>
      </ConfigCard>

      <ConfigCard title="Spec & context">
        <ConfigField label="specFile" value={feature.specFile ?? '—'} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ color: 'var(--text-dim)' }}>context</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 320 }}>
            {(feature.context ?? []).map((c) => (
              <Tag key={c}>{c}</Tag>
            ))}
          </div>
        </div>
      </ConfigCard>

      <ConfigCard title="Workflow">
        <ConfigField label="mode" value={feature.workflow.mode} />
        <ConfigField label="syncTasksToBacklog" value={feature.workflow.syncTasksToBacklog ? 'on' : 'off'} />
        <ConfigField label="approvals.channel" value={feature.workflow.approvals.channel} />
        <ConfigField label="approvals.autoAdvance" value={feature.workflow.approvals.autoAdvance ? 'on' : 'off'} />
        <ConfigField label="sessionPolicy.mode" value={feature.workflow.sessionPolicy.mode} />
      </ConfigCard>

      {feature.retry && (
        <ConfigCard title="Retry & fallback">
          <ConfigField label="maxAttempts" value={feature.retry.maxAttempts} />
          <ConfigField label="backoffMs" value={feature.retry.backoffMs} />
          <ConfigField label="onFail" value={feature.retry.onFail} />
          <ConfigField
            label="fallback"
            value={feature.retry.fallback.length ? feature.retry.fallback.map((f) => `${f.tool}/${f.model ?? '—'} (${f.effort ?? '—'})`).join(', ') : 'none'}
          />
        </ConfigCard>
      )}

      <ConfigCard title="Steps — prompt and skills per stage">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => { setSelectedStage(s); }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                border: `1px solid ${selectedStage === s ? 'var(--accent-info)' : 'var(--border-strong)'}`,
                background: selectedStage === s ? 'var(--accent-info-10)' : 'transparent',
                color: selectedStage === s ? 'var(--accent-info)' : 'var(--text-dim)',
                fontWeight: selectedStage === s ? 600 : 400,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <SubHeading>Resolved skills ({selectedStage}) — global, via stageSkills</SubHeading>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {resolvedStageSkills.length ? resolvedStageSkills.map((s) => <Tag key={s}>{s}</Tag>) : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>}
        </div>

        <SubHeading>Extra skills for this stage (workflow.stepGuidance.{selectedStage}.skills)</SubHeading>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {draftSkills.map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
          {draftSkills.length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <input
            value={newSkill}
            onChange={(e) => { setNewSkill(e.target.value); }}
            placeholder="add skill…"
            style={{
              flex: 1,
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: '6px 9px',
            }}
          />
          <Button
            variant="neutral"
            size="sm"
            onClick={() => {
              if (newSkill.trim()) {
                setDraftSkills((ds) => [...ds, newSkill.trim()]);
                setNewSkill('');
              }
            }}
          >
            add
          </Button>
        </div>

        <SubHeading>Custom stage prompt (workflow.stepGuidance.{selectedStage}.prompt)</SubHeading>
        <textarea
          value={draftPrompt}
          onChange={(e) => { setDraftPrompt(e.target.value); }}
          rows={5}
          placeholder={`Free text appended to the end of ${selectedStage}'s final prompt…`}
          style={{
            width: '100%',
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-dim)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            padding: 10,
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: '6px 0 12px', lineHeight: 1.5 }}>
          Appended to the end of the stage&apos;s final prompt — skills + extra skills + this text, separated by <code>---</code>.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="primary" size="sm" onClick={saveGuidance}>
            save step prompt
          </Button>
          <Button variant="neutral" size="sm" onClick={revertGuidance}>
            revert
          </Button>
          {savedFlash && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--accent-ok)' }}>✓ saved</span>}
        </div>
      </ConfigCard>
    </div>
  );
}
