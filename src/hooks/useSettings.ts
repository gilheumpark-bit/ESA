'use client';

/**
 * ESVA Settings Persistence Hook
 * ------------------------------
 * Manages user preferences (language, country, theme) with localStorage.
 *
 * PART 1: Types & constants
 * PART 2: Hook implementation
 */

import { useState, useEffect, useCallback } from 'react';
import type { Lang } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

export type Country = 'KR' | 'US' | 'JP' | 'CN' | 'DE' | 'AU' | 'ME';
export type Theme = 'light' | 'dark' | 'system';

export interface ESASettings {
  language: Lang;
  country: Country;
  theme: Theme;
}

export interface UseSettingsReturn extends ESASettings {
  setLanguage: (lang: Lang) => void;
  setCountry: (country: Country) => void;
  setTheme: (theme: Theme) => void;
  loaded: boolean;
}

const STORAGE_KEY = 'esa-settings';

const DEFAULTS: ESASettings = {
  language: 'ko',
  country: 'KR',
  theme: 'system',
};

export const COUNTRY_LABELS: Record<Country, string> = {
  KR: '한국 (KEC)',
  US: 'USA (NEC)',
  JP: '日本 (JIS)',
  CN: '中国 (GB)',
  DE: 'Deutschland (VDE)',
  AU: 'Australia (AS/NZS)',
  ME: 'Middle East (BS/IEC)',
};

export const COUNTRY_STANDARDS: Record<Country, string> = {
  KR: 'KEC',
  US: 'NEC',
  JP: 'JIS',
  CN: 'GB',
  DE: 'VDE',
  AU: 'AS/NZS',
  ME: 'BS/IEC',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Hook Implementation
// ═══════════════════════════════════════════════════════════════════════════════

function loadSettings(): ESASettings {
  if (typeof window === 'undefined') return DEFAULTS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ESASettings>;
    return {
      language: parsed.language ?? DEFAULTS.language,
      country: parsed.country ?? DEFAULTS.country,
      theme: parsed.theme ?? DEFAULTS.theme,
    };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: ESASettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<ESASettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  // Auto-save on change (skip initial mount)
  useEffect(() => {
    if (!loaded) return;
    saveSettings(settings);
  }, [settings, loaded]);

  const setLanguage = useCallback((language: Lang) => {
    setSettings(prev => ({ ...prev, language }));
  }, []);

  const setCountry = useCallback((country: Country) => {
    setSettings(prev => ({ ...prev, country }));
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setSettings(prev => ({ ...prev, theme }));
  }, []);

  return {
    ...settings,
    setLanguage,
    setCountry,
    setTheme,
    loaded,
  };
}
