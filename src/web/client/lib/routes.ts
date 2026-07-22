export type Route =
  | { page: 'board' }
  | { page: 'run-detail'; featureId: string }
  | { page: 'backlog-detail'; featureId: string }
  | { page: 'projects' }
  | { page: 'project-detail'; projectId: string }
  | { page: 'epic-detail'; projectId: string; epicId: string }
  | { page: 'epic-item-detail'; projectId: string; epicId: string; featureId: string }
  | { page: 'runs' }
  | { page: 'gates' }
  | { page: 'analytics' }
  | { page: 'archived' }
  | { page: 'config' };

export function parseHash(hash: string): Route {
  // Query suffixes (e.g. `?tab=templates`, filter persistence) are page-local
  // state, never part of route identity.
  const h = (hash.replace(/^#/, '').split('?')[0] ?? '') || '/board';
  if (h.startsWith('/runs/')) return { page: 'run-detail', featureId: h.slice('/runs/'.length) };
  if (h.startsWith('/backlog/')) return { page: 'backlog-detail', featureId: h.slice('/backlog/'.length) };
  if (h === '/runs') return { page: 'runs' };
  if (h === '/projects') return { page: 'projects' };
  if (h.startsWith('/projects/')) {
    const rest = h.slice('/projects/'.length);
    const itemMatch = /^([^/]+)\/epics\/([^/]+)\/items\/([^/]+)$/.exec(rest);
    if (itemMatch) return { page: 'epic-item-detail', projectId: itemMatch[1] ?? '', epicId: itemMatch[2] ?? '', featureId: itemMatch[3] ?? '' };
    const epicMatch = /^([^/]+)\/epics\/([^/]+)$/.exec(rest);
    if (epicMatch) return { page: 'epic-detail', projectId: epicMatch[1] ?? '', epicId: epicMatch[2] ?? '' };
    return { page: 'project-detail', projectId: rest };
  }
  if (h === '/gates') return { page: 'gates' };
  if (h === '/config') return { page: 'config' };
  if (h === '/analytics') return { page: 'analytics' };
  if (h === '/archived') return { page: 'archived' };
  return { page: 'board' };
}
