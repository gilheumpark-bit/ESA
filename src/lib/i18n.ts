/**
 * ESVA 4-Language Internationalization
 * ------------------------------------
 * ko / en / ja / zh support with namespace-based key lookup.
 */

// ─── PART 1: Types ────────────────────────────────────────────

export type Lang = 'ko' | 'en' | 'ja' | 'zh';

export interface LangTexts {
  ko: string;
  en: string;
  ja?: string;
  zh?: string;
}

export const SUPPORTED_LANGS: Lang[] = ['ko', 'en', 'ja', 'zh'];

export const LANG_LABELS: Record<Lang, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
};

// ─── PART 2: Core L4 Helper ───────────────────────────────────

/**
 * 4-language lookup with fallback chain.
 * Falls back: requested lang -> en -> ko -> first available.
 */
export function L4(lang: Lang, texts: LangTexts): string {
  const direct = texts[lang];
  if (direct !== undefined && direct !== '') return direct;

  // Fallback chain
  if (lang !== 'en' && texts.en) return texts.en;
  if (lang !== 'ko' && texts.ko) return texts.ko;

  // Return whatever is available
  return texts.ko || texts.en || texts.ja || texts.zh || '';
}

// ─── PART 3: Translation Dictionary ───────────────────────────

export const translations: Record<string, Record<string, LangTexts>> = {
  common: {
    search: {
      ko: '검색',
      en: 'Search',
      ja: '検索',
      zh: '搜索',
    },
    calculate: {
      ko: '계산',
      en: 'Calculate',
      ja: '計算',
      zh: '计算',
    },
    receipt: {
      ko: '계산서',
      en: 'Receipt',
      ja: '計算書',
      zh: '计算单',
    },
    export: {
      ko: '내보내기',
      en: 'Export',
      ja: 'エクスポート',
      zh: '导出',
    },
    login: {
      ko: '로그인',
      en: 'Log in',
      ja: 'ログイン',
      zh: '登录',
    },
    logout: {
      ko: '로그아웃',
      en: 'Log out',
      ja: 'ログアウト',
      zh: '退出登录',
    },
    settings: {
      ko: '설정',
      en: 'Settings',
      ja: '設定',
      zh: '设置',
    },
    save: {
      ko: '저장',
      en: 'Save',
      ja: '保存',
      zh: '保存',
    },
    cancel: {
      ko: '취소',
      en: 'Cancel',
      ja: 'キャンセル',
      zh: '取消',
    },
    confirm: {
      ko: '확인',
      en: 'Confirm',
      ja: '確認',
      zh: '确认',
    },
    loading: {
      ko: '로딩 중...',
      en: 'Loading...',
      ja: '読み込み中...',
      zh: '加载中...',
    },
    error: {
      ko: '오류가 발생했습니다',
      en: 'An error occurred',
      ja: 'エラーが発生しました',
      zh: '发生了错误',
    },
    retry: {
      ko: '재시도',
      en: 'Retry',
      ja: '再試行',
      zh: '重试',
    },
  },

  calc: {
    input: {
      ko: '입력값',
      en: 'Input',
      ja: '入力',
      zh: '输入',
    },
    output: {
      ko: '결과',
      en: 'Output',
      ja: '出力',
      zh: '输出',
    },
    formula: {
      ko: '공식',
      en: 'Formula',
      ja: '公式',
      zh: '公式',
    },
    standard: {
      ko: '기준',
      en: 'Standard',
      ja: '基準',
      zh: '标准',
    },
    disclaimer: {
      ko: '본 계산 결과는 참고용이며, 법적 효력이 없습니다. 실제 적용 시 전문가와 상담하세요.',
      en: 'This calculation is for reference only and has no legal validity. Consult a professional before applying.',
      ja: 'この計算結果は参考用であり、法的効力はありません。実際の適用には専門家にご相談ください。',
      zh: '本计算结果仅供参考，无法律效力。实际应用时请咨询专业人士。',
    },
    unit: {
      ko: '단위',
      en: 'Unit',
      ja: '単位',
      zh: '单位',
    },
    precision: {
      ko: '정밀도',
      en: 'Precision',
      ja: '精度',
      zh: '精度',
    },
    history: {
      ko: '계산 이력',
      en: 'Calculation History',
      ja: '計算履歴',
      zh: '计算历史',
    },
  },

  search: {
    results: {
      ko: '검색 결과',
      en: 'Search Results',
      ja: '検索結果',
      zh: '搜索结果',
    },
    noResults: {
      ko: '검색 결과가 없습니다',
      en: 'No results found',
      ja: '検索結果がありません',
      zh: '未找到搜索结果',
    },
    didYouMean: {
      ko: '혹시 이것을 찾으셨나요?',
      en: 'Did you mean?',
      ja: 'もしかして？',
      zh: '您是不是要找？',
    },
    relatedCalc: {
      ko: '관련 계산기',
      en: 'Related Calculators',
      ja: '関連計算機',
      zh: '相关计算器',
    },
    placeholder: {
      ko: '계산기, 공식, 기준 검색...',
      en: 'Search calculators, formulas, standards...',
      ja: '計算機、公式、基準を検索...',
      zh: '搜索计算器、公式、标准...',
    },
    filters: {
      ko: '필터',
      en: 'Filters',
      ja: 'フィルター',
      zh: '筛选',
    },
  },

  tier: {
    free: {
      ko: '무료',
      en: 'Free',
      ja: '無料',
      zh: '免费',
    },
    pro: {
      ko: '프로',
      en: 'Pro',
      ja: 'プロ',
      zh: '专业版',
    },
    team: {
      ko: '팀',
      en: 'Team',
      ja: 'チーム',
      zh: '团队版',
    },
    enterprise: {
      ko: '기업',
      en: 'Enterprise',
      ja: 'エンタープライズ',
      zh: '企业版',
    },
    upgradeRequired: {
      ko: '이 기능을 사용하려면 플랜을 업그레이드하세요',
      en: 'Upgrade your plan to use this feature',
      ja: 'この機能を使用するにはプランをアップグレードしてください',
      zh: '请升级计划以使用此功能',
    },
  },
};

