import { randomInt } from 'node:crypto';
import type { BacklogV2, BacklogV2Input, Feature, FeatureInput } from './schema.js';

export const FEATURE_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CANONICAL_FEATURE_ID_RE = /^F-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
const INVALID_FEATURE_ID_CHAR_RE = /[\s\p{Cc}]/u;

export type FeatureIdKind = 'generated' | 'legacy' | 'manual';
export type FeatureRegistrationSource = 'backlog-yaml' | 'online';

export interface FeatureRegistrationResult {
  feature: Feature;
  assigned: boolean;
  idKind: FeatureIdKind;
  previousId?: string;
  source?: FeatureRegistrationSource;
}

export interface FeatureRegistrationBatch {
  backlog: BacklogV2;
  registrations: FeatureRegistrationResult[];
}

export type RandomIndex = (min: number, max: number) => number;

export function isCanonicalFeatureId(value: string): boolean {
  return CANONICAL_FEATURE_ID_RE.test(value);
}

export function classifyFeatureId(value: string): FeatureIdKind {
  if (isCanonicalFeatureId(value)) return 'generated';
  if (/^feat-\d+$/.test(value)) return 'legacy';
  return 'manual';
}

export function validateExplicitFeatureId(value: unknown, location = 'feature.id'): FeatureIdKind {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${location} must be a non-empty string when provided.`);
  }
  if (INVALID_FEATURE_ID_CHAR_RE.test(value)) {
    throw new Error(`${location} value "${value}" must not contain whitespace or control characters.`);
  }
  if (value.startsWith('F-') && !isCanonicalFeatureId(value)) {
    throw new Error(`${location} value "${value}" uses reserved F- prefix; expected F- followed by 8 canonical characters.`);
  }
  return classifyFeatureId(value);
}

export function generateCanonicalFeatureId(nextRandomIndex: RandomIndex = randomInt): string {
  let suffix = '';
  for (let index = 0; index < 8; index += 1) {
    suffix += FEATURE_ID_ALPHABET[nextRandomIndex(0, FEATURE_ID_ALPHABET.length)] ?? '';
  }
  return `F-${suffix}`;
}

export function allocateFeatureId(
  occupiedIds: ReadonlySet<string>,
  nextRandomIndex: RandomIndex = randomInt,
  maxAttempts = 1000,
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateCanonicalFeatureId(nextRandomIndex);
    if (!occupiedIds.has(candidate)) return candidate;
  }
  throw new Error(`Unable to allocate a unique feature ID after ${String(maxAttempts)} attempts; catalog may be exhausted.`);
}

function featureLocation(epicIndex: number, featureIndex: number, feature: FeatureInput): string {
  return `epics[${String(epicIndex)}].features[${String(featureIndex)}]${feature.title ? ` (${feature.title})` : ''}`;
}

/**
 * Validates explicit IDs as a batch, then allocates omitted IDs against the
 * global occupied set and IDs already assigned in this batch.
 */
export function registerBacklogFeatures(
  backlog: BacklogV2Input,
  occupiedIds: ReadonlySet<string>,
  nextRandomIndex: RandomIndex = randomInt,
  source: FeatureRegistrationSource = 'backlog-yaml',
): FeatureRegistrationBatch {
  const seen = new Set<string>();
  for (const [epicIndex, epic] of backlog.epics.entries()) {
    for (const [featureIndex, feature] of epic.features.entries()) {
      if (feature.id === undefined) continue;
      const location = featureLocation(epicIndex, featureIndex, feature);
      validateExplicitFeatureId(feature.id, `${location}.id`);
      if (seen.has(feature.id)) {
        throw new Error(`Duplicate feature ID "${feature.id}" at ${location}; IDs must be unique within one backlog.`);
      }
      seen.add(feature.id);
    }
  }

  const reserved = new Set(occupiedIds);
  const registrations: FeatureRegistrationResult[] = [];
  const epics = backlog.epics.map((epic, _epicIndex) => ({
    ...epic,
    features: epic.features.map((input, _featureIndex) => {
      const assigned = input.id === undefined;
      const id = input.id ?? allocateFeatureId(reserved, nextRandomIndex);
      reserved.add(id);
      const idKind = assigned ? 'generated' : classifyFeatureId(id);
      const feature: Feature = { ...input, id };
      registrations.push({
        feature,
        assigned,
        idKind,
        ...(assigned ? {} : { previousId: id }),
        source,
      });
      return feature;
    }),
  }));

  return {
    backlog: { ...backlog, epics },
    registrations,
  };
}
