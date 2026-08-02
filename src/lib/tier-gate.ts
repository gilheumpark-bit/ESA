/**
 * ESVA Plan Gating System
 * -----------------------
 * Tier-based feature access with OPEN_BETA override.
 */

// ─── PART 1: Types ────────────────────────────────────────────

export type Tier = 'free' | 'pro' | 'team' | 'enterprise';

export type CalcDifficulty = 'basic' | 'intermediate' | 'advanced' | 'expert';

export interface TierLimits {
  calcPerDay: number;
  calcConcurrent: number;
  searchPerMonth: number;
  advancedCalc: boolean;
  excelExport: boolean;
  newsDelay: number;          // days of news delay (0 = realtime)
  collabUsers: number;
  notarizePerMonth: number;
  aiChatPerDay: number;
  savedCalcLimit: number;
  customFormulas: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  requiredTier?: Tier;
}

// ─── PART 2: Beta Flag ───────────────────────────────────────

/**
 * OPEN_BETA — 켜면 **요금제 게이트를 전부 연다.**
 *
 * 두 변수를 함께 본다.
 *   `OPEN_BETA`             서버 전용. API 라우트의 판정을 연다.
 *   `NEXT_PUBLIC_OPEN_BETA` 빌드 시 클라이언트 번들에 인라인된다.
 *
 * 왜 둘인가 — 서버 변수만으로는 **화면이 안 열린다.** 관리자 페이지는
 * `tier !== 'enterprise'` 로, 설정 페이지는 `tier === 'free'` 로 클라이언트에서
 * 막는데, 그 `tier` 는 `useAuth()` 가 들고 있고 서버 env 를 볼 수 없다.
 * `OPEN_BETA` 만 켜면 API 는 통과하는데 화면은 「엔터프라이즈 전용 기능」을
 * 띄운다 — 스위치가 있는데 절반만 닿는 상태다(§2.2 등록 ≠ 발화).
 *
 * 권한(authorization)은 열지 않는다. 관리자 API 는 `role === 'admin'` 을
 * 따로 확인하며 이 플래그와 무관하다 — 요금제와 권한은 다른 축이다.
 */
export const OPEN_BETA =
  process.env.OPEN_BETA === 'true' || process.env.NEXT_PUBLIC_OPEN_BETA === 'true';

/**
 * OPEN_BETA 일 때 사용자에게 부여하는 등급.
 *
 * `pro` 가 아니라 최상위다. `pro` 로 두면 `tier !== 'enterprise'` 로 막는
 * 화면(관리자)이 계속 닫혀 「전부 열었다」가 거짓이 된다.
 */
export const OPEN_BETA_TIER: Tier = 'enterprise';

// ─── PART 3: Tier Definitions ─────────────────────────────────

const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    calcPerDay: 10,
    calcConcurrent: 2,
    searchPerMonth: 100,
    advancedCalc: false,
    excelExport: false,
    newsDelay: 7,
    collabUsers: 0,
    notarizePerMonth: 0,
    aiChatPerDay: 5,
    savedCalcLimit: 10,
    customFormulas: false,
    apiAccess: false,
    prioritySupport: false,
  },
  pro: {
    calcPerDay: Infinity,
    calcConcurrent: 5,
    searchPerMonth: Infinity,
    advancedCalc: true,
    excelExport: true,
    newsDelay: 0,
    collabUsers: 1,
    notarizePerMonth: 10,
    aiChatPerDay: 100,
    savedCalcLimit: 500,
    customFormulas: true,
    apiAccess: false,
    prioritySupport: false,
  },
  team: {
    calcPerDay: Infinity,
    calcConcurrent: 10,
    searchPerMonth: Infinity,
    advancedCalc: true,
    excelExport: true,
    newsDelay: 0,
    collabUsers: 10,
    notarizePerMonth: 50,
    aiChatPerDay: 500,
    savedCalcLimit: 5000,
    customFormulas: true,
    apiAccess: true,
    prioritySupport: true,
  },
  enterprise: {
    calcPerDay: Infinity,
    calcConcurrent: 50,
    searchPerMonth: Infinity,
    advancedCalc: true,
    excelExport: true,
    newsDelay: 0,
    collabUsers: Infinity,
    notarizePerMonth: Infinity,
    aiChatPerDay: Infinity,
    savedCalcLimit: Infinity,
    customFormulas: true,
    apiAccess: true,
    prioritySupport: true,
  },
};

