/**
 * KEC Extended DSL — 50+ Articles
 * ─────────────────────────────────
 * 전기설비기술기준(KEC) 주요 조항을 실행 가능한 Condition Tree로 확장.
 *
 * PART 1: Imports & helpers
 * PART 2: KEC 130 — 전압구분
 * PART 3: KEC 210 — 배선일반
 * PART 4: KEC 211 — 배선방법
 * PART 5: KEC 220 — 부하산정
 * PART 6: KEC 230 — 전선/케이블
 * PART 7: KEC 232 — 허용전류 확장
 * PART 8: KEC 234 — 조명
 * PART 9: KEC 240 — 보호
 * PART 10: KEC 311 — 수변전
 * PART 11: KEC 341 — 변압기
 * PART 12: KEC 351 — 수변전설비
 * PART 13: KEC 410 — 접지일반
 * PART 14: KEC 502 — 신재생
 * PART 15: KEC 520 — ESS
 * PART 16: Registry & evaluator export
 */

import {
  CodeArticle,
  Condition,
  JudgmentResult,
  evaluateCondition,
  makePass,
  makeFail,
  makeHold,
} from './types';

// ─── PART 1: Helpers ───────────────────────────────────────────

function buildArticle(
  id: string,
  article: string,
  title: string,
  conditions: Condition[],
  relatedClauses?: CodeArticle['relatedClauses'],
): CodeArticle {
  return {
    id,
    country: 'KR',
    standard: 'KEC',
    article,
    title,
    conditions,
    relatedClauses,
    effectiveDate: '2021-01-01',
    version: '2021',
  };
}

function cond(
  param: string,
  operator: '<=' | '>=' | '==' | '<' | '>',
  value: number,
  unit: string,
  note: string,
  result: 'PASS' | 'FAIL' = 'PASS',
): Condition {
  return { param, operator, value, unit, result, note };
}

function simpleEval(
  art: CodeArticle,
  params: Record<string, number>,
): JudgmentResult {
  const missing = art.conditions
    .map((c) => c.param)
    .filter((p) => params[p] == null || !Number.isFinite(params[p]));

  if (missing.length > 0) {
    return makeHold(art, [...new Set(missing)]);
  }

  const matched: Condition[] = [];
  const failed: Condition[] = [];

  for (const c of art.conditions) {
    if (evaluateCondition(c, params[c.param])) {
      matched.push(c);
    } else {
      failed.push(c);
    }
  }

  if (failed.length === 0) {
    return makePass(art, matched);
  }
  return makeFail(art, matched, failed);
}

// ─── PART 2: KEC 130 — 전압구분 ───────────────────────────────

export const KEC_130_1 = buildArticle('KEC-130.1', '130.1', '저압의 구분 — 교류 1000V 이하', [
  cond('voltage', '<=', 1000, 'V', '교류 저압: 1000V 이하'),
]);

export const KEC_130_2 = buildArticle('KEC-130.2', '130.2', '저압의 구분 — 직류 1500V 이하', [
  cond('voltage', '<=', 1500, 'V', '직류 저압: 1500V 이하'),
]);

export const KEC_130_3 = buildArticle('KEC-130.3', '130.3', '특별저압 — 교류 50V 이하', [
  cond('voltage', '<=', 50, 'V', '특별저압(교류): 50V 이하'),
]);

export const KEC_130_4 = buildArticle('KEC-130.4', '130.4', '특별저압 — 직류 120V 이하', [
  cond('voltage', '<=', 120, 'V', '특별저압(직류): 120V 이하'),
]);

// ─── PART 3: KEC 210 — 배선일반 ───────────────────────────────

export const KEC_210_1 = buildArticle('KEC-231.3.1', '231.3.1', '저압 옥내배선의 사용전선', [
  cond('crossSection', '>=', 1.5, 'mm²', '옥내배선 최소 단면적 1.5mm² 이상'),
]);

export const KEC_210_2 = buildArticle('KEC-210.2', '210.2', '배선의 사용전선 — 조명 분기 최소', [
  cond('crossSection', '>=', 1.5, 'mm²', '조명 분기회로 최소 1.5mm²'),
]);

export const KEC_210_3 = buildArticle('KEC-210.3', '210.3', '배선의 사용전선 — 동력 분기 최소', [
  cond('crossSection', '>=', 2.5, 'mm²', '동력 분기회로 최소 2.5mm²'),
]);

