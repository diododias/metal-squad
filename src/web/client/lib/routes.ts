export type Route =
  | { page: 'board' }
  | { page: 'run-detail'; featureId: string }
  | { page: 'backlog-detail'; featureId: string }
  | { page: 'runs' }
  | { page: 'gates' }
  | { page: 'analytics' }
  | { page: 'config' };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/board';
  if (h.startsWith('/runs/')) return { page: 'run-detail', featureId: h.slice('/runs/'.length) };
  if (h.startsWith('/backlog/')) return { page: 'backlog-detail', featureId: h.slice('/backlog/'.length) };
  if (h === '/runs') return { page: 'runs' };
  if (h === '/gates') return { page: 'gates' };
  if (h === '/config') return { page: 'config' };
  if (h === '/analytics') return { page: 'analytics' };
  return { page: 'board' };
}
