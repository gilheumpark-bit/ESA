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
  /** 도면 파싱 (SLD / DXF / PDF) */
  DRAWING_PARSER: boolean;
  /** IPFS 타임스탬프 등록. 기존 환경 변수 호환을 위해 플래그 이름은 유지한다. */
  RECEIPT_NOTARIZE: boolean;
}

// ============================================================
// PART 2 — Defaults
// ============================================================

const FLAGS: FeatureFlags = {
  // 2026-07-20 ON: DXF/PDF 벡터 파서 실구현 + 끝점 결속(endpoint-snap) 수리 +
  // 미검증 판정 honest-HOLD 배선 완료로 기본 활성. (이전: Phase 2 예정으로 OFF)
  DRAWING_PARSER: true,
  RECEIPT_NOTARIZE: false,
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
