export type SkillSource = 'builtin' | 'repo' | 'global' | 'external';

export interface SkillMetadata {
  description: string;
  inputs?: string[];
  outputs?: string[];
}

export interface Skill {
  name: string;
  source: SkillSource;
  promptTemplate: string;
  metadata: SkillMetadata;
}

export interface SkillValidationResult {
  valid: boolean;
  missing: string[];
}

export interface SkillRegistry {
  discover(cwd: string): Skill[];
  resolve(names: string[], cwd: string): Skill[];
  validate(names: string[], cwd: string): SkillValidationResult;
}
