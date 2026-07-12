import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Feature } from './schema.js';
import type { Skill } from '../skills/types.js';

export interface PromptBuildOptions {
  maxContextChars?: number;
  activeStage?: string | null;
  stepGuidanceSkills?: Skill[];
}

function renderTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\n{3,}/g, '\n\n').trim();
}

function truncateSection(content: string, maxChars?: number): string | null {
  if (!content) return null;
  if (maxChars === undefined || content.length <= maxChars) return content;

  const notice = '\n\n[truncated to respect promptContextCharLimit]';
  const sliceLength = Math.max(0, maxChars - notice.length);
  return `${content.slice(0, sliceLength)}${notice}`.trim();
}

function readOptionalFile(path: string | undefined, cwd: string): string | null {
  if (!path) return null;
  const abs = resolve(cwd, path);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

function collectContextFiles(absPath: string): string[] {
  const stat = statSync(absPath);
  if (stat.isFile()) return [absPath];
  if (!stat.isDirectory()) return [];

  return readdirSync(absPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => collectContextFiles(resolve(absPath, entry.name)));
}

function readContextEntry(path: string, cwd: string): string | null {
  const abs = resolve(cwd, path);
  if (!existsSync(abs)) return null;

  const entries = collectContextFiles(abs)
    .map((file) => {
      try {
        const content = readFileSync(file, 'utf8');
        return `--- ${relative(cwd, file)} ---\n${content}`;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is string => entry !== null);

  return entries.length > 0 ? entries.join('\n\n') : null;
}

function buildSpecSection(feature: Feature, cwd: string): string | null {
  const parts: string[] = [];

  if (feature.spec) {
    parts.push(`Feature summary:\n${feature.spec}`);
  }

  const specFileContent = readOptionalFile(feature.specFile, cwd);
  if (specFileContent && feature.specFile) {
    parts.push(`--- ${feature.specFile} ---\n${specFileContent}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

function buildContextSection(feature: Feature, cwd: string): string | null {
  const parts = (feature.context ?? [])
    .map((file) => {
      return readContextEntry(file, cwd);
    })
    .filter((entry): entry is string => entry !== null);

  return parts.length > 0 ? parts.join('\n\n') : null;
}

function buildTasksSection(feature: Feature, cwd: string): string | null {
  const parts = feature.tasks.map((task) => {
    const lines = [`## ${task.id} — ${task.title}`];
    if (task.status !== 'todo') lines.push(`Status: ${task.status}`);
    if (task.skills && task.skills.length > 0) lines.push(`Skills: ${task.skills.join(', ')}`);
    if (task.dependsOn.length > 0) lines.push(`Depends on: ${task.dependsOn.join(', ')}`);

    const taskFileContent = readOptionalFile(task.taskFile, cwd);
    if (taskFileContent && task.taskFile) {
      lines.push(`--- ${task.taskFile} ---\n${taskFileContent}`);
    }

    return lines.join('\n');
  });

  return parts.length > 0 ? parts.join('\n\n') : null;
}

function renderSkillPrompt(
  skill: Skill,
  feature: Feature,
  specContent: string | null,
  contextContent: string | null,
  tasksContent: string | null,
): string {
  const inputs = skill.metadata.inputs;
  const vars: Record<string, string | null | undefined> = {
    featureId: feature.id,
    featureTitle: feature.title,
    summary: !inputs || inputs.includes('summary')
      ? (feature.spec ? `Feature summary:\n${feature.spec}` : null)
      : null,
    spec: null,
    context: null,
    tasks: null,
  };
  if (!inputs || inputs.includes('specFile')) vars.spec = specContent;
  if (!inputs || inputs.includes('context')) vars.context = contextContent;
  if (!inputs || inputs.includes('tasks')) vars.tasks = tasksContent;
  return normalizePrompt(renderTemplate(skill.promptTemplate, vars));
}

function dedupeStepGuidanceSkills(baseSkills: Skill[], extraSkills: Skill[]): Skill[] {
  const seen = new Set(baseSkills.map((skill) => skill.name));
  const deduped: Skill[] = [];
  for (const skill of extraSkills) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    deduped.push(skill);
  }
  return deduped;
}

const FALLBACK_IMPLEMENT: Skill = {
  name: 'implement',
  source: 'builtin',
  promptTemplate: [
    'Implement {{featureId}} ({{featureTitle}}).',
    '{{summary}}',
    '{{spec}}',
    '{{context}}',
    '{{tasks}}',
  ].join('\n\n'),
  metadata: {
    description: 'Default implementation workflow (fallback).',
    inputs: ['summary', 'specFile', 'context', 'tasks'],
    outputs: ['code'],
  },
};

export function buildPrompt(
  feature: Feature,
  skills: Skill[],
  cwd = process.cwd(),
  opts: PromptBuildOptions = {},
): string {
  const specContent = truncateSection(buildSpecSection(feature, cwd) ?? '', opts.maxContextChars);
  const contextContent = truncateSection(buildContextSection(feature, cwd) ?? '', opts.maxContextChars);
  const tasksContent = truncateSection(buildTasksSection(feature, cwd) ?? '', opts.maxContextChars);
  const effectiveSkills = skills.length > 0 ? skills : [FALLBACK_IMPLEMENT];
  const skillPrompts = effectiveSkills.map((skill) => renderSkillPrompt(skill, feature, specContent, contextContent, tasksContent));
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tests still exercise buildPrompt with partial feature objects
  const stepGuidance = opts.activeStage ? feature.workflow?.stepGuidance?.[opts.activeStage] : undefined;
  const stepGuidanceSkills = dedupeStepGuidanceSkills(
    effectiveSkills,
    opts.stepGuidanceSkills ?? [],
  ).map((skill) => renderSkillPrompt(skill, feature, specContent, contextContent, tasksContent));
  const directPrompt = stepGuidance?.prompt?.trim() ? normalizePrompt(stepGuidance.prompt) : null;

  return [...skillPrompts, ...stepGuidanceSkills, directPrompt]
    .filter((section): section is string => Boolean(section))
    .join('\n\n---\n\n');
}
