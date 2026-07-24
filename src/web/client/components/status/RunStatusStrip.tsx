import React from 'react';
import { StatusPill, type PillStatus } from '../core/StatusPill.js';

export interface RunStatusStripProps {
  status: PillStatus | (string & {});
  /** Session-aware label override for the pill (e.g. "awaiting approval"). */
  statusLabel?: string;
  spinnerEnabled?: boolean;
  tool?: string | null;
  model?: string | null;
  tokens?: string | null;
  /** Whether the displayed tokens were consumed by an aborted run. */
  tokensAreWaste?: boolean;
  contextTokens?: string | null;
  elapsed?: string | null;
}

/** Unified single-row replacement for the run-detail metric card grid:
 * `[⟳ running] · claude · sonnet-4-5 · 41.9k tok · ctx 41.9k tok · 11m40s`.
 * Null/empty items are omitted; flex-wrap folds it into two lines on mobile. */
export function RunStatusStrip({
  status,
  statusLabel,
  spinnerEnabled = true,
  tool,
  model,
  tokens,
  tokensAreWaste = false,
  contextTokens,
  elapsed,
}: RunStatusStripProps): React.JSX.Element {
  const items: React.ReactNode[] = [];
  if (tool) items.push(<span key="tool">{tool}</span>);
  if (model) items.push(<span key="model">{model}</span>);
  if (tokens && tokens !== '—') items.push(<span key="tokens" style={{ color: tokensAreWaste ? 'var(--accent-warn)' : 'var(--text-primary)', fontWeight: 600 }}>{tokens} tok{tokensAreWaste ? ' · WASTE' : ''}</span>);
  if (contextTokens && contextTokens !== '—') items.push(<span key="ctx">ctx {contextTokens} tok</span>);
  if (elapsed && elapsed !== '—') items.push(<span key="elapsed" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{elapsed}</span>);

  return (
    <div
      role="status"
      data-status={status}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px 10px',
        padding: '10px 14px',
        border: '1px solid var(--border-dim)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-panel)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-dim)',
      }}
    >
      <StatusPill status={status} label={statusLabel} spinner={spinnerEnabled} />
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>·</span>
          {item}
        </React.Fragment>
      ))}
    </div>
  );
}
