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

// ─── PART 8: (구) KEC 234 조명 — 전부 뺐다 2026-07-27 ──────────
//
// 셋 다 **KEC 조항이 아니었다.** 현행 234 조명설비의 하위는 등기구·코드·
// 전구선·콘센트·점멸기·옥외등·전주외등·방전등·네온·수중조명·교통신호등이고
// 조도도 비상조명도 분기회로 VA 한도도 없다.
//
//   234.1 조명 분기회로 2200VA  → 내선규정. KEC 는 분기회로 VA 한도를 두지 않는다
//   234.2 비상조명 1 lux        → 소방시설법 NFPC 304 비상조명등
//   234.3 비상조명 60분         → 소방시설법 NFPC 304. 게다가 기본은 20분이고
//                                 60분은 일부 대상(지하층·11층 이상 등)이다
//
// 이 리포는 내선규정·소방 규격 세트를 갖고 있지 않다. 없는 KEC 번호를 붙여
// 두느니 빼고 어디 있는지만 남긴다. 셋 다 소비처가 0 이었다 —
// branchLoad·emergencyLux·emergencyDuration 을 읽는 코드가 없다.

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
  // kec-extended 가 `212.4` 로 갖고 있던 조건. 212.4 는 과부하전류 보호이고
  // 누전차단기는 여기다 — 옮기며 합쳤다(2026-07-27).
  cond('rcdInstalled', '==', 1, 'bool', '금속제 외함 기기: 정격감도전류 30mA 이하 누전차단기'),
], [
  { articleId: 'NEC-210.8', relation: 'equivalent', note: 'NEC GFCI 보호' },
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

// ─── (구) KEC 311/341/351 — 9건 전부 뺐다 2026-07-27 ──────────
//
// 셋 묶음 다 **KEC 조항이 아니었다.** 현행 전문 전체를 검색했다:
//   "이격거리"  0 건
//   "통로"      114 전기설비의 유지·보수 · 풍력 유지보수 뿐 (폭 수치 없음)
//   "바닥면적"·"천장"  0 건
//   "환기"      542.4 연료전지 환기·배기 뿐
// KEC 311.x 는 절연수준·기본보호·고장보호, 341.x 는 특고압 변압기 시설,
// 351.x 는 발전소 울타리·상 표시·발전기 보호장치다. 치수 조항이 없다.
//
// 뺀 값과 후보 출처(재수록하려면 그 원문을 확보해야 한다):
//   충전부 최소 이격거리 1000mm   내선규정 / 한전 배전규정
//   조작통로 폭 1200mm            내선규정
//   점검통로 폭 600mm             내선규정
//   수변전실 바닥면적 15m²        내선규정 / 건축설비 기준
//   수변전실 천장높이 3000mm      내선규정
//   수변전실 환기량               조건이 `>= 0` 이라 무엇을 넣어도 PASS 였다.
//                                 검사가 아니라 자리표시자였다.
//   변압기 효율 95%               KS C 4306 / 효율관리기자재 운용규정
//   건식변압기 온도상승 65°C(F종) KS C 4306
//   변압기 임피던스 전압 10%      KS C 4306 / 제작 사양
//
// 이 리포에 내선규정 세트(`standards/ner`)가 있지만 **그 원문 오라클이 없다.**
// KEC 의 틀린 번호를 내선규정의 확인 안 된 번호로 옮기면 같은 잘못을 새
// 라벨로 반복하는 것이라 옮기지 않았다. 내선규정 원문을 확보하면 그때 NER 로
// 수록한다.
//
// 아홉 다 소비처가 0 이었다 — clearance·aisleWidth·maintenanceAisle·
// tempRise·impedanceVoltage·ventilationRate·roomArea 를 읽는 코드가 없다
// (ceilingHeight 12 곳·efficiency 163 곳은 소방 감지기·전동기 효율 계산기로
//  이름만 같고 이 조항과 무관하다).

// KEC 에 410 편은 **전기철도**다(제4편). 접지는 142 다 — 410.1/410.2/410.4/410.5
// 는 아예 없는 번호였다. 2026-07-27 재번호.
//
// 매설 깊이와 봉 길이는 둘 다 접지극 시공이라 142.2 로 모았다. 접지선은
// 142.3.2 보호도체, 공통접지는 142.6 이 제 자리다.

export const KEC_142_2_ELECTRODE = buildArticle('KEC-142.2', '142.2', '접지극의 시설 및 접지저항', [
  cond('burialDepth', '>=', 750, 'mm', '접지극 최소 매설 깊이 750mm'),
  cond('rodLength', '>=', 900, 'mm', '접지봉 최소 길이 900mm'),
  // kec-extended 가 갖고 있던 조건 — 두 파일에 두면 그쪽이 통째로 버려진다.
  cond('earthElectrodeInstalled', '==', 1, 'bool', '접지봉/접지판/접지망/기초접지 시공'),
  cond('earthResistance_ohm', '<=', 10, 'Ω', '특별 제3종 접지: ≤10Ω (변압기 2차측)'),
], [
  { articleId: 'IEC-612.6.1', relation: 'equivalent', note: 'IEC 접지저항' },
]);

export const KEC_142_3_2 = buildArticle('KEC-142.3.2', '142.3.2', '보호도체', [
  cond('crossSection', '>=', 6, 'mm²', '접지선 기계적 보호 미적용 시 6mm² 이상'),
]);

export const KEC_143_3 = buildArticle('KEC-143.3', '143.3', '등전위본딩 도체', [
  cond('crossSection', '>=', 6, 'mm²', '등전위 본딩 도체 6mm² 이상'),
]);

export const KEC_142_6 = buildArticle('KEC-142.6', '142.6', '공통접지 및 통합접지', [
  cond('resistance', '<=', 10, 'ohm', '공통접지 접지저항 10 ohm 이하'),
]);

// ─── PART 14: KEC 521/522 — 태양광설비 ────────────────────────
//
// `502.1~502.4` 로 등록돼 있었다. 현행 502 는 **용어의 정의**이고 502.1 부터는
// 아예 없는 번호다 — 상위(502)가 실재해서 번호 게이트를 빠져나갔다.
// 태양광은 521 일반사항 / 522 태양광설비의 시설이다. 2026-07-27 재번호.

export const KEC_521_3 = buildArticle('KEC-521.3', '521.3', '옥내전로의 대지전압 제한', [
  cond('pvMaxVoltage', '<=', 1000, 'V', '저압 태양광 직렬 최대 전압 1000V 이하'),
]);

// 아래 둘은 kec-extended 가 `501.x` 로 갖고 있던 조건까지 합친 것이다.
// 두 파일에 같은 번호를 두면 등록부가 kec-full 만 남겨서 나머지가 죽는다.
export const KEC_522_2 = buildArticle('KEC-522.2', '522.2', '태양광설비의 시설기준', [
  cond('inverterEfficiency', '>=', 95, '%', '태양광 인버터 효율 95% 이상 권장'),
  cond('resistance', '<=', 10, 'ohm', '태양광 시스템 접지저항 10 ohm 이하'),
  cond('pvModuleInstallation', '==', 1, 'bool', 'PV 모듈 어레이 지지/접지/절연/표시'),
], [
  { articleId: 'IEC-712.1', relation: 'equivalent', note: 'IEC 태양광' },
]);

export const KEC_522_3 = buildArticle('KEC-522.3', '522.3', '제어 및 보호장치 등', [
  cond('reverseCurrentProtection', '>=', 1, '', '역전력 보호장치 설치 (1=있음)'),
  cond('pvInverter', '==', 1, 'bool', '계통연계 인버터: 단독운전방지/전력품질/보호'),
  cond('pvRapidShutdown', '==', 1, 'bool', '옥상 PV: 긴급차단장치 설치 (소방 안전)'),
], [
  { articleId: 'NEC-690.12', relation: 'equivalent', note: 'NEC PV 긴급차단' },
]);

// ─── PART 15: KEC 511/512 — 전기저장장치 ──────────────────────
//
// `520.1~520.5` 로 등록돼 있었다. **520 대는 KEC 에 없다** — 전기저장장치는
// 511 공통사항 / 512 이차전지 용량 및 종류에 따른 시설이다. 2026-07-27 재번호.
//
// 설치실 환기(520.5)는 뺐다. 조건이 `ventilationRate >= 0` 이라 무엇을 넣어도
// PASS 였다 — 검사가 아니라 자리표시자다. 511.2.6 이차전지실 환기 요건을
// 원문에서 확보하면 그때 수록한다.

export const KEC_511_2_4 = buildArticle('KEC-511.2.4', '511.2.4', '이차전지의 시설', [
  cond('maxChargeVoltage', '<=', 1000, 'V', 'ESS 최대 충전전압 1000V 이하 (저압)'),
  cond('cellTemp', '<=', 60, '°C', 'ESS 셀 온도 60°C 이하'),
]);

export const KEC_512_1_4_PROTECT = buildArticle('KEC-512.1.4', '512.1.4', '제어, 감시 및 보호장치 등', [
  cond('overchargeProtection', '>=', 1, '', '과충전 보호장치 설치 (1=있음)'),
  cond('overDischargeProtection', '>=', 1, '', '과방전 보호장치 설치 (1=있음)'),
  // kec-extended 가 갖고 있던 조건 — 합치지 않으면 그쪽이 버려진다.
  cond('essPCS', '==', 1, 'bool', 'PCS 효율/보호/계통연계/단독운전방지'),
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
  // 240 보호
  KEC_240_1, KEC_240_2, KEC_240_3, KEC_240_4, KEC_240_5,
  // 234 조명 · 311 수변전 치수 · 341 변압기 사양 · 351 수변전실 치수는
  // 2026-07-27 에 전부 뺐다 — KEC 조항이 아니었다(위 주석 참조).
  // 410 접지일반
  KEC_142_2_ELECTRODE, KEC_142_3_2, KEC_143_3, KEC_142_6,
  // 502 신재생
  KEC_521_3, KEC_522_2, KEC_522_3,
  // 520 ESS
  KEC_511_2_4, KEC_512_1_4_PROTECT,
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
