'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Non-payment modal shell. Focus remains inside the dialog and returns to its trigger. */
export function FeatureDialog({ label, onClose, busy = false, children }: {
  label: string; onClose: () => void; busy?: boolean; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose), pending = useRef(busy);
  useEffect(() => { close.current = onClose; pending.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = root.current;
    if (!node) return;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0 && !element.closest('[hidden]'));
    (focusables()[0] ?? node).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!pending.current) close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusables(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); node.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', key);
    return () => { node.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onPointerDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} aria-busy={busy}
      className="max-h-[90dvh] w-full min-w-0 max-w-md overflow-y-auto rounded-2xl bg-[var(--bg-primary)] p-5 text-[var(--text-primary)] shadow-xl sm:p-6">
      {children}
    </div>
  </div>;
}
