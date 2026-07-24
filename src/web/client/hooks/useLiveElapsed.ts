import { useState, useEffect } from 'react';
import { formatElapsed } from '../lib/format.js';

export function useLiveElapsed(startedAt: string | null | undefined, active: boolean): string | null {
  const [elapsed, setElapsed] = useState<string | null>(
    startedAt ? formatElapsed(startedAt, active ? null : null) : null,
  );

  useEffect(() => {
    if (!startedAt) { setElapsed(null); return; }
    setElapsed(formatElapsed(startedAt, null));
    if (!active) return undefined;
    const id = setInterval(() => { setElapsed(formatElapsed(startedAt, null)); }, 1000);
    return (): void => { clearInterval(id); };
  }, [startedAt, active]);

  return elapsed;
}
