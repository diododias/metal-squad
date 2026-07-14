import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeatureIdentity } from '../../src/web/client/components/data/FeatureIdentity.js';

describe('FeatureIdentity', () => {
  it('renders the feature title before the generated ID', () => {
    const html = renderToStaticMarkup(<FeatureIdentity title="F52 — Id gerado automaticamente" id="F-W59PYMCY" />);

    expect(html.indexOf('F52 — Id gerado automaticamente')).toBeLessThan(html.indexOf('F-W59PYMCY'));
  });

  it('keeps the generated ID visible when the title is unavailable', () => {
    const html = renderToStaticMarkup(<FeatureIdentity id="F-W59PYMCY" />);

    expect(html).toContain('F-W59PYMCY');
  });
});
