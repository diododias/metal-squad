import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RunStatusStrip } from '../../src/web/client/components/status/RunStatusStrip.js';

describe('RunStatusStrip', () => {
  it('renders the unified status · tool · model · tokens · ctx · elapsed row', () => {
    const html = renderToStaticMarkup(
      <RunStatusStrip
        status="running"
        tool="claude"
        model="claude-sonnet-4-5"
        tokens="41.9k"
        contextPercent="71%"
        elapsed="11m40s"
      />,
    );
    expect(html).toContain('running');
    expect(html).toContain('claude');
    expect(html).toContain('claude-sonnet-4-5');
    expect(html).toContain('41.9k tok');
    expect(html).toContain('ctx 71%');
    expect(html).toContain('11m40s');
  });

  it('omits null and placeholder items instead of rendering dashes', () => {
    const html = renderToStaticMarkup(
      <RunStatusStrip status="done" tool="codex" tokens="—" contextPercent="—" elapsed="—" />,
    );
    expect(html).toContain('codex');
    expect(html).not.toContain('—');
    expect(html).not.toContain('ctx');
  });

  it('shows the spinner inside the pill only when enabled and running', () => {
    const on = renderToStaticMarkup(<RunStatusStrip status="running" spinnerEnabled />);
    const off = renderToStaticMarkup(<RunStatusStrip status="running" spinnerEnabled={false} />);
    const done = renderToStaticMarkup(<RunStatusStrip status="done" spinnerEnabled />);
    expect(on).toContain('msq-status-spinner');
    expect(off).not.toContain('msq-status-spinner');
    expect(done).not.toContain('msq-status-spinner');
  });

  it('prefers the session-aware status label when provided', () => {
    const html = renderToStaticMarkup(<RunStatusStrip status="blocked" statusLabel="awaiting approval" />);
    expect(html).toContain('awaiting approval');
  });
});
