'use client';

/**
 * Dark Mode Toggle — 3-state: Light / Dark / System
 *
 * Reads/writes to localStorage 'esa-settings' (via useSettings).
 * Applies 'dark' class to <html> element (see src/lib/theme-dom.ts).
 */

import { useEffect, useCallback } from 'react';
import { useSettings, type Theme } from '@/hooks/useSettings';
import { applyThemeToDocument } from '@/lib/theme-dom';

const THEME_CYCLE: Theme[] = ['light', 'dark', 'system'];

const THEME_ICONS: Record<Theme, string> = {
  light: '\u2600\uFE0F',
  dark: '\uD83C\uDF19',
  system: '\uD83D\uDCBB',
};

const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export default function ThemeToggle() {
  const { theme, setTheme, loaded } = useSettings();

  useEffect(() => {
    if (!loaded) return;
    applyThemeToDocument(theme);
  }, [theme, loaded]);

  useEffect(() => {
    if (!loaded || theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyThemeToDocument('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, loaded]);

  const cycleTheme = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  }, [theme, setTheme]);

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="flex h-11 min-h-[44px] items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--text-primary)] sm:h-8 sm:min-h-0 sm:px-2"
      aria-label={`Theme: ${THEME_LABELS[theme]}`}
      title={`Theme: ${THEME_LABELS[theme]}`}
    >
      <span className="text-sm">{THEME_ICONS[theme]}</span>
      <span className="hidden sm:inline">{THEME_LABELS[theme]}</span>
    </button>
  );
}
