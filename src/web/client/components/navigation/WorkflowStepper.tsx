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
}

export function WorkflowStepper({ stages, currentStage, size = 'default', allPending = false }: WorkflowStepperProps): React.JSX.Element {
  const currentIndex = currentStage != null ? stages.indexOf(currentStage) : -1;
  const isCompact = size === 'compact';

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
