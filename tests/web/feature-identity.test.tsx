import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeatureIdentity } from '../../src/web/client/components/data/FeatureIdentity.js';
import { shortId } from '../../src/web/client/lib/entityId.js';

describe('FeatureIdentity', () => {
  it('renders the feature title before the generated ID', () => {
    const id = 'F-W59PYMCY';
    const html = renderToStaticMarkup(<FeatureIdentity title="F52 — Id gerado automaticamente" id={id} />);

    expect(html.indexOf('F52 — Id gerado automaticamente')).toBeLessThan(html.indexOf(shortId('work_item', id)));
  });

  it('keeps the generated ID visible when the title is unavailable', () => {
    const html = renderToStaticMarkup(<FeatureIdentity id="F-W59PYMCY" />);

    expect(html).toContain(shortId('work_item', 'F-W59PYMCY'));
  });

  it('uses the bug prefix from the work item type', () => {
    const html = renderToStaticMarkup(<FeatureIdentity id="work-item-1" workItemType="bug" />);

    expect(html).toContain(shortId('work_item', 'work-item-1', 'bug'));
  });
});
