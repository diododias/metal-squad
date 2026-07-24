/**
 * Stable, display-only identity for the Project hierarchy.  These ids are
 * deliberately derived instead of persisted, so existing records retain one
 * consistent label across every web surface.
 */
export type EntityIdKind = 'project' | 'epic' | 'work_item' | 'repository';

export function shortId(kind: EntityIdKind, id: string, workItemType?: 'feature' | 'bug' | null): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const prefix = kind === 'project' ? 'P'
    : kind === 'epic' ? 'E'
      : kind === 'repository' ? 'R'
        : workItemType === 'bug' ? 'B' : 'F';
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
  return `${prefix}-${hex}`;
}
