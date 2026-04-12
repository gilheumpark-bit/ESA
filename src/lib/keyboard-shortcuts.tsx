/**
 * ESVA Global Keyboard Shortcuts
 * ──────────────────────────────
 * useKeyboardShortcuts() — registers global hotkeys
 * ShortcutHelp — React component displaying available shortcuts
 *
 * PART 1: Shortcut definitions
 * PART 2: useKeyboardShortcuts hook
 * PART 3: ShortcutHelp component
 */

'use client';

import { useEffect, useCallback, useState } from 'react';

// ─── PART 1: Shortcut Definitions ──────────────────────────────

export interface ShortcutDef {
  /** Keyboard shortcut display label */
  keys: string;
  /** Description (Korean) */
  description: string;
  /** Description (English) */
  descriptionEn: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: 'Ctrl+K / Cmd+K', description: '검색창 포커스', descriptionEn: 'Focus search bar' },
  { keys: 'Ctrl+Enter', description: '계산 실행', descriptionEn: 'Execute calculation' },
  { keys: 'Escape', description: '모달/드롭다운 닫기', descriptionEn: 'Close modal/dropdown' },
  { keys: '?', description: '단축키 도움말 표시', descriptionEn: 'Show shortcuts help' },
];

// ─── PART 2: useKeyboardShortcuts Hook ─────────────────────────

interface ShortcutHandlers {
  onSearch?: () => void;
  onExecute?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}): {
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
} {
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Ctrl+K / Cmd+K — focus search bar
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // Ctrl+Enter — execute calculation
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handlers.onExecute?.();
        return;
      }

      // Escape — close modal/dropdown
      if (e.key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
          return;
        }
        handlers.onEscape?.();
        return;
      }

      // ? — show shortcut help (only when not in input)
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }
    },
    [handlers, showHelp],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

// ─── PART 3: ShortcutHelp Component ────────────────────────────

export function ShortcutHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            단축키 / Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-4">
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-700 dark:text-gray-300">
                    {s.keys}
                  </kbd>
                </td>
                <td className="py-2 text-gray-600 dark:text-gray-400">
                  {s.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-4 text-xs text-gray-400 text-center">
          Press <kbd className="px-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
