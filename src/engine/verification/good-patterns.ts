/**
 * ESVA Good Pattern Catalog — 전기 설계 우수 패턴 탐지
 * ─────────────────────────────────────────────────────
 * 설계에서 발견되는 우수 사례를 점수에 반영 (감점이 아닌 가점).
 * 원본 패턴: eh-universe-web/packages/quill-engine/src/good-pattern-catalog.ts
 *
 * PART 1: Types
 * PART 2: Pattern Catalog
 * PART 3: Detection Engine
 */

// =========================================================================
// PART 1 — Types
// =========================================================================

export interface GoodPattern {
  id: string;
  title: string;
  category: GoodPatternCategory;
  /** 가점 (1~5) */
  bonus: number;
  /** 탐지 조건 */
  detect: (params: Record<string, unknown>) => boolean;
}

export type GoodPatternCategory =
  | 'safety'       // 안전 우수 사례
  | 'efficiency'   // 효율/경제성
  | 'reliability'  // 신뢰성/여유
  | 'standards'    // 기준 준수 우수
  | 'documentation'; // 문서화/추적성

export interface GoodPatternResult {
  patternId: string;
  title: string;
  category: GoodPatternCategory;
  bonus: number;
  detected: boolean;
}

export interface GoodPatternReport {
  detected: GoodPatternResult[];
  totalBonus: number;
  detectedCount: number;
  totalPatterns: number;
}

// =========================================================================
// PART 2 — Pattern Catalog
// =========================================================================

const PATTERNS: GoodPattern[] = [
  // ── 안전 ──
  {
    id: 'GP-S01', title: '접지선 별도 분리 시공', category: 'safety', bonus: 3,
    detect: (p) => p['separateGroundConductor'] === true,
  },
  {
    id: 'GP-S02', title: '2중 접지 시스템', category: 'safety', bonus: 4,
    detect: (p) => p['dualGrounding'] === true,
  },
  {
    id: 'GP-S03', title: 'SPD(서지보호장치) 시설', category: 'safety', bonus: 3,
    detect: (p) => p['hasSPD'] === true,
  },
  {
    id: 'GP-S04', title: '아크차단기(AFCI) 적용', category: 'safety', bonus: 4,
    detect: (p) => p['hasAFCI'] === true,
  },
  {
    id: 'GP-S05', title: '감전보호 등전위 본딩', category: 'safety', bonus: 3,
    detect: (p) => p['equipotentialBonding'] === true,
  },

  // ── 효율/경제성 ──
  {
    id: 'GP-E01', title: '역률 95% 이상', category: 'efficiency', bonus: 3,
    detect: (p) => {
      const pf = num(p['powerFactor']);
      return pf !== null && pf >= 0.95;
    },
  },
  {
    id: 'GP-E02', title: '고효율 변압기 적용', category: 'efficiency', bonus: 3,
    detect: (p) => p['highEfficiencyTransformer'] === true,
  },
  {
    id: 'GP-E03', title: 'LED 조명 100% 적용', category: 'efficiency', bonus: 2,
    detect: (p) => p['allLED'] === true,
  },
  {
    id: 'GP-E04', title: '최적 케이블 규격 (여유율 10~20%)', category: 'efficiency', bonus: 2,
    detect: (p) => {
      const margin = num(p['ampacityMargin']);
      return margin !== null && margin >= 10 && margin <= 20;
    },
  },

  // ── 신뢰성 ──
  {
    id: 'GP-R01', title: '주간선 이중화', category: 'reliability', bonus: 5,
    detect: (p) => p['dualFeeder'] === true,
  },
  {
    id: 'GP-R02', title: '비상발전기 연동', category: 'reliability', bonus: 4,
    detect: (p) => p['emergencyGenerator'] === true,
  },
  {
    id: 'GP-R03', title: 'UPS 시설', category: 'reliability', bonus: 3,
    detect: (p) => p['hasUPS'] === true,
  },

  // ── 기준 준수 우수 ──
  {
    id: 'GP-C01', title: '전압강하 기준 50% 이내 달성', category: 'standards', bonus: 3,
    detect: (p) => {
      const vd = num(p['voltageDropPercent']);
      const limit = num(p['vdLimit']);
      return vd !== null && limit !== null && vd <= limit * 0.5;
    },
  },
  {
    id: 'GP-C02', title: '다국가 기준 교차 검증', category: 'standards', bonus: 4,
    detect: (p) => p['crossCountryVerified'] === true,
  },

  {
    id: 'GP-S06', title: '고조파 필터 설치 (VFD > 50kW)', category: 'safety', bonus: 4,
    detect: (p) => {
      const vfdPower = num(p['vfdPower_kW']);
      if (vfdPower === null || vfdPower <= 50) return false;
      return p['harmonicFilterInstalled'] === true;
    },
  },
  {
    id: 'GP-R04', title: '뇌보호 서지 협조 (SPD+접지+본딩)', category: 'reliability', bonus: 4,
    detect: (p) =>
      p['hasSPD'] === true &&
      num(p['groundResistance']) !== null &&
      (num(p['groundResistance']) ?? Infinity) <= 10 &&
      p['equipotentialBonding'] === true,
  },

  // ── 문서화/추적성 ──
  {
    id: 'GP-D01', title: 'Receipt 공증 (IPFS)', category: 'documentation', bonus: 3,
    detect: (p) => typeof p['receiptCID'] === 'string' && (p['receiptCID'] as string).length > 0,
  },
  {
    id: 'GP-D02', title: '기준서 버전+조항 완전 명시', category: 'documentation', bonus: 2,
    detect: (p) =>
      typeof p['standardVersion'] === 'string' && p['standardVersion'] !== '' &&
      typeof p['standardClause'] === 'string' && p['standardClause'] !== '',
  },
  {
    id: 'GP-D03', title: '수식 전개 과정 포함', category: 'documentation', bonus: 2,
    detect: (p) => typeof p['formulaLatex'] === 'string' && (p['formulaLatex'] as string).length > 10,
  },
];

// =========================================================================
// PART 3 — Detection Engine
// =========================================================================

/** 전체 우수 패턴 탐지 */
export function detectGoodPatterns(params: Record<string, unknown>): GoodPatternReport {
  const results: GoodPatternResult[] = PATTERNS.map(pat => ({
    patternId: pat.id,
    title: pat.title,
    category: pat.category,
    bonus: pat.bonus,
    detected: pat.detect(params),
  }));

  const detected = results.filter(r => r.detected);

  return {
    detected: results,
    totalBonus: detected.reduce((sum, r) => sum + r.bonus, 0),
    detectedCount: detected.length,
    totalPatterns: PATTERNS.length,
  };
}

/** 카테고리별 탐지 */
export function detectByCategory(
  category: GoodPatternCategory,
  params: Record<string, unknown>,
): GoodPatternResult[] {
  return PATTERNS
    .filter(p => p.category === category)
    .map(pat => ({
      patternId: pat.id,
      title: pat.title,
      category: pat.category,
      bonus: pat.bonus,
      detected: pat.detect(params),
    }));
}

/** 패턴 목록 조회 (UI 표시용) */
export function getPatternCatalog(): Array<{ id: string; title: string; category: GoodPatternCategory; bonus: number }> {
  return PATTERNS.map(p => ({ id: p.id, title: p.title, category: p.category, bonus: p.bonus }));
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  return null;
}
