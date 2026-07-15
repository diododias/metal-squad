import React, { useState } from 'react';
import { Button } from '../core/Button.js';

export interface QuestionBannerProps {
  prompt: string;
  options?: string[];
  onAnswer: (response: string) => void;
}

export function QuestionBanner({ prompt, options, onAnswer }: QuestionBannerProps): React.JSX.Element {
  const [freeText, setFreeText] = useState('');

  return (
    <div
      style={{
        background: 'var(--accent-warn-10)',
        border: '1px solid var(--accent-warn)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 'var(--text-2xs)',
            color: 'var(--accent-warn)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
            marginBottom: 4,
          }}
        >
          Question from the AI
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{prompt}</div>
      </div>
      {options && options.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {options.map((option) => (
            <Button key={option} variant="primary" size="sm" onClick={() => { onAnswer(option); }}>
              {option}
            </Button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={freeText}
            onChange={(e) => { setFreeText(e.target.value); }}
            placeholder="Type your answer…"
            style={{
              flex: 1,
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              padding: '7px 10px',
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              const trimmed = freeText.trim();
              if (trimmed) onAnswer(trimmed);
            }}
          >
            answer
          </Button>
        </div>
      )}
    </div>
  );
}
