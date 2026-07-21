/** Page-local list state (filters, ordering, active tab) persisted as a query
 * suffix on the hash route (`#/projects/p1?status=todo&q=auth`). `parseHash`
 * ignores the suffix, so route identity never changes; writes go through
 * `history.replaceState` so typing in a filter does not pollute history.
 *
 * The last query written for each path is also kept in memory so breadcrumb /
 * back links can restore the origin page exactly as it was left
 * (`hashWithRestoredQuery`). */

const lastQueryByPath = new Map<string, string>();

export function currentHashPath(): string {
  return (window.location.hash.replace(/^#/, '').split('?')[0] ?? '') || '/board';
}

/** Read the current hash query, remembering it for later restoration. */
export function readHashParams(): URLSearchParams {
  const query = window.location.hash.split('?')[1] ?? '';
  if (query) lastQueryByPath.set(currentHashPath(), query);
  return new URLSearchParams(query);
}

/** Merge `patch` into the current hash query in place. `null`/empty values
 * delete their key; an empty resulting query drops the `?` entirely. */
export function updateHashParams(patch: Record<string, string | null>): void {
  const path = currentHashPath();
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  if (query) lastQueryByPath.set(path, query);
  else lastQueryByPath.delete(path);
  // Nothing to persist and nothing to clear: leave the hash untouched (avoids
  // rewriting e.g. "" to "#/board" on mount).
  if (!query && !window.location.hash.includes('?')) return;
  history.replaceState(null, '', `#${path}${query ? `?${query}` : ''}`);
}

/** Hash target for `path` with its last-known query re-applied, if any. */
export function hashWithRestoredQuery(path: string): string {
  const query = lastQueryByPath.get(path);
  return query ? `${path}?${query}` : path;
}

/** Test-only: forget remembered queries. */
export function resetHashStateMemory(): void {
  lastQueryByPath.clear();
}