// ─── PART 4: createT Factory ──────────────────────────────────

/**
 * Create a translation function for a given language.
 * Supports dot-notation keys: "common.search", "calc.formula"
 *
 * @example
 * const t = createT('ko');
 * t('common.search'); // '검색'
 * t('calc.disclaimer'); // '본 계산 결과는...'
 */
export function createT(lang: Lang): (key: string) => string {
  return (key: string): string => {
    const parts = key.split('.');
    if (parts.length !== 2) return key;

    const [namespace, field] = parts;
    const nsDict = translations[namespace];
    if (!nsDict) return key;

    const texts = nsDict[field];
    if (!texts) return key;

    return L4(lang, texts);
  };
}

// ─── PART 5: Utilities ────────────────────────────────────────

/**
 * Detect language from Accept-Language header.
 */
export function detectLang(acceptLanguage?: string | null): Lang {
  if (!acceptLanguage) return 'ko';

  const normalized = acceptLanguage.toLowerCase();

  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('en')) return 'en';

  // Parse quality values
  const langs = normalized.split(',').map(part => {
    const [lang, q] = part.trim().split(';q=');
    return { lang: lang.trim(), quality: q ? parseFloat(q) : 1.0 };
  });

  langs.sort((a, b) => b.quality - a.quality);

  for (const { lang } of langs) {
    if (lang.startsWith('ko')) return 'ko';
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
  }

  return 'ko'; // ESVA default
}

/**
 * Check if a language is supported.
 */
export function isValidLang(lang: string): lang is Lang {
  return SUPPORTED_LANGS.includes(lang as Lang);
}
