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
 * 플래그별 환경 변수 값.
 *
 * Next 는 `process.env.NEXT_PUBLIC_X` 처럼 **이름을 그대로 적은 참조만** 브라우저
 * 번들에 넣는다. 전에는 `process.env[\`NEXT_PUBLIC_FF_${flag}\`]` 로 읽어서
 * 서버 라우트는 환경 값을 따르는데 화면은 늘 기본값이었다 — 환경에서 도면
 * 파서를 꺼도 DXF/PDF 탭이 남고, 타임스탬프 등록을 켜도 버튼이 안 떴다.
 * 플래그를 더하면 여기에 한 줄을 더한다(빠뜨리면 타입 검사가 막는다).
 */
function envFlag(flag: keyof FeatureFlags): string | undefined {
  switch (flag) {
    case 'DRAWING_PARSER': return process.env.NEXT_PUBLIC_FF_DRAWING_PARSER;
    case 'RECEIPT_NOTARIZE': return process.env.NEXT_PUBLIC_FF_RECEIPT_NOTARIZE;
    default: {
      const unhandled: never = flag;
      return unhandled;
    }
  }
}

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
  return isFeatureEnabledServer(flag);
}

/** 서버 컴포넌트 / Route Handler용 (localStorage 없음) */
export function isFeatureEnabledServer(flag: keyof FeatureFlags): boolean {
  const envVal = envFlag(flag);
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;
  return FLAGS[flag];
}
