import React from 'react';

type Marker = 'done' | 'current' | 'next';

const MARKER_ICON: Record<Marker, string> = { done: '✓', current: '▸', next: '·' };
const MARKER_COLOR: Record<Marker, string> = {
  done: 'var(--accent-ok)',
  current: 'var(--accent-info)',
  next: 'var(--text-dim)',
};

export interface WorkflowStepperProps {
  stages: string[];
  currentStage?: string | null;
  size?: 'default' | 'compact';
  allPending?: boolean;
  /** 'text' renders the named stage sequence; 'bar' renders a segmented
   * progress bar plus a `stage (n/total)` label — compact enough for cards. */
  variant?: 'text' | 'bar';
}

export function WorkflowStepper({ stages, currentStage, size = 'default', allPending = false, variant = 'text' }: WorkflowStepperProps): React.JSX.Element {
  const currentIndex = currentStage != null ? stages.indexOf(currentStage) : -1;
  const isCompact = size === 'compact';

  if (variant === 'bar') {
    const total = stages.length;
    const hasCurrent = !allPending && currentStage != null && currentIndex >= 0;
    const doneCount = allPending
      ? 0
      : currentStage == null
        ? total
        : currentIndex >= 0
          ? currentIndex
          : 0;
    const filledCount = doneCount + (hasCurrent ? 1 : 0);
    const label = allPending
      ? 'todo'
      : currentStage ?? 'complete';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', minWidth: 0 }}>
        <span aria-hidden="true" style={{ display: 'inline-flex', gap: 1, letterSpacing: '1px', flexShrink: 0 }}>
          {stages.map((stage, i) => {
            const filled = i < filledCount;
            const isCurrent = hasCurrent && i === currentIndex;
            return (
              <span key={stage} style={{ color: isCurrent ? 'var(--accent-info)' : filled ? 'var(--accent-ok)' : 'var(--text-faint)' }}>
                {filled ? '▰' : '▱'}
              </span>
            );
          })}
        </span>
        <span style={{ color: hasCurrent ? 'var(--accent-info)' : 'var(--text-dim)', fontWeight: hasCurrent ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}{' '}
          <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({filledCount}/{total})</span>
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: isCompact ? 2 : 4, fontSize: isCompact ? 'var(--text-2xs)' : 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
      {stages.map((stage, i) => {
        const marker: Marker = allPending ? 'next' : stage === currentStage ? 'current' : currentIndex > i || currentStage == null ? 'done' : 'next';
        return (
          <React.Fragment key={stage}>
            <span style={{ color: MARKER_COLOR[marker], fontWeight: marker === 'current' ? 600 : 400 }}>
              {MARKER_ICON[marker]} {stage}
            </span>
            {i < stages.length - 1 && <span style={{ color: 'var(--text-dim)', margin: isCompact ? '0 2px' : '0 4px' }}>→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
