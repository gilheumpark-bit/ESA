/**
 * ESVA A/B Test Framework — 1급 실험 인프라
 * -------------------------------------------
 * feature flag 기반 A/B 테스트 + 전환율 자동 추적.
 * 코드 배포 없이 변형 활성화/비활성화 가능.
 *
 * 사용법:
 *   const variant = getVariant('calc-result-layout');
 *   if (variant === 'B') { /* 새 레이아웃 */ }
 *   // 전환 발생 시:
 *   trackConversion('calc_complete', undefined, variant);
 *
 * PART 1: Experiment definitions
 * PART 2: Variant assignment
 * PART 3: Results analysis
 */

import { trackEvent } from './analytics';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Experiment Definitions
// ═══════════════════════════════════════════════════════════════════════════════

export interface Experiment {
  id: string;
  name: string;
  /** 변형 목록 (A = control, B = treatment) */
  variants: string[];
  /** 각 변형의 트래픽 비율 (합계 = 1.0) */
  weights: number[];
  /** 활성 여부 */
  active: boolean;
  /** 시작일 */
  startDate: string;
  /** 종료일 (null = 무기한) */
  endDate?: string;
  /** 측정할 전환 목표 */
  conversionGoal: string;
}

/**
 * 실험 레지스트리.
 * 새 실험 추가 시 여기에 등록.
 */
const EXPERIMENTS: Experiment[] = [
  {
    id: 'calc-labor-illusion',
    name: '계산기 노동 착시 (2초 딜레이 + 진행 메시지)',
    variants: ['A', 'B'],
    weights: [0.5, 0.5],
    active: true,
    startDate: '2026-04-12',
    conversionGoal: 'calc_complete',
  },
  {
    id: 'report-pdf-position',
    name: 'PDF 다운로드 버튼 위치 (상단 vs 하단)',
    variants: ['A', 'B'],
    weights: [0.5, 0.5],
    active: false,
    startDate: '2026-04-12',
    conversionGoal: 'export_pdf',
  },
  {
    id: 'search-empty-state',
    name: '검색 결과 0건 시 추천 (없음 vs 인기 계산기)',
    variants: ['A', 'B'],
    weights: [0.5, 0.5],
    active: true,
    startDate: '2026-04-12',
    conversionGoal: 'search_success',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Variant Assignment (변형 배정)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 사용자에게 변형 배정.
 * 세션 내 일관성 유지 (같은 세션 = 같은 변형).
 */
export function getVariant(experimentId: string): string {
  if (typeof window === 'undefined') return 'A';

  const exp = EXPERIMENTS.find(e => e.id === experimentId);
  if (!exp || !exp.active) return 'A';

  // 세션 스토리지에서 기존 배정 확인
  const storageKey = `esva-ab-${experimentId}`;
  const stored = sessionStorage.getItem(storageKey);
  if (stored && exp.variants.includes(stored)) return stored;

  // 새로 배정 (가중치 기반 랜덤)
  const rand = Math.random();
  let cumulative = 0;
  let assigned = exp.variants[0];

  for (let i = 0; i < exp.variants.length; i++) {
    cumulative += exp.weights[i];
    if (rand <= cumulative) {
      assigned = exp.variants[i];
      break;
    }
  }

  // 저장 + 이벤트 기록
  sessionStorage.setItem(storageKey, assigned);
  trackEvent('engagement', 'ab_assignment', {
    label: experimentId,
    metadata: { variant: assigned, experimentName: exp.name },
  });

  return assigned;
}

/**
 * 실험이 활성 상태인지 확인.
 */
export function isExperimentActive(experimentId: string): boolean {
  const exp = EXPERIMENTS.find(e => e.id === experimentId);
  if (!exp || !exp.active) return false;

  const now = new Date().toISOString().slice(0, 10);
  if (now < exp.startDate) return false;
  if (exp.endDate && now > exp.endDate) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Results Analysis
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExperimentResult {
  experimentId: string;
  variants: {
    name: string;
    impressions: number;
    conversions: number;
    conversionRate: number;
  }[];
  winner?: string;
  confidence: number;
}

/**
 * 로컬 이벤트 데이터에서 실험 결과 분석.
 * 실제 프로덕션에서는 서버사이드 분석 사용.
 */
export function analyzeExperiment(experimentId: string): ExperimentResult | null {
  if (typeof window === 'undefined') return null;

  const exp = EXPERIMENTS.find(e => e.id === experimentId);
  if (!exp) return null;

  try {
    const events: { category: string; action: string; variant?: string }[] =
      JSON.parse(localStorage.getItem('esva-events') ?? '[]');

    const variantStats = exp.variants.map(v => {
      const impressions = events.filter(
        e => e.action === 'ab_assignment' && e.variant === v
      ).length;
      const conversions = events.filter(
        e => e.action === `conversion:${exp.conversionGoal}` && e.variant === v
      ).length;

      return {
        name: v,
        impressions,
        conversions,
        conversionRate: impressions > 0 ? conversions / impressions : 0,
      };
    });

    // 간이 승자 판정 (전환율 차이 > 5% + 최소 30건 데이터)
    const sorted = [...variantStats].sort((a, b) => b.conversionRate - a.conversionRate);
    const hasEnoughData = sorted.every(v => v.impressions >= 30);
    const rateDiff = sorted.length >= 2
      ? sorted[0].conversionRate - sorted[1].conversionRate
      : 0;

    return {
      experimentId,
      variants: variantStats,
      winner: hasEnoughData && rateDiff > 0.05 ? sorted[0].name : undefined,
      confidence: hasEnoughData ? Math.min(rateDiff * 10, 0.99) : 0,
    };
  } catch {
    return null;
  }
}

/** 전체 실험 목록 */
export function getExperiments(): Experiment[] {
  return EXPERIMENTS;
}
