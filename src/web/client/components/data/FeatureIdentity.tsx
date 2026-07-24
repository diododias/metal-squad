import React from 'react';
import { shortId } from '../../lib/entityId.js';

export interface FeatureIdentityProps {
  title?: string | null;
  id: string;
  workItemType?: 'feature' | 'bug' | null;
}

/** Shared feature label: human-readable title first, generated ID second. */
export function FeatureIdentity({ title, id, workItemType }: FeatureIdentityProps): React.JSX.Element {
  const displayTitle = title?.trim();

  return (
    <div style={{ minWidth: 0, maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', whiteSpace: 'normal' }}>
      {displayTitle && (
        <div
          style={{
            color: 'var(--text-primary)',
            fontWeight: 600,
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {displayTitle}
        </div>
      )}
      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', lineHeight: 1.3, marginTop: displayTitle ? 3 : 0 }}>
        {shortId('work_item', id, workItemType)}
      </div>
    </div>
  );
}
