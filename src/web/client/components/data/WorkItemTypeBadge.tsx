import React from 'react';

export interface WorkItemTypeBadgeProps {
  workItemType: 'feature' | 'bug';
}

/** Consistent visual label for the immutable Work Item type. */
export function WorkItemTypeBadge({ workItemType }: WorkItemTypeBadgeProps): React.JSX.Element {
  return (
    <span
      data-testid="work-item-type-badge"
      title={`type: ${workItemType}`}
      style={{ display: 'inline-block', padding: '2px 6px', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', color: 'var(--text-dim)', textTransform: 'uppercase' }}
    >
      {workItemType}
    </span>
  );
}
