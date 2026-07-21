import React, { useState } from 'react';
import { Button } from './core/Button.js';
import { Card } from './core/Card.js';
import { Tag } from './core/Tag.js';
import { WorkflowTemplateEditor, type WorkflowTemplateDraft } from './WorkflowTemplateEditor.js';
import type {
  MsqWebState,
  MsqWorkItemType,
  WebSocketClientMessage,
  WebSocketServerMessage,
  WorkflowTemplateSummary,
} from '../../types.js';

type ActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

const heading: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-dim)', margin: '0 0 10px' };
const muted: React.CSSProperties = { color: 'var(--text-faint)', fontSize: 'var(--text-xs)' };
const control: React.CSSProperties = {
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  padding: '6px 9px',
};

let sequence = 0;
const requestId = (prefix: string): string => `${prefix}-${String(Date.now())}-${String(++sequence)}`;

const WORK_ITEM_TYPES: MsqWorkItemType[] = ['feature', 'bug'];

interface DefinitionState {
  templateId: string;
  requestId: string;
  draft?: WorkflowTemplateDraft;
  baseline?: WorkflowTemplateDraft;
  error?: string;
}

interface ValidationState {
  requestId: string;
  templateId: string;
  matrix?: { repoId: string; repoLabel: string; missing: string[] }[];
  valid?: boolean;
  error?: string;
}

interface ArchiveBlockedState {
  templateId: string;
  templateName: string;
  mappings: { projectId: string; workItemType: string }[];
}

/**
 * Project Templates: builtins read-only + duplicable, CRUD of custom
 * templates, `feature|bug -> template` mapping, and a repo×skill validation
 * panel run before any save/mapping (PRJ-26). `workflowTemplates` in state is
 * only ever the lightweight summary (PRJ-24); the full `definition` is
 * fetched on demand via `action:getWorkflowTemplateDefinition` when a
 * template is opened for edit/duplication.
 */