// ─── PART 4: KEC 232 — 배선설비(공사방법) ─────────────────────
//
// 이 넷은 `211.1~211.4` 로 등록돼 있었다. 현행 211 은 **감전에 대한 보호**고
// 공사방법은 232 다(232.11 합성수지관 · 232.12 금속관 · 232.41 케이블트레이 ·
// 232.10 전선관시스템). 번호가 실재해서 실재 게이트는 통과했고, 표제 정합
// 게이트를 붙이고서야 드러났다. 2026-07-27 재번호.
//
// kec-extended 도 같은 공사종류를 각자 정의하고 있어서 조건을 여기로 합쳤다 —
// 등록부의 `if (!has)` 때문에 두 곳에 두면 kec-extended 쪽이 통째로 버려진다.

export const KEC_232_11 = buildArticle('KEC-232.11', '232.11', '합성수지관공사', [
  cond('conduitFillRatio', '<=', 48, '%', '전선 점유율 48% 이하 (합성수지관)'),
  cond('pvcConduit', '==', 1, 'bool', 'CD관/PF관 사용. 콘크리트 매입 시 CD관 사용'),
]);

export const KEC_232_12 = buildArticle('KEC-232.12', '232.12', '금속관공사', [
  cond('conduitFillRatio', '<=', 48, '%', '전선 점유율 48% 이하 (금속관)'),
  cond('metalConduit', '==', 1, 'bool', '금속관 내 절연전선 사용, 관 내경에 맞는 전선 수'),
]);

export const KEC_232_41 = buildArticle('KEC-232.41', '232.41', '케이블트레이공사', [
  cond('trayFillRatio', '<=', 50, '%', '케이블 트레이 충전율 50% 이하'),
]);

export const KEC_232_10 = buildArticle('KEC-232.10', '232.10', '전선관시스템', [
  cond('bendCount', '<=', 4, '개', '전선관 1구간 굴곡 4개 이하'),
]);

// ─── PART 5: KEC 220 — 부하산정 ───────────────────────────────

export const KEC_220_1 = buildArticle('KEC-220.1', '220.1', '주거용 부하 — 기본 부하밀도', [
  cond('loadDensity', '>=', 30, 'VA/m²', '주거용 기본 부하밀도 30 VA/m² 이상'),
]);

export const KEC_220_2 = buildArticle('KEC-220.2', '220.2', '사무실 부하 — 기본 부하밀도', [
  cond('loadDensity', '>=', 50, 'VA/m²', '사무실 기본 부하밀도 50 VA/m² 이상'),
]);

export const KEC_220_3 = buildArticle('KEC-220.3', '220.3', '상업시설 부하 — 기본 부하밀도', [
  cond('loadDensity', '>=', 40, 'VA/m²', '상업시설 기본 부하밀도 40 VA/m² 이상'),
]);

export const KEC_220_4 = buildArticle('KEC-220.4', '220.4', '수용률 적용 — 최소 수용률', [
  cond('demandFactor', '>=', 0.6, '', '수용률 60% 이상 적용'),
]);

// ─── PART 6: KEC 230 — 전선/케이블 ────────────────────────────

export const KEC_230_1 = buildArticle('KEC-230.1', '230.1', '절연전선 최소 굵기 — 옥내', [
  cond('crossSection', '>=', 1.5, 'mm²', '옥내 절연전선 최소 1.5mm²'),
]);

export const KEC_230_2 = buildArticle('KEC-222.5', '222.5', '저압 가공전선의 굵기 및 종류', [
  cond('crossSection', '>=', 2.5, 'mm²', '옥외 절연전선 최소 2.5mm²'),
]);

export const KEC_230_3 = buildArticle('KEC-132', '132', '전로의 절연저항 및 절연내력', [
  cond('insulationVoltage', '>=', 1000, 'V', '저압 케이블 절연내전압 1000V 이상'),
]);

export const KEC_230_4 = buildArticle('KEC-230.4', '230.4', '접지선 최소 굵기', [
  cond('crossSection', '>=', 2.5, 'mm²', '접지선 최소 단면적 2.5mm²'),
]);

// ─── PART 7: KEC 232.5 — 허용전류 ─────────────────────────────
//
// `232.1~232.4` 로 등록돼 있었다. 현행에서 그 자리는 232.1 적용범위 /
// 232.2 배선설비 공사의 종류 / 232.3 배선설비 적용 시 고려사항 /
// 232.4 외부영향이고, 허용전류는 **232.5** 다. 2026-07-27 재번호.
//
// 232.5 는 하위가 있어서 원래의 구분을 그대로 옮길 수 있었다:
//   232.5.2 허용전류의 결정 · 232.5.3 복수회로로 포설된 그룹 · 232.5.4 통전도체의 수

