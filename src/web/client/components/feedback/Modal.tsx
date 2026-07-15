import React from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  children?: React.ReactNode;
}

export function Modal({ open, onClose, width = 600, children }: ModalProps): React.JSX.Element | null {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgb(0 0 0 / 0.6)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); }}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-dim)',
          borderRadius: 'var(--radius-lg)',
          width,
          maxWidth: '90vw',
          maxHeight: '78vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-overlay)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
