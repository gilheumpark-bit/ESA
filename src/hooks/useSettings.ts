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
import type { Lang, ResponseLang } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

export type Country = 'KR' | 'US' | 'JP' | 'INT' | 'CN' | 'DE' | 'AU' | 'ME';
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
  INT: 'International (IEC)',
  CN: '中国 (GB)',
  DE: 'Deutschland (VDE)',
  AU: 'Australia (AS/NZS)',
  ME: 'Middle East (BS/IEC)',
};

export const COUNTRY_STANDARDS: Record<Country, string> = {
  KR: 'KEC',
  US: 'NEC',
  JP: 'JIS',
  INT: 'IEC',
  CN: 'GB',
  DE: 'VDE',
  AU: 'AS/NZS',
  ME: 'BS/IEC',
};

/** Countries with embedded, fail-closed calculator safety profiles. */
export const CALCULATION_COUNTRIES: readonly Country[] = ['KR', 'US', 'JP', 'INT'];

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
      // JA/ZH dictionaries exist, but the product surface is not fully wired.
      // Do not preserve a selection that would leave the visible control inert.
      language: parsed.language === 'en' ? 'en' : DEFAULTS.language,
      country: CALCULATION_COUNTRIES.includes(parsed.country as Country)
        ? parsed.country as Country
        : DEFAULTS.country,
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

/**
 * Read the persisted country without subscribing — for non-hook call sites
 * (e.g. useCalculator forwarding countryCode to /api/calculate). Bug M2.
 */
export function readStoredCountry(): Country {
  return loadSettings().country;
}

/** Output language currently supported end-to-end by chat/search/receipts. */
export function readStoredLanguage(): ResponseLang {
  return loadSettings().language === 'en' ? 'en' : 'ko';
}

// ---------------------------------------------------------------------------
// Same-page cross-instance sync (bug M1)
// ---------------------------------------------------------------------------
// 이 훅은 여러 곳(헤더·설정 드로어 등)에서 동시에 마운트된다. 예전 구현은
// 변경 시 인스턴스별 state 전체 객체를 통째로 저장해, 낡은 인스턴스가 다른
// 인스턴스의 변경(테마↔언어)을 덮어써 상호 원복시켰다. 이제는 ① 필드 단위
// read-merge-write 로 저장해 clobber 를 없애고 ② 모듈 레벨 구독으로 모든
// 인스턴스를 동기화한다. storage 이벤트는 다른 탭 동기화를 담당한다.
type SettingsListener = (s: ESASettings) => void;
const settingsListeners = new Set<SettingsListener>();

function applySettingsChange(patch: Partial<ESASettings>): void {
  // 항상 저장소에서 최신값을 다시 읽어 병합한다 — 낡은 인메모리 state 로
  // 다른 필드를 덮어쓰지 않는다.
  const next: ESASettings = { ...loadSettings(), ...patch };
  saveSettings(next);
  settingsListeners.forEach((listener) => listener(next));
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<ESASettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // Load on mount + subscribe to same-page and cross-tab updates
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSettings(loadSettings());
      setLoaded(true);
    });

    const listener: SettingsListener = (s) => setSettings(s);
    settingsListeners.add(listener);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelAnimationFrame(frame);
      settingsListeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setLanguage = useCallback((language: Lang) => {
    applySettingsChange({ language });
  }, []);

  const setCountry = useCallback((country: Country) => {
    applySettingsChange({ country });
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    applySettingsChange({ theme });
  }, []);

  return {
    ...settings,
    setLanguage,
    setCountry,
    setTheme,
    loaded,
  };
}
