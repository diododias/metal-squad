import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Feature } from './schema.js';
import type { Skill } from '../skills/types.js';
import type { DependencyPublication } from '../git/dependencies.js';

export interface PromptBuildOptions {
  maxContextChars?: number;
  activeStage?: string | null;
  stepGuidanceSkills?: Skill[];
  dependencyPublications?: DependencyPublication[];
  baseBranch?: string;
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

/**
 * Collects the readable file paths reachable from a feature `context:` entry.
 * Returns only relative paths so the adapter/agent can load them on demand
 * instead of receiving their contents inlined into the prompt.
 */
function listContextPaths(path: string, cwd: string): string[] {
  const abs = resolve(cwd, path);
  if (!existsSync(abs)) return [];
  return collectContextFiles(abs)
    .map((file) => relative(cwd, file))
    .filter((rel): rel is string => rel.length > 0);
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
  const paths = (feature.context ?? [])
    .flatMap((file) => listContextPaths(file, cwd));

  if (paths.length === 0) return null;
  return [
    'Additional technical context (paths only — load on demand, do not inline their contents unless needed):',
    ...paths.map((p) => `- ${p}`),
  ].join('\n');
}

function buildTasksSection(feature: Feature, cwd: string): string | null {
  const parts = feature.tasks.map((task) => {
    const lines = [`## ${task.id} — ${task.title}`];
    if (task.status !== 'todo') lines.push(`Status: ${task.status}`);
    if (task.skills && task.skills.length > 0) lines.push(`Skills: ${task.skills.join(', ')}`);
    if (task.dependsOn.length > 0) lines.push(`Depends on: ${task.dependsOn.join(', ')}`);

    // Task files are referenced by path only; the agent loads them on demand
    // if and when needed, keeping the prompt lean.
    if (task.taskFile && existsSync(resolve(cwd, task.taskFile))) {
      lines.push(`Task file: ${task.taskFile}`);
    }

    return lines.join('\n');
  });

  return parts.length > 0 ? parts.join('\n\n') : null;
}

export function buildDependencyPublicationsSection(
  publications: DependencyPublication[] | undefined,
  baseBranch = 'develop',
): string | null {
  const recommended = publications?.[0];
  if (!recommended) return null;

  // `remoteBranch` is persisted from the dependency's verified publication.
  // T11 will ensure it is always present; use origin/<branch> for older runs.
  const remoteBranch = recommended.remoteBranch ?? `origin/${recommended.branchName}`;
  const slashIndex = remoteBranch.indexOf('/');
  const remote = slashIndex === -1 ? 'origin' : remoteBranch.slice(0, slashIndex);
  const branch = slashIndex === -1 ? recommended.branchName : remoteBranch.slice(slashIndex + 1);

  return [
    '# dependency base',
    `base_branch=${baseBranch}`,
    `base_remote=${remoteBranch}`,
    `base_ref=${recommended.branchName}`,
    `pr_base=${recommended.branchName}`,
    `git fetch ${remote} ${branch} && git switch -c <your-working-branch> FETCH_HEAD`,
  ].join('\n');
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
  const dependencySection = buildDependencyPublicationsSection(
    opts.dependencyPublications,
    opts.baseBranch,
  );
  const technicalSpecification = [
    `Feature: ${feature.id} — ${feature.title}`,
    specContent,
    contextContent,
    tasksContent ? `Tasks:\n${tasksContent}` : null,
  ].filter((section): section is string => Boolean(section)).join('\n\n');
  const directPrompt = stepGuidance?.prompt?.trim() ? normalizePrompt(stepGuidance.prompt) : null;

  return [
    ...effectiveSkills.map((skill) => `/${skill.name}`),
    ...stepGuidanceSkillCommands,
    technicalSpecification,
    dependencySection,
    directPrompt,
  ]
    .filter((section): section is string => Boolean(section))
    .join('\n\n---\n\n');
}