export const KEC_232_5_2 = buildArticle('KEC-232.5.2', '232.5.2', '허용전류의 결정', [
  cond('ampacity', '>=', 0, 'A', '허용전류 ≥ 설계전류'),
  // 40°C 로 적혀 있었다. 기준은 **30°C** 다 — 이 리포의 허용전류표가 그렇고
  // (`data/ampacity-tables/kec-ampacity.ts`: "30°C ambient", 기본값 30),
  // kec-extended 도 30°C 로 갖고 있었다. 등록부가 kec-full 만 남기니 틀린
  // 40°C 가 live 였다.
  //
  // 방향이 위험한 쪽이다. 30~40°C 구간을 "보정 불요"로 통과시키면 허용전류를
  // 과대평가한다 — 계산기는 30°C 부터 감소계수를 먹이는데 판정층만 안 먹였다.
  cond('ambientTemp', '<=', 30, '°C', '주위온도 30°C 이하 시 보정계수 1.0. 초과 시 감소계수 적용'),
], [
  { articleId: 'KEC-232.5.3', relation: 'reference', note: '3회로 초과 시 그룹 보정 적용' },
  { articleId: 'KEC-212.3.4', relation: 'reference', note: '과전류 보호장치의 특성과 협조' },
  { articleId: 'NEC-310.16', relation: 'equivalent', note: 'NEC Table 310.16 허용전류표와 등가' },
]);

export const KEC_232_5_3 = buildArticle('KEC-232.5.3', '232.5.3', '복수회로로 포설된 그룹', [
  cond('circuitGroupCount', '<=', 3, '회로', '전선 그룹 3회로 이하 시 보정불요'),
  cond('groupingFactor', '<=', 1.0, '', '3선 초과 시 감소계수: 4-6선 0.8, 7-9선 0.7, 10-12선 0.65'),
], [
  { articleId: 'NEC-310.15(B)(3)', relation: 'equivalent', note: 'NEC 묶음 보정' },
  { articleId: 'KEC-232.5.2', relation: 'reference', note: '허용전류 기본값 참조' },
  { articleId: 'KEC-232.5.4', relation: 'reference', note: '고조파 환경 시 중성선 가산 고려' },
]);

export const KEC_232_5_4 = buildArticle('KEC-232.5.4', '232.5.4', '통전도체의 수', [
  cond('neutralHarmonicRatio', '<=', 33, '%', '중성선 고조파 전류비 33% 이하 — 초과 시 중성선을 통전도체로 산입'),
], [
  { articleId: 'KEC-232.5.3', relation: 'reference', note: '그룹 보정과 동시 적용 주의' },
  { articleId: 'KEC-232.5.2', relation: 'reference', note: '허용전류 기본값 참조' },
]);

// ─── PART 8: KEC 234 — 조명 ───────────────────────────────────

export const KEC_234_1 = buildArticle('KEC-234.1', '234.1', '조명 분기회로 — 최대 부하', [
  cond('branchLoad', '<=', 2200, 'VA', '조명 분기회로 부하 2200VA 이하'),
]);

export const KEC_234_2 = buildArticle('KEC-234.2', '234.2', '비상조명 — 최저 조도', [
  cond('emergencyLux', '>=', 1, 'lux', '비상조명 바닥면 최저 조도 1 lux 이상'),
]);

export const KEC_234_3 = buildArticle('KEC-234.3', '234.3', '비상조명 — 유지 시간', [
  cond('emergencyDuration', '>=', 60, 'min', '비상조명 유지 시간 60분 이상'),
]);

// ─── PART 9: KEC 240 — 보호 ───────────────────────────────────

export const KEC_240_1 = buildArticle('KEC-212.3.4', '212.3.4', '보호장치의 특성', [
  cond('breakerRating', '>=', 0, 'A', '과전류 보호 차단기 설치'),
  cond('breakerRating', '<=', 0, 'A', '차단기 정격 ≤ 전선 허용전류'),
], [
  { articleId: 'KEC-232.5.2', relation: 'reference', note: '전선 허용전류와 차단기 정격 협조' },
  { articleId: 'KEC-212.5.5', relation: 'reference', note: '단락보호장치의 특성 — 차단용량 확인' },
  { articleId: 'NEC-240.4', relation: 'equivalent', note: 'NEC 240.4 과전류보호와 등가' },
]);

export const KEC_240_2 = buildArticle('KEC-211.2.4', '211.2.4', '누전차단기의 시설', [
  cond('rcdSensitivity', '<=', 30, 'mA', '인체보호용 누전차단기 감도전류 30mA 이하'),
]);