// ─── PART 4: Access Functions ─────────────────────────────────

/**
 * Get the limits for a given tier.
 * If OPEN_BETA is true, always returns Pro limits.
 */
function getTierLimits(tier: Tier): TierLimits {
  if (OPEN_BETA) return TIER_LIMITS.pro;
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}


/** Minimum tier required for each difficulty level */
const DIFFICULTY_MIN_TIER: Record<CalcDifficulty, Tier> = {
  basic: 'free',
  intermediate: 'free',
  advanced: 'pro',
  expert: 'pro',
};

const TIER_ORDER: Record<Tier, number> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

/**
 * Check if a tier meets the minimum required tier.
 */
export function isTierAtLeast(current: Tier, required: Tier): boolean {
  // 예전에는 `TIER_ORDER[required] <= TIER_ORDER.pro` 로 **pro 까지만** 열었다.
  // 그 조건은 team·enterprise 를 요구하는 기능이 생기는 순간 조용히 닫는다 —
  // 「전부 열었다」고 적어 두고 절반만 여는 스위치가 된다. 전부 연다.
  if (OPEN_BETA) return true;
  return TIER_ORDER[current] >= TIER_ORDER[required];
}

/**
 * Check if a user can access a calculation at a given difficulty.
 */
/**
 * 난이도·요금제 이름을 사용자가 읽는 말로 옮긴다.
 *
 * 이 문구는 계산기 페이지에 그대로 노출된다. 실측(2026-07-25)에서 한국어
 * 화면에 "advanced calculations require pro plan or higher" 가 영문 그대로
 * 떴다 — 요금제 안내는 결제 결정을 좌우하는 문장이라 화면 언어를 따라야 한다.
 */
const DIFFICULTY_KO: Record<CalcDifficulty, string> = {
  basic: '기초',
  intermediate: '중급',
  advanced: '고급',
  expert: '전문가',
};

const TIER_KO: Record<Tier, string> = {
  free: '무료',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
};

function upgradeReason(
  difficulty: CalcDifficulty,
  required: Tier,
  lang: 'ko' | 'en',
): string {
  return lang === 'ko'
    ? `${DIFFICULTY_KO[difficulty]} 난이도 계산기는 ${TIER_KO[required]} 요금제부터 사용할 수 있습니다.`
    : `${difficulty} calculations require ${required} plan or higher`;
}

export function checkCalcAccess(
  tier: Tier,
  calcDifficulty: CalcDifficulty,
  lang: 'ko' | 'en' = 'ko',
): AccessResult {
  if (OPEN_BETA) return { allowed: true };

  const requiredTier = DIFFICULTY_MIN_TIER[calcDifficulty];

  if (!isTierAtLeast(tier, requiredTier)) {
    return {
      allowed: false,
      reason: upgradeReason(calcDifficulty, requiredTier, lang),
      requiredTier,
    };
  }

  const limits = getTierLimits(tier);
  if (!limits.advancedCalc && (calcDifficulty === 'advanced' || calcDifficulty === 'expert')) {
    return {
      allowed: false,
      reason: upgradeReason(calcDifficulty, 'pro', lang),
      requiredTier: 'pro',
    };
  }

  return { allowed: true };
}

/**
 * **여기 있던 다섯은 지웠다** — `checkFeatureAccess`·`checkDailyUsage`·
 * `formatLimit`·`getTierDisplayName`·`ALL_TIERS` 전부 호출처 0 이었다
 * (2026-07-29 실측). 요금제가 팔리기 시작하면 다시 필요하겠지만, 그때
 * 필요한 것은 이 서명이 아니라 **사용량을 세는 저장소**다. 지금 형태의
 * `checkDailyUsage(tier, feature, currentUsage)` 는 currentUsage 를
 * 호출자가 주게 되어 있어, 정작 어려운 부분이 없는 채로 다 있는 것처럼
 * 보였다. 일일 한도(`calcPerDay`·`aiChatPerDay`)는 표에 남겨 둔다 —
 * 제품 결정이고, 어느 화면에도 광고되지 않아 깨진 약속은 아니다.
 * 대장: `docs/DORMANT_MANIFEST.md`.
 */
