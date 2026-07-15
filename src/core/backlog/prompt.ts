import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Feature } from './schema.js';
import type { Skill } from '../skills/types.js';

export interface PromptBuildOptions {
  maxContextChars?: number;
  activeStage?: string | null;
  stepGuidanceSkills?: Skill[];
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\n{3,}/g, '\n\n').trim();
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

export function buildPrompt(
  feature: Feature,
  skills: Skill[],
  cwd = process.cwd(),
  opts: PromptBuildOptions = {},
): string {
  const specContent = buildSpecSection(feature, cwd);
  const contextContent = buildContextSection(feature, cwd);
  const tasksContent = buildTasksSection(feature, cwd);
  const effectiveSkills = skills.length > 0 ? skills : [{ name: 'implement' } as Skill];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tests still exercise buildPrompt with partial feature objects
  const stepGuidance = opts.activeStage ? feature.workflow?.stepGuidance?.[opts.activeStage] : undefined;
  const stepGuidanceSkillCommands = dedupeStepGuidanceSkills(
    effectiveSkills,
    opts.stepGuidanceSkills ?? [],
  ).map((skill) => `/${skill.name}`);
  const technicalSpecification = [
    `Feature: ${feature.id} — ${feature.title}`,
    specContent,
    contextContent ? `Additional technical context:\n${contextContent}` : null,
    tasksContent ? `Tasks:\n${tasksContent}` : null,
  ].filter((section): section is string => Boolean(section)).join('\n\n');
  const directPrompt = stepGuidance?.prompt?.trim() ? normalizePrompt(stepGuidance.prompt) : null;

  return [
    ...effectiveSkills.map((skill) => `/${skill.name}`),
    ...stepGuidanceSkillCommands,
    technicalSpecification,
    directPrompt,
  ]
    .filter((section): section is string => Boolean(section))
    .join('\n\n---\n\n');
}