export const KEC_240_3 = buildArticle('KEC-240.3', '240.3', '지락 보호 — 동작시간 0.03초', [
  cond('rcdTripTime', '<=', 0.03, 's', '누전차단기 동작시간 0.03초 이하'),
]);

export const KEC_240_4 = buildArticle('KEC-153.1.4', '153.1.4', '서지보호장치 시설', [
  cond('spdRating', '>=', 0, 'kA', 'SPD(서지보호장치) 설치'),
]);

export const KEC_240_5 = buildArticle('KEC-212.5.5', '212.5.5', '단락보호장치의 특성', [
  cond('breakingCapacity', '>=', 0, 'kA', '차단기 차단용량 ≥ 예상 단락전류'),
]);

// ─── PART 10: KEC 311 — 수변전 ─────────────────────────────────

export const KEC_311_1 = buildArticle('KEC-311.1', '311.1', '수전설비 — 최소 이격거리', [
  cond('clearance', '>=', 1000, 'mm', '충전부 최소 이격거리 1000mm 이상'),
]);

export const KEC_311_2 = buildArticle('KEC-311.2', '311.2', '수전설비 — 조작통로 폭', [
  cond('aisleWidth', '>=', 1200, 'mm', '조작통로 폭 1200mm 이상'),
]);

export const KEC_311_3 = buildArticle('KEC-311.3', '311.3', '수전설비 — 점검통로 폭', [
  cond('maintenanceAisle', '>=', 600, 'mm', '점검통로 폭 600mm 이상'),
]);

// ─── PART 11: KEC 341 — 변압기 ─────────────────────────────────

export const KEC_341_1 = buildArticle('KEC-341.1', '341.1', '변압기 효율 — 최소 효율', [
  cond('efficiency', '>=', 95, '%', '변압기 효율 95% 이상 권장'),
]);

export const KEC_341_2 = buildArticle('KEC-341.2', '341.2', '변압기 — 최대 온도 상승', [
  cond('tempRise', '<=', 65, '°C', '건식 변압기 최대 온도상승 65°C (F종)'),
]);

export const KEC_341_3 = buildArticle('KEC-341.3', '341.3', '변압기 — 임피던스 전압', [
  cond('impedanceVoltage', '<=', 10, '%', '변압기 임피던스 전압 10% 이하'),
]);

// ─── PART 12: KEC 351 — 수변전설비 ─────────────────────────────

export const KEC_351_1 = buildArticle('KEC-351.1', '351.1', '수변전실 — 최소 바닥 면적', [
  cond('roomArea', '>=', 15, 'm²', '수변전실 최소 바닥 면적 15m² 이상'),
]);

export const KEC_351_2 = buildArticle('KEC-351.2', '351.2', '수변전실 — 최소 천장 높이', [
  cond('ceilingHeight', '>=', 3000, 'mm', '수변전실 천장 높이 3000mm 이상'),
]);

export const KEC_351_3 = buildArticle('KEC-351.3', '351.3', '수변전실 — 환기량', [
  cond('ventilationRate', '>=', 0, 'm³/h', '수변전실 적정 환기량 확보'),
]);

// ─── PART 13: KEC 410 — 접지일반 ───────────────────────────────

export const KEC_410_1 = buildArticle('KEC-410.1', '410.1', '접지극 — 최소 매설 깊이', [
  cond('burialDepth', '>=', 750, 'mm', '접지극 최소 매설 깊이 750mm'),
]);

export const KEC_410_2 = buildArticle('KEC-410.2', '410.2', '접지선 — 기계적 보호', [
  cond('crossSection', '>=', 6, 'mm²', '접지선 기계적 보호 미적용 시 6mm² 이상'),
]);

export const KEC_410_3 = buildArticle('KEC-143.3', '143.3', '등전위본딩 도체', [
  cond('crossSection', '>=', 6, 'mm²', '등전위 본딩 도체 6mm² 이상'),
]);

export const KEC_410_4 = buildArticle('KEC-410.4', '410.4', '접지저항 — 공통접지', [
  cond('resistance', '<=', 10, 'ohm', '공통접지 접지저항 10 ohm 이하'),
]);

export const KEC_410_5 = buildArticle('KEC-410.5', '410.5', '접지극 — 봉형 최소 길이', [
  cond('rodLength', '>=', 900, 'mm', '접지봉 최소 길이 900mm'),
]);

// ─── PART 14: KEC 502 — 신재생 ─────────────────────────────────

export const KEC_502_1 = buildArticle('KEC-502.1', '502.1', '태양광 — 모듈 직렬 최대 전압', [
  cond('pvMaxVoltage', '<=', 1000, 'V', '저압 태양광 직렬 최대 전압 1000V 이하'),
]);