export function WorkflowTemplatesSection({ state, projectId, send, actionResults }: {
  state: MsqWebState; projectId: string; send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, ActionResult>;
}): React.JSX.Element {
  const templates = state.workflowTemplates;
  const mappings = state.workflowTemplateMappings[projectId] ?? {};
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [definition, setDefinition] = useState<DefinitionState | null>(null);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [saveRequestId, setSaveRequestId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [archiveBlocked, setArchiveBlocked] = useState<ArchiveBlockedState | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const handledRequests = React.useRef(new Set<string>());
  const pendingArchive = React.useRef<{ templateId: string; name: string } | null>(null);

  const selected = templates.find((t) => t.templateId === selectedId) ?? null;

  function fetchDefinition(templateId: string): void {
    const id = requestId('tpl-def');
    setDefinition({ templateId, requestId: id });
    setValidation(null);
    setSaveError(null);
    setConflict(false);
    send({ type: 'action:getWorkflowTemplateDefinition', requestId: id, templateId });
  }

  function openTemplate(templateId: string): void {
    setSelectedId(templateId);
    fetchDefinition(templateId);
  }

  React.useEffect(() => {
    if (!definition || definition.draft || handledRequests.current.has(definition.requestId)) return;
    const result = actionResults[definition.requestId];
    if (!result) return;
    handledRequests.current.add(definition.requestId);
    const { payload } = result;
    if (payload.ok && 'definition' in payload) {
      const raw = payload.definition as { workflow?: { stages?: string[] }; stageSkills?: Record<string, string[]> };
      const template = templates.find((t) => t.templateId === definition.templateId);
      const baseline: WorkflowTemplateDraft = { name: template?.name ?? '', stages: raw.workflow?.stages ?? [], stageSkills: raw.stageSkills ?? {} };
      setDefinition((current) => (current?.requestId === definition.requestId ? {
        ...current,
        draft: baseline,
        baseline,
      } : current));
    } else if (!payload.ok && 'error' in payload) {
      setDefinition((current) => (current?.requestId === definition.requestId ? { ...current, error: payload.error.message } : current));
    }
  }, [actionResults, definition, templates]);

  React.useEffect(() => {
    if (!saveRequestId || handledRequests.current.has(saveRequestId)) return;
    const result = actionResults[saveRequestId];
    if (!result) return;
    handledRequests.current.add(saveRequestId);
    setSaveRequestId(null);
    if (result.payload.ok) {
      setSaveError(null);
      setConflict(false);
      if ('workflowTemplate' in result.payload) {
        setSelectedId(result.payload.workflowTemplate.templateId);
        fetchDefinition(result.payload.workflowTemplate.templateId);
      }
    } else if ('error' in result.payload) {
      if (result.payload.error.code === 'REVISION_CONFLICT') {
        setConflict(true);
      } else if (result.payload.error.code === 'WORKFLOW_TEMPLATE_IN_USE' && pendingArchive.current) {
        setArchiveBlocked({
          templateId: pendingArchive.current.templateId,
          templateName: pendingArchive.current.name,
          mappings: result.payload.error.mappings ?? [],
        });
      } else {
        setSaveError(result.payload.error.message);
      }
    }
    pendingArchive.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionResults, saveRequestId]);

  function runValidation(draft: WorkflowTemplateDraft, templateId: string): void {
    const id = requestId('tpl-validate');
    setValidation({ requestId: id, templateId });
    send({
      type: 'action:validateWorkflowTemplate',
      requestId: id,
      projectId,
      definition: { workflow: { stages: draft.stages }, stageSkills: draft.stageSkills },
    });
  }

  React.useEffect(() => {
    if (!validation || validation.matrix || handledRequests.current.has(validation.requestId)) return;
    const result = actionResults[validation.requestId];
    if (!result) return;
    handledRequests.current.add(validation.requestId);
    const { payload } = result;
    if (payload.ok && 'matrix' in payload) {
      setValidation((current) => (current?.requestId === validation.requestId ? { ...current, matrix: payload.matrix, valid: payload.valid } : current));
    } else if (!payload.ok && 'error' in payload) {
      setValidation((current) => (current?.requestId === validation.requestId ? { ...current, error: payload.error.message } : current));
    }
  }, [actionResults, validation]);

  function createTemplate(): void {
    const name = newTemplateName.trim();
    if (!name) return;
    const id = requestId('tpl-create');
    setSaveRequestId(id);
    setSaveError(null);
    send({
      type: 'action:createWorkflowTemplate',
      requestId: id,
      projectId,
      name,
      definition: { workflow: { stages: ['specify', 'implement', 'validate'] }, stageSkills: {} },
    });
    setNewTemplateName('');
  }

  function duplicateTemplate(template: WorkflowTemplateSummary): void {
    const id = requestId('tpl-duplicate');
    setSaveRequestId(id);
    setSaveError(null);
    send({ type: 'action:duplicateWorkflowTemplate', requestId: id, templateId: template.templateId, projectId, name: `${template.name} (copy)` });
  }

  function archiveTemplate(template: WorkflowTemplateSummary): void {
    const id = requestId('tpl-archive');
    pendingArchive.current = { templateId: template.templateId, name: template.name };
    setSaveRequestId(id);
    setSaveError(null);
    setArchiveBlocked(null);
    send({ type: 'action:archiveWorkflowTemplate', requestId: id, templateId: template.templateId });
  }

  function saveDraft(): void {
    if (!selected || !definition?.draft || selected.builtin) return;
    const id = requestId('tpl-update');
    setSaveRequestId(id);
    setSaveError(null);
    send({
      type: 'action:updateWorkflowTemplate',
      requestId: id,
      templateId: selected.templateId,
      expectedRevision: selected.revision,
      patch: {
        name: definition.draft.name,
        definition: { workflow: { stages: definition.draft.stages }, stageSkills: definition.draft.stageSkills },
      },
    });
  }

  function reloadAfterConflict(): void {
    if (!selected) return;
    fetchDefinition(selected.templateId);
  }

  function setTypeMapping(workItemType: MsqWorkItemType, templateId: string): void {
    if (!templateId) return;
    const id = requestId('tpl-map');
    send({ type: 'action:setTypeTemplate', requestId: id, projectId, workItemType, templateId });
    setArchiveBlocked((current) => {
      if (!current) return current;
      const remaining = current.mappings.filter((m) => m.workItemType !== workItemType);
      return remaining.length === 0 ? null : { ...current, mappings: remaining };
    });
  }

  const activeTemplates = templates.filter((t) => !t.archived);
  const hasDraftChanges = definition?.draft !== undefined && definition.baseline !== undefined
    && JSON.stringify(definition.draft) !== JSON.stringify(definition.baseline);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <h2 style={heading}>Type mapping</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {WORK_ITEM_TYPES.map((type) => {
            const mappedId = mappings[type];
            const mappedTemplate = mappedId ? templates.find((t) => t.templateId === mappedId) : undefined;
            return (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ minWidth: 70, color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>{type}</span>
                <select
                  aria-label={`Template for ${type}`}
                  value={mappedId ?? ''}
                  onChange={(e) => { setTypeMapping(type, e.target.value); }}
                  style={{ ...control, flex: 1 }}
                >
                  <option value="">builtin (fallback)</option>
                  {activeTemplates.map((t) => <option key={t.templateId} value={t.templateId}>{t.name}</option>)}
                </select>
                {!mappedTemplate && <Tag tone="default">using builtin</Tag>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 style={heading}>Templates</h2>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            aria-label="new template name"
            value={newTemplateName}
            onChange={(e) => { setNewTemplateName(e.target.value); }}
            placeholder="new template name…"
            style={{ ...control, flex: 1 }}
          />
          <Button variant="primary" size="sm" onClick={createTemplate} disabled={!newTemplateName.trim()}>create</Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {templates.length === 0 && <p style={muted}>No templates yet.</p>}
          {archiveBlocked && (
            <div role="alert" style={{ padding: 10, border: '1px solid var(--accent-warn)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunken)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 'var(--text-xs)', color: 'var(--accent-warn)' }}>
                &quot;{archiveBlocked.templateName}&quot; is mapped by {archiveBlocked.mappings.length} Work Item type(s) and must be reassociated before archiving.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {archiveBlocked.mappings.map((mapping) => (
                  <div key={mapping.workItemType} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ minWidth: 70, color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>{mapping.workItemType}</span>
                    <select
                      aria-label={`Reassign template for ${mapping.workItemType}`}
                      defaultValue="__choose__"
                      onChange={(e) => {
                        if (e.target.value === '__choose__') return;
                        setTypeMapping(mapping.workItemType as MsqWorkItemType, e.target.value);
                      }}
                      style={{ ...control, flex: 1 }}
                    >
                      <option value="__choose__" disabled>choose a replacement…</option>
                      {activeTemplates.filter((t) => t.templateId !== archiveBlocked.templateId).map((t) => (
                        <option key={t.templateId} value={t.templateId}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          {templates.map((template) => (
            <div
              key={template.templateId}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                border: `1px solid ${selectedId === template.templateId ? 'var(--accent-info)' : 'var(--border-dim)'}`,
                borderRadius: 'var(--radius-sm)',
                background: selectedId === template.templateId ? 'var(--accent-info-10)' : 'transparent',
              }}
            >
              <button
                type="button"
                onClick={() => { openTemplate(template.templateId); }}
                style={{ flex: 1, textAlign: 'left', fontSize: 'var(--text-xs)', background: 'transparent', border: 0, color: 'var(--text-primary)', cursor: 'pointer', padding: 0 }}
              >
                {template.name}
              </button>
              {template.builtin && <Tag tone="default">builtin</Tag>}
              {template.archived && <Tag tone="accent">archived</Tag>}
              <span style={muted}>v{template.version} · {template.stageCount} steps</span>
              {!template.builtin && !template.archived && (
                <Button variant="neutral" size="sm" onClick={() => { archiveTemplate(template); }}>archive</Button>
              )}
              <Button variant="neutral" size="sm" onClick={() => { duplicateTemplate(template); }}>duplicate</Button>
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <Card>
          <h2 style={heading}>{selected.builtin ? `${selected.name} (read-only)` : `Edit — ${selected.name}`}</h2>
          {definition?.error && <p role="alert" style={{ color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>{definition.error}</p>}
          {!definition?.draft && !definition?.error && <p style={muted}>Loading definition…</p>}
          {definition?.draft && definition.baseline && (
            <TemplateEditorPanel
              draft={definition.draft}
              baseline={definition.baseline}
              selected={selected}
              saveError={saveError}
              conflict={conflict}
              validation={validation}
              hasDraftChanges={hasDraftChanges}
              onChangeDraft={(nextDraft) => { setDefinition((current) => (current ? { ...current, draft: nextDraft } : current)); }}
              onSave={saveDraft}
              onValidate={runValidation}
              onReloadAfterConflict={reloadAfterConflict}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function TemplateEditorPanel({
  draft, baseline, selected, saveError, conflict, validation, hasDraftChanges,
  onChangeDraft, onSave, onValidate, onReloadAfterConflict,
}: {
  draft: WorkflowTemplateDraft;
  baseline: WorkflowTemplateDraft;
  selected: WorkflowTemplateSummary;
  saveError: string | null;
  conflict: boolean;
  validation: ValidationState | null;
  hasDraftChanges: boolean;
  onChangeDraft: (draft: WorkflowTemplateDraft) => void;
  onSave: () => void;
  onValidate: (draft: WorkflowTemplateDraft, templateId: string) => void;
  onReloadAfterConflict: () => void;
}): React.JSX.Element {
  const diff = hasDraftChanges ? diffTemplateDrafts(baseline, draft) : null;
  return (
    <>
      <WorkflowTemplateEditor draft={draft} readOnly={selected.builtin} onChange={onChangeDraft} />
      {!selected.builtin && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" onClick={onSave} disabled={!hasDraftChanges}>save changes</Button>
          <Button variant="neutral" size="sm" onClick={() => { onValidate(draft, selected.templateId); }}>
            validate against active repos
          </Button>
          <span style={muted}>version {selected.version} · updating only affects new Work Items — existing snapshots stay pinned</span>
        </div>
      )}
      {diff && diff.length > 0 && (
        <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunken)' }}>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 6 }}>
            changes since v{selected.version}
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
            {diff.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}
      {saveError && <p role="alert" style={{ color: 'var(--accent-danger)', fontSize: 'var(--text-xs)', marginTop: 8 }}>{saveError}</p>}
      {conflict && (
        <div style={{ marginTop: 8 }}>
          <p role="alert" style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', margin: '0 0 6px' }}>
            This template changed since you opened it. Your draft is preserved — reload to see the latest version before retrying.
          </p>
          <Button variant="neutral" size="sm" onClick={onReloadAfterConflict}>reload latest</Button>
        </div>
      )}
      {validation && (
        <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunken)' }}>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 6 }}>repo × skill validation</div>
          {validation.error && <p role="alert" style={{ margin: 0, color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>{validation.error}</p>}
          {!validation.matrix && !validation.error && <p style={{ ...muted, margin: 0 }}>validating…</p>}
          {validation.matrix?.length === 0 && <p style={{ ...muted, margin: 0 }}>No active repos to validate against.</p>}
          {validation.matrix && validation.matrix.length > 0 && (
            <div style={{ display: 'grid', gap: 4 }}>
              {validation.matrix.map((entry) => (
                <div key={entry.repoId} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-xs)' }}>
                  <span style={{ color: entry.missing.length === 0 ? 'var(--accent-ok)' : 'var(--accent-danger)', fontWeight: 600 }}>
                    {entry.missing.length === 0 ? '✓ ok' : '✕ missing'}
                  </span>
                  <span>{entry.repoLabel}</span>
                  {entry.missing.length > 0 && <span style={{ color: 'var(--accent-danger)' }}>missing: {entry.missing.join(', ')}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Human-readable diff lines between the loaded baseline and the current
 * draft, shown next to the version notice before save (PRJ-26). */
function diffTemplateDrafts(baseline: WorkflowTemplateDraft, draft: WorkflowTemplateDraft): string[] {
  const lines: string[] = [];
  if (baseline.name !== draft.name) lines.push(`name: "${baseline.name}" → "${draft.name}"`);

  const addedStages = draft.stages.filter((stage) => !baseline.stages.includes(stage));
  const removedStages = baseline.stages.filter((stage) => !draft.stages.includes(stage));
  for (const stage of addedStages) lines.push(`+ step "${stage}"`);
  for (const stage of removedStages) lines.push(`- step "${stage}"`);
  if (addedStages.length === 0 && removedStages.length === 0
    && JSON.stringify(baseline.stages) !== JSON.stringify(draft.stages)) {
    lines.push(`reordered steps: [${baseline.stages.join(', ')}] → [${draft.stages.join(', ')}]`);
  }

  const stageNames = new Set([...Object.keys(baseline.stageSkills), ...Object.keys(draft.stageSkills)]);
  for (const stage of stageNames) {
    const before = baseline.stageSkills[stage] ?? [];
    const after = draft.stageSkills[stage] ?? [];
    const addedSkills = after.filter((skill) => !before.includes(skill));
    const removedSkills = before.filter((skill) => !after.includes(skill));
    for (const skill of addedSkills) lines.push(`+ skill "${skill}" on ${stage}`);
    for (const skill of removedSkills) lines.push(`- skill "${skill}" on ${stage}`);
  }
  return lines;
}
