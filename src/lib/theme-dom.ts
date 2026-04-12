/**
 * Theme ↔ html.dark — single source for ThemeToggle and ThemeInitScript.
 */
import type { Theme } from '@/hooks/useSettings';

export function shouldUseDarkAppearance(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (shouldUseDarkAppearance(theme)) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}
