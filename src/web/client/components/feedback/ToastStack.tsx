import React, { useEffect } from 'react';
import { Toast, type ToastTone } from './Toast.js';

export interface ToastStackItem {
  id: string;
  tone: ToastTone;
  message: string;
  /** Optional event label rendered as an eyebrow above the message. */
  source?: string;
  /** Auto-dismiss after this many ms. 0 keeps the toast until dismissed. */
  ttlMs?: number;
}

export interface ToastStackProps {
  items: ToastStackItem[];
  /** Hard cap on simultaneously visible toasts. Older items drop off first. */
  maxVisible?: number;
  onDismiss?: (id: string) => void;
}

const DEFAULT_TTL_MS = 5200;

/**
 * Fixed-position toast surface pinned to the bottom-right of the viewport.
 * Lives above modals and pages; toasts auto-dismiss after `ttlMs` (default
 * ~5s). The notification bell still aggregates every event for later review
 * — this surface exists because the bell is buried in the sidebar and easy
 * to miss while a run is being inspected.
 */
export function ToastStack({ items, maxVisible = 4, onDismiss }: ToastStackProps): React.JSX.Element | null {
  // Keep the most recent toasts — older items drop off the bottom of the stack.
  const visible = items.slice(-maxVisible);

  // A single interval rerenders the stack so TTL-expired items can vanish
  // without each toast running its own timer. When an item is expired, we
  // call `onDismiss` from the same effect (safe — the parent setState is
  // queued, not synchronous) so the caller drops it from `items`.
  useEffect(() => {
    if (!onDismiss) return undefined;
    const expired = visible.filter((item) => {
      const ttl = item.ttlMs ?? DEFAULT_TTL_MS;
      if (ttl <= 0) return false;
      const startedAt = Number(item.id.split('-')[0]);
      return Number.isFinite(startedAt) && Date.now() - startedAt > ttl;
    });
    if (expired.length === 0) return undefined;
    // Batch the dismissals into a microtask so the parent's setState lands
    // outside of the current render pass.
    const pendingIds = expired.map((item) => item.id);
    const handle = setTimeout(() => {
      for (const id of pendingIds) onDismiss(id);
    }, 0);
    return (): void => { clearTimeout(handle); };
  }, [onDismiss, visible]);

  // Periodic re-render so the expiry effect re-evaluates as time passes.
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const timer = setInterval(forceTick, 400);
    return (): void => { clearInterval(timer); };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1200,
        maxWidth: 'min(92vw, 380px)',
        pointerEvents: 'none',
      }}
    >
      {visible.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => { onDismiss?.(item.id); }}
          style={{
            pointerEvents: 'auto',
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            color: 'inherit',
            width: '100%',
          }}
          title="Dismiss"
        >
          <Toast tone={item.tone}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 240, maxWidth: 360 }}>
              {item.source && (
                <span style={{
                  fontSize: 'var(--text-2xs)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                  color: item.tone === 'danger' ? 'var(--accent-danger)' : item.tone === 'warn' ? 'var(--accent-warn)' : item.tone === 'ok' ? 'var(--accent-ok)' : 'var(--accent-info)',
                }}>
                  {item.source}
                </span>
              )}
              <span style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)' }}>
                {item.message}
              </span>
            </div>
          </Toast>
        </button>
      ))}
    </div>
  );
}