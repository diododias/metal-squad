import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { parse } from 'yaml';
import { BUILTIN_SKILLS } from './builtin.js';
import type {
  Skill,
  SkillMetadata,
  SkillRegistry,
  SkillSource,
  SkillValidationResult,
} from './types.js';

const SPEC_KIT_FALLBACK_SKILLS = [
  'specify',
  'plan',
  'tasks',
  'implement',
  'analyze',
  'clarify',
  'checklist',
  'constitution',
  'converge',
  'taskstoissues',
];

function defaultDescription(name: string, source: SkillSource): string {
  return `${name} skill discovered from ${source}.`;
}

function parseMetadata(path: string, name: string, source: SkillSource): SkillMetadata {
  if (!existsSync(path)) {
    return { description: defaultDescription(name, source) };
  }

  const parsed = parse(readFileSync(path, 'utf8')) as Partial<SkillMetadata> | null;
  return {
    description: parsed?.description ?? defaultDescription(name, source),
    inputs: parsed?.inputs,
    outputs: parsed?.outputs,
  };
}

function loadFileSkill(dir: string, source: SkillSource, explicitName?: string): Skill | null {
  const promptPath = join(dir, 'SKILL.md');
  if (!existsSync(promptPath)) return null;

  const name = explicitName ?? basename(dir);
  return {
    name,
    source,
    promptTemplate: readFileSync(promptPath, 'utf8'),
    metadata: parseMetadata(join(dir, 'metadata.yaml'), name, source),
  };
}

function discoverDirectorySkills(root: string, source: SkillSource): Skill[] {
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadFileSkill(join(root, entry.name), source))
    .filter((skill): skill is Skill => skill !== null);
}

function discoverSpecKitSkills(cwd: string): Skill[] {
  const skills = new Map<string, Skill>();
  const agentsRoot = join(cwd, '.agents', 'skills');

  if (existsSync(agentsRoot)) {
    for (const entry of readdirSync(agentsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('speckit-')) continue;
      const name = entry.name.replace(/^speckit-/, '');
      const skill = loadFileSkill(join(agentsRoot, entry.name), 'external', name);
      if (skill) skills.set(skill.name, skill);
    }
  }

  if (existsSync(join(cwd, '.specify'))) {
    for (const name of SPEC_KIT_FALLBACK_SKILLS) {
      if (skills.has(name)) continue;
      skills.set(name, {
        name,
        source: 'external',
        promptTemplate: `Spec Kit skill: ${name}`,
        metadata: {
          description: `Spec Kit ${name} workflow discovered from external tooling.`,
        },
      });
    }
  }

  return [...skills.values()];
}

export function createSkillRegistry(): SkillRegistry {
  const mergeByPriority = (sources: Skill[][]): Skill[] => {
    const merged = new Map<string, Skill>();
    for (const sourceSkills of sources) {
      for (const skill of sourceSkills) {
        if (!merged.has(skill.name)) merged.set(skill.name, skill);
      }
    }
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  const discover = (cwd: string): Skill[] =>
    mergeByPriority([
      discoverDirectorySkills(join(cwd, '.msq', 'skills'), 'repo'),
      discoverDirectorySkills(join(homedir(), '.config', 'metal-squad', 'skills'), 'global'),
      discoverSpecKitSkills(cwd),
      BUILTIN_SKILLS,
    ]);

  return {
    discover,
    resolve(names: string[], cwd: string): Skill[] {
      const byName = new Map(discover(cwd).map((skill) => [skill.name, skill]));
      return names.map((name) => byName.get(name)).filter((skill): skill is Skill => skill !== undefined);
    },
    validate(names: string[], cwd: string): SkillValidationResult {
      const discoveredNames = new Set(discover(cwd).map((skill) => skill.name));
      const missing = [...new Set(names)].filter((name) => !discoveredNames.has(name));
      return {
        valid: missing.length === 0,
        missing,
      };
    },
  };
}
