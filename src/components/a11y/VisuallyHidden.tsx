/**
 * VisuallyHidden — Screen reader only text utility.
 * Content is hidden visually but accessible to assistive technology.
 */

import type { ReactNode } from 'react';

interface VisuallyHiddenProps {
  children: ReactNode;
  /** Render as a different element (default: span) */
  as?: 'span' | 'div' | 'label';
}

export default function VisuallyHidden({
  children,
  as: Tag = 'span',
}: VisuallyHiddenProps) {
  return (
    <Tag
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {children}
    </Tag>
  );
}