export const KEC_502_2 = buildArticle('KEC-502.2', '502.2', '태양광 — 인버터 효율', [
  cond('inverterEfficiency', '>=', 95, '%', '태양광 인버터 효율 95% 이상 권장'),
]);

export const KEC_502_3 = buildArticle('KEC-502.3', '502.3', '태양광 — 역전력 보호', [
  cond('reverseCurrentProtection', '>=', 1, '', '역전력 보호장치 설치 (1=있음)'),
]);

export const KEC_502_4 = buildArticle('KEC-502.4', '502.4', '태양광 — 접지 저항', [
  cond('resistance', '<=', 10, 'ohm', '태양광 시스템 접지저항 10 ohm 이하'),
]);

// ─── PART 15: KEC 520 — ESS ────────────────────────────────────

export const KEC_520_1 = buildArticle('KEC-520.1', '520.1', 'ESS — 최대 충전 전압', [
  cond('maxChargeVoltage', '<=', 1000, 'V', 'ESS 최대 충전전압 1000V 이하 (저압)'),
]);

export const KEC_520_2 = buildArticle('KEC-520.2', '520.2', 'ESS — 과충전 보호', [
  cond('overchargeProtection', '>=', 1, '', '과충전 보호장치 설치 (1=있음)'),
]);

export const KEC_520_3 = buildArticle('KEC-520.3', '520.3', 'ESS — 과방전 보호', [
  cond('overDischargeProtection', '>=', 1, '', '과방전 보호장치 설치 (1=있음)'),
]);

export const KEC_520_4 = buildArticle('KEC-520.4', '520.4', 'ESS — 셀 온도 상한', [
  cond('cellTemp', '<=', 60, '°C', 'ESS 셀 온도 60°C 이하'),
]);

export const KEC_520_5 = buildArticle('KEC-520.5', '520.5', 'ESS — 설치실 환기', [
  cond('ventilationRate', '>=', 0, 'm³/h', 'ESS 설치실 적정 환기량 확보'),
]);

// ─── PART 16: Registry & Evaluator Export ──────────────────────

/** All extended KEC articles */
const ALL_EXTENDED_ARTICLES: CodeArticle[] = [
  // 130 전압구분
  KEC_130_1, KEC_130_2, KEC_130_3, KEC_130_4,
  // 210 배선일반
  KEC_210_1, KEC_210_2, KEC_210_3,
  // 211 배선방법
  KEC_232_11, KEC_232_12, KEC_232_41, KEC_232_10,
  // 220 부하산정
  KEC_220_1, KEC_220_2, KEC_220_3, KEC_220_4,
  // 230 전선/케이블
  KEC_230_1, KEC_230_2, KEC_230_3, KEC_230_4,
  // 232 허용전류 확장
  KEC_232_5_2, KEC_232_5_3, KEC_232_5_4,
  // 234 조명
  KEC_234_1, KEC_234_2, KEC_234_3,
  // 240 보호
  KEC_240_1, KEC_240_2, KEC_240_3, KEC_240_4, KEC_240_5,
  // 311 수변전
  KEC_311_1, KEC_311_2, KEC_311_3,
  // 341 변압기
  KEC_341_1, KEC_341_2, KEC_341_3,
  // 351 수변전설비
  KEC_351_1, KEC_351_2, KEC_351_3,
  // 410 접지일반
  KEC_410_1, KEC_410_2, KEC_410_3, KEC_410_4, KEC_410_5,
  // 502 신재생
  KEC_502_1, KEC_502_2, KEC_502_3, KEC_502_4,
  // 520 ESS
  KEC_520_1, KEC_520_2, KEC_520_3, KEC_520_4, KEC_520_5,
];

/**
 * Register all extended articles into the KEC_ARTICLES map.
 * Call this once at module load to merge extended articles with the base set.
 */
export function registerExtendedArticles(
  registry: Map<string, CodeArticle>,
): void {
  for (const art of ALL_EXTENDED_ARTICLES) {
    registry.set(art.id, art);
  }
}

/**
 * Evaluator map for extended articles.
 * All use the generic simpleEval — conditions are evaluated directly.
 */
export function registerExtendedEvaluators(
  evaluators: Map<string, (params: Record<string, number>) => JudgmentResult>,
): void {
  for (const art of ALL_EXTENDED_ARTICLES) {
    evaluators.set(art.id, (params) => simpleEval(art, params));
  }
}

/** Total count of extended articles */
export const EXTENDED_ARTICLE_COUNT = ALL_EXTENDED_ARTICLES.length;
