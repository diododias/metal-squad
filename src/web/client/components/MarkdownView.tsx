import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

export interface MarkdownViewProps {
  source: string;
  emptyFallback?: string;
  className?: string;
  style?: React.CSSProperties;
}

const baseStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
  lineHeight: 1.55,
  wordBreak: 'break-word',
};

/** Read-only markdown renderer for Feature Specs and other long-form copy.
 *
 * Uses `react-markdown` with `remark-gfm` (tables, task lists, autolinks,
 * strikethrough) and `rehype-highlight` for code-block syntax coloring. Style
 * hooks come from the design tokens so the prose picks up the dark palette
 * without per-call overrides. The `className` prop lets the parent apply a
 * layout-specific container (e.g. the BacklogItemDetail preview pane). */
export function MarkdownView({ source, emptyFallback, className, style }: MarkdownViewProps): React.JSX.Element {
  const trimmed = source.trim();
  if (!trimmed) {
    return (
      <div
        className={className ? `msq-markdown msq-markdown--empty ${className}` : 'msq-markdown msq-markdown--empty'}
        style={{ ...baseStyle, color: 'var(--text-faint)', fontStyle: 'italic', ...style }}
      >
        {emptyFallback ?? 'No content.'}
      </div>
    );
  }
  return (
    <div
      className={className ? `msq-markdown ${className}` : 'msq-markdown'}
      style={{ ...baseStyle, ...style }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ children, ...rest }) => (
            <a {...rest} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
