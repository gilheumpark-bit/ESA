'use client';

/**
 * LaTeX Formula Renderer — KaTeX-based
 *
 * PART 1: Dynamic KaTeX import
 * PART 2: LaTeX component
 */

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Dynamic KaTeX Import (bundle optimization)
// ═══════════════════════════════════════════════════════════════════════════════

let katexModule: typeof import('katex') | null = null;
let katexLoading: Promise<typeof import('katex')> | null = null;

function loadKatex(): Promise<typeof import('katex')> {
  if (katexModule) return Promise.resolve(katexModule);
  if (katexLoading) return katexLoading;

  katexLoading = import('katex').then((mod) => {
    katexModule = mod;
    return mod;
  });

  return katexLoading;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — LaTeX Component
// ═══════════════════════════════════════════════════════════════════════════════

interface LaTeXProps {
  /** LaTeX formula string */
  formula: string;
  /** Force display mode (block-level). Auto-detected if formula starts with \\[ or $$ */
  display?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * Auto-detect display mode from formula prefix.
 * Returns true if formula starts with `\\[` or `$$`.
 */
function isDisplayMode(formula: string): boolean {
  const trimmed = formula.trimStart();
  return trimmed.startsWith('\\[') || trimmed.startsWith('$$');
}

/**
 * Strip display-mode delimiters so KaTeX doesn't choke on them.
 */
function stripDelimiters(formula: string): string {
  let s = formula.trim();
  if (s.startsWith('\\[') && s.endsWith('\\]')) {
    s = s.slice(2, -2);
  } else if (s.startsWith('$$') && s.endsWith('$$')) {
    s = s.slice(2, -2);
  } else if (s.startsWith('\\(') && s.endsWith('\\)')) {
    s = s.slice(2, -2);
  } else if (s.startsWith('$') && s.endsWith('$') && !s.startsWith('$$')) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

export default function LaTeX({ formula, display, className = '' }: LaTeXProps) {
  const resolvedDisplay = display ?? isDisplayMode(formula);
  const cleanFormula = stripDelimiters(formula);
  const renderKey = `${resolvedDisplay ? 'display' : 'inline'}:${cleanFormula}`;
  const [rendered, setRendered] = useState<{ key: string; html?: string; failed?: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    loadKatex()
      .then((module) => {
        if (!active) return;
        try {
          const html = module.default.renderToString(cleanFormula, {
            displayMode: resolvedDisplay,
            throwOnError: false,
            strict: false,
            trust: false,
            output: 'htmlAndMathml',
          });
          setRendered({ key: renderKey, html });
        } catch {
          setRendered({ key: renderKey, failed: true });
        }
      })
      .catch(() => {
        if (active) setRendered({ key: renderKey, failed: true });
      });
    return () => { active = false; };
  }, [cleanFormula, renderKey, resolvedDisplay]);

  // Fallback: show raw formula in code block
  if (!formula || (rendered?.key === renderKey && rendered.failed)) {
    return resolvedDisplay ? (
      <pre className={`overflow-x-auto rounded bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] ${className}`}>
        <code>{formula}</code>
      </pre>
    ) : (
      <code className={`rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] ${className}`}>
        {formula}
      </code>
    );
  }

  // KaTeX container
  if (resolvedDisplay) {
    return (
      <span
        className={`katex-display block overflow-x-auto py-1 ${className}`}
        aria-label={`Formula: ${cleanFormula}`}
        aria-busy={rendered?.key !== renderKey}
        dangerouslySetInnerHTML={rendered?.key === renderKey && rendered.html ? { __html: rendered.html } : undefined}
      />
    );
  }

  return (
    <span
      className={`katex-inline ${className}`}
      aria-label={`Formula: ${cleanFormula}`}
      aria-busy={rendered?.key !== renderKey}
      dangerouslySetInnerHTML={rendered?.key === renderKey && rendered.html ? { __html: rendered.html } : undefined}
    />
  );
}
