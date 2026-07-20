import React, { useState } from 'react';
import { Button } from './core/Button.js';
import { EditableTextField } from './core/EditableTextField.js';
import { Tag } from './core/Tag.js';

/** Local editing shape for `WorkflowTemplateDefinition` (`workflow.stages` +
 * `stageSkills`, PRJ-23) — the piece of the contract this editor touches. */
export interface WorkflowTemplateDraft {
  name: string;
  stages: string[];
  stageSkills: Record<string, string[]>;
}

export interface WorkflowTemplateEditorProps {
  draft: WorkflowTemplateDraft;
  onChange: (draft: WorkflowTemplateDraft) => void;
  readOnly?: boolean;
  nameLabel?: string;
}

const control: React.CSSProperties = {
  flex: 1,
  minWidth: 140,
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  padding: '6px 9px',
};

const subHeading: React.CSSProperties = {
  fontSize: 'var(--text-2xs)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
  color: 'var(--text-faint)',
  margin: '12px 0 6px',
};

/**
 * Controlled stage-list editor for `WorkflowTemplateDefinition`, adapted from
 * the stages/skills editing primitives in `FeatureConfigDetail`
 * (`draftStages`, add/remove/reorder). Unlike that component's per-field
 * autosave against a live feature, a template draft is a plain local object —
 * callers own persistence (create/update WS actions with `expectedRevision`).
 */
export function WorkflowTemplateEditor({ draft, onChange, readOnly = false, nameLabel = 'name' }: WorkflowTemplateEditorProps): React.JSX.Element {
  const [selectedStage, setSelectedStage] = useState<string>(draft.stages[0] ?? '');
  const [newStage, setNewStage] = useState('');
  const [newStageIssue, setNewStageIssue] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState('');

  const activeStage = draft.stages.includes(selectedStage) ? selectedStage : (draft.stages[0] ?? '');
  const activeSkills = draft.stageSkills[activeStage] ?? [];

  function addStage(): void {
    const stage = newStage.trim();
    if (!stage) { setNewStageIssue('Enter a step name.'); return; }
    if (draft.stages.includes(stage)) { setNewStageIssue(`Step "${stage}" already exists.`); return; }
    onChange({ ...draft, stages: [...draft.stages, stage] });
    setSelectedStage(stage);
    setNewStage('');
    setNewStageIssue(null);
  }

  function removeStage(stage: string): void {
    if (draft.stages.length <= 1) return;
    const nextStages = draft.stages.filter((candidate) => candidate !== stage);
    const nextStageSkills = Object.fromEntries(Object.entries(draft.stageSkills).filter(([candidate]) => candidate !== stage));
    onChange({ ...draft, stages: nextStages, stageSkills: nextStageSkills });
    if (activeStage === stage) setSelectedStage(nextStages[0] ?? '');
  }

  function moveStage(stage: string, direction: 'up' | 'down'): void {
    const index = draft.stages.indexOf(stage);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= draft.stages.length) return;
    const next = [...draft.stages];
    const currentStage = next[index];
    const targetStage = next[targetIndex];
    if (currentStage === undefined || targetStage === undefined) return;
    [next[index], next[targetIndex]] = [targetStage, currentStage];
    onChange({ ...draft, stages: next });
  }

  function addSkill(): void {
    const skill = newSkill.trim();
    if (!skill || !activeStage || activeSkills.includes(skill)) return;
    onChange({ ...draft, stageSkills: { ...draft.stageSkills, [activeStage]: [...activeSkills, skill] } });
    setNewSkill('');
  }

  function removeSkill(skill: string): void {
    if (!activeStage) return;
    onChange({ ...draft, stageSkills: { ...draft.stageSkills, [activeStage]: activeSkills.filter((candidate) => candidate !== skill) } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <EditableTextField
        id="template-name"
        label={nameLabel}
        value={draft.name}
        initialValue={draft.name}
        disabled={readOnly}
        onChange={(name) => { onChange({ ...draft, name }); }}
      />

      <div style={subHeading}>Steps</div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            aria-label="new step name"
            value={newStage}
            onChange={(e) => { setNewStage(e.target.value); setNewStageIssue(null); }}
            placeholder="step name…"
            style={control}
          />
          <Button variant="neutral" size="sm" onClick={addStage}>add step</Button>
        </div>
      )}
      {newStageIssue && <div role="alert" style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)' }}>{newStageIssue}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {draft.stages.map((stage, index) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', border: `1px solid ${activeStage === stage ? 'var(--accent-info)' : 'var(--border-strong)'}`, borderRadius: 'var(--radius-pill)', background: activeStage === stage ? 'var(--accent-info-10)' : 'transparent' }}>
            <button
              type="button"
              onClick={() => { setSelectedStage(stage); }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '6px 8px 6px 12px', border: 0, borderRadius: 'var(--radius-pill)', cursor: 'pointer', background: 'transparent', color: activeStage === stage ? 'var(--accent-info)' : 'var(--text-dim)', fontWeight: activeStage === stage ? 600 : 400 }}
            >
              {stage}
            </button>
            {!readOnly && <>
              <button type="button" aria-label={`Move ${stage} up`} disabled={index === 0} onClick={() => { moveStage(stage, 'up'); }} style={{ border: 0, borderLeft: '1px solid var(--border-dim)', padding: '4px 6px', background: 'transparent', color: 'var(--text-dim)', cursor: index === 0 ? 'not-allowed' : 'pointer' }}>↑</button>
              <button type="button" aria-label={`Move ${stage} down`} disabled={index === draft.stages.length - 1} onClick={() => { moveStage(stage, 'down'); }} style={{ border: 0, borderLeft: '1px solid var(--border-dim)', padding: '4px 6px', background: 'transparent', color: 'var(--text-dim)', cursor: index === draft.stages.length - 1 ? 'not-allowed' : 'pointer' }}>↓</button>
              <button type="button" aria-label={`Remove ${stage}`} disabled={draft.stages.length <= 1} onClick={() => { removeStage(stage); }} style={{ border: 0, borderLeft: '1px solid var(--border-dim)', padding: '4px 8px', background: 'transparent', color: 'var(--text-dim)', cursor: draft.stages.length <= 1 ? 'not-allowed' : 'pointer' }}>×</button>
            </>}
          </div>
        ))}
      </div>
      {draft.stages.length <= 1 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>A workflow must keep at least one step.</div>}

      <div style={subHeading}>Skills — stageSkills.{activeStage || '—'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {activeSkills.length ? activeSkills.map((skill) => (
          <span key={skill} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Tag>{skill}</Tag>
            {!readOnly && <button type="button" aria-label={`Remove skill ${skill}`} onClick={() => { removeSkill(skill); }} style={{ border: 0, background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 'var(--text-2xs)' }}>×</button>}
          </span>
        )) : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>none</span>}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            aria-label="new skill name"
            value={newSkill}
            onChange={(e) => { setNewSkill(e.target.value); }}
            placeholder="skill name…"
            style={control}
          />
          <Button variant="neutral" size="sm" onClick={addSkill} disabled={!activeStage}>add skill</Button>
        </div>
      )}
    </div>
  );
}
