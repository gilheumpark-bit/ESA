'use client';

/**
 * Dark Mode Toggle — 3-state: Light / Dark / System
 *
 * Reads/writes to localStorage 'esa-settings' (via useSettings).
 * Applies 'dark' class to <html> element (see src/lib/theme-dom.ts).
 */

import { useEffect, useCallback } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useSettings, type Theme } from '@/hooks/useSettings';
import { applyThemeToDocument } from '@/lib/theme-dom';

const THEME_CYCLE: Theme[] = ['light', 'dark', 'system'];

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const THEME_LABELS: Record<Theme, string> = {
  light: '밝게',
  dark: '어둡게',
  system: '시스템',
};

export default function ThemeToggle() {
  const { theme, setTheme, loaded } = useSettings();
  const ThemeIcon = THEME_ICONS[theme];

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
    // 클릭 즉시 DOM 적용 — effect는 useSettings의 rAF 로드(loaded) 게이트에
    // 걸려 백그라운드 탭에선 영구 미발화할 수 있다(실측: 라벨은 바뀌는데
    // html.dark 무변이). 사용자 제스처 시점 직접 적용으로 죽은 컨트롤 차단.
    applyThemeToDocument(next);
  }, [theme, setTheme]);

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="flex h-11 min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--text-primary)] sm:h-8 sm:min-h-0 sm:px-2"
      aria-label={`테마: ${THEME_LABELS[theme]}`}
      title={`테마: ${THEME_LABELS[theme]}`}
    >
      <ThemeIcon size={14} aria-hidden />
      {/* nowrap — "시스/템"·"어둡/게" 글자 분리 방지 */}
      <span className="hidden whitespace-nowrap sm:inline">{THEME_LABELS[theme]}</span>
    </button>
  );
}
