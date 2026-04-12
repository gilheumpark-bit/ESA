// ============================================================
// ESVA Feature Flags — Lightweight feature flag system
// ============================================================
// No external service. Flags defined here, checked anywhere.
// Priority: localStorage override > env var > default.
// 원본: eh-universe-web/src/lib/feature-flags.ts

// ============================================================
// PART 1 — Flag Definitions
// ============================================================

export interface FeatureFlags {
  /** 도면 파싱 (SLD / DXF) — Phase 2 */
  DRAWING_PARSER: boolean;
  /** BYOK 멀티키 관리 UI */
  BYOK_MULTI_KEY: boolean;
  /** 엑셀 내보내기 */
  EXCEL_EXPORT: boolean;
  /** AI 검색 (법규 RAG) */
  AI_SEARCH: boolean;
  /** 커뮤니티 게시판 */
  COMMUNITY: boolean;
  /** 오프라인 계산 캐싱 */
  OFFLINE_CACHE: boolean;
  /** 프로젝트 관리 */
  PROJECTS: boolean;
  /** Receipt IPFS 공증 */
  RECEIPT_NOTARIZE: boolean;
  /** 현장 모드 (모바일 최적화) */
  FIELD_MODE: boolean;
  /** AI 응답 브라우저 캐시 (토큰 비용 절감) */
  AI_RESPONSE_CACHE: boolean;
}

// ============================================================
// PART 2 — Defaults
// ============================================================

const FLAGS: FeatureFlags = {
  DRAWING_PARSER: false,
  BYOK_MULTI_KEY: true,
  EXCEL_EXPORT: true,
  AI_SEARCH: true,
  COMMUNITY: true,
  OFFLINE_CACHE: true,
  PROJECTS: true,
  RECEIPT_NOTARIZE: false,
  FIELD_MODE: true,
  AI_RESPONSE_CACHE: true,
};

// ============================================================
// PART 3 — Check Functions
// ============================================================

/**
 * 피처 플래그 확인.
 * 우선순위: localStorage override > env NEXT_PUBLIC_FF_{FLAG} > 기본값.
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem(`ff_${flag}`);
    if (override === 'true') return true;
    if (override === 'false') return false;
  }

  const envKey = `NEXT_PUBLIC_FF_${flag}`;
  const envVal = typeof process !== 'undefined' ? process.env[envKey] : undefined;
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;

  return FLAGS[flag];
}

/** 서버 컴포넌트 / Route Handler용 (localStorage 없음) */
export function isFeatureEnabledServer(flag: keyof FeatureFlags): boolean {
  const envKey = `NEXT_PUBLIC_FF_${flag}`;
  const envVal = typeof process !== 'undefined' ? process.env[envKey] : undefined;
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;
  return FLAGS[flag];
}

/** 모든 플래그 현재값 조회 */
export function getAllFlags(): FeatureFlags {
  const result = { ...FLAGS };
  for (const key of Object.keys(result) as (keyof FeatureFlags)[]) {
    result[key] = isFeatureEnabled(key);
  }
  return result;
}
