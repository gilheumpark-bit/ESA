/**
 * JIS C 0364 Articles — 일본 전기설비기술기준
 * ----------------------------------------------
 * IEC 60364 기반 일본 국가규격. 기준값만 저장 (사실 정보).
 * 원문 확인: https://www.jisc.go.jp/
 *
 * 일본 전기사업법/전기설비기술기준(해석) 기준.
 * 전압: 100/200V (단상), 200V (3상), 50/60Hz.
 */

import type { CodeArticle } from '../kec/types';

function jis(id: string, article: string, title: string, conditions: CodeArticle['conditions'], related?: CodeArticle['relatedClauses']): CodeArticle {
  return { id: `JIS-${id}`, country: 'JP', standard: 'JIS C 0364', article, title, conditions, relatedClauses: related, effectiveDate: '2019-01-01', version: '2019' };
}

export const JIS_ARTICLES = new Map<string, CodeArticle>([
  // 감전 보호
  ['JIS-411.1', jis('411.1', '411.1', '감전 보호 — 접촉전압 제한', [
    { param: 'touchVoltage', operator: '<=', value: 50, unit: 'V', result: 'PASS', note: '접촉전압 ≤50V (건조), ≤25V (습윤)' },
  ], [{ articleId: 'IEC-411.1', relation: 'equivalent', note: 'IEC 감전 보호' }, { articleId: 'KEC-131.1', relation: 'equivalent', note: 'KEC 감전 보호' }])],

  // 접지
  ['JIS-542.1', jis('542.1', '542.1', '접지 — D종 접지공사 (100Ω 이하)', [
    { param: 'earthResistance_ohm', operator: '<=', value: 100, unit: 'Ω', result: 'PASS', note: 'D종 접지: ≤100Ω (300V 이하 기기)' },
  ], [{ articleId: 'KEC-142.3', relation: 'equivalent', note: 'KEC 접지저항' }])],
  ['JIS-542.2', jis('542.2', '542.2', '접지 — C종 접지공사 (10Ω 이하)', [
    { param: 'earthResistance_ohm', operator: '<=', value: 10, unit: 'Ω', result: 'PASS', note: 'C종 접지: ≤10Ω (300V 초과 저압기기)' },
  ])],
  ['JIS-542.3', jis('542.3', '542.3', '접지 — B종 접지공사', [
    { param: 'earthResistance_ohm', operator: '<=', value: 150, unit: 'Ω', result: 'PASS', note: 'B종 접지: 150/Ig Ω (변압기 혼촉방지)' },
  ])],
  ['JIS-542.4', jis('542.4', '542.4', '접지 — A종 접지공사 (10Ω 이하)', [
    { param: 'earthResistance_ohm', operator: '<=', value: 10, unit: 'Ω', result: 'PASS', note: 'A종 접지: ≤10Ω (고압/특고압 기기)' },
  ])],

  // 전압강하
  ['JIS-525.1', jis('525.1', '525.1', '전압강하 — 간선 3%, 분기 3%, 합산 5%', [
    { param: 'voltageDropPercent', operator: '<=', value: 3, unit: '%', result: 'PASS', note: '간선 ≤3%, 분기 ≤3%, 합산 ≤5% (전기설비기술기준 해석 제57조)' },
  ], [{ articleId: 'KEC-232.52', relation: 'equivalent', note: 'KEC 전압강하' }, { articleId: 'NEC-VD-BRANCH', relation: 'equivalent', note: 'NEC 전압강하' }])],

  // 허용전류 — JIS C 3005 기반 (30°C 기준, 설치방법별)
  ['JIS-523.1', jis('523.1', '523.1', '허용전류 — JIS C 3005 설치방법별', [
    { param: 'loadCurrent', operator: '<=', value: 9999, unit: 'A', result: 'PASS', note: '부하전류가 JIS C 3005 허용전류 이내 (테이블 참조 필수). 기본 30°C, 설치방법 A1/B1/C/D 구분.' },
    { param: 'ambientTemp', operator: '<=', value: 40, unit: '°C', result: 'PASS', note: '주위온도 40°C 초과 시 보정계수 적용 (JIS C 3005 Table 3)' },
  ], [{ articleId: 'KEC-232.1', relation: 'equivalent', note: 'KEC 허용전류' }])],

  // 과전류 보호
  ['JIS-432.1', jis('432.1', '432.1', '과전류 보호 — 차단기 선정', [
    { param: 'overcurrentProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '정격전류 ≤ 전선 허용전류, 차단용량 ≥ 단락전류' },
  ], [{ articleId: 'KEC-212.1', relation: 'equivalent', note: 'KEC 과전류 보호' }])],

  // 누전차단기
  ['JIS-RCD', jis('RCD', '531.2', '누전차단기 — 30mA/0.1s', [
    { param: 'rcdRating_mA', operator: '<=', value: 30, unit: 'mA', result: 'PASS', note: '누전차단기 감도전류 30mA, 동작시간 0.1s 이내' },
  ], [{ articleId: 'KEC-212.4', relation: 'equivalent', note: 'KEC 누전차단기' }])],

  // 배선
  ['JIS-521.1', jis('521.1', '521.1', '배선 방법 — 전선관/케이블', [
    { param: 'wiringMethod', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '금속관/합성수지관/금속가요관/케이블 배선' },
  ])],
  ['JIS-521.2', jis('521.2', '521.2', '전선관 충전율 — ≤32%', [
    { param: 'conduitFillPercent', operator: '<=', value: 32, unit: '%', result: 'PASS', note: '일본 기준 충전율 ≤32% (3선 이상). 참고: KEC 40%, NEC 40%, IEC 40% — 일본이 가장 엄격' },
  ], [{ articleId: 'KEC-232.31', relation: 'reference', note: 'KEC 충전율 40%와 차이 (일본 32% vs 한국 40%)' }])],

  // 특수 장소
  ['JIS-701.1', jis('701.1', '701.1', '욕실 — 구역 구분', [
    { param: 'bathroomZone', operator: '>=', value: 0, unit: 'zone', result: 'PASS', note: 'Zone 0/1/2/3 (IEC와 동일)' },
  ], [{ articleId: 'KEC-250.1', relation: 'equivalent', note: 'KEC 욕실 구역' }])],

  // 태양광
  ['JIS-712.1', jis('712.1', '712.1', '태양광 발전 — 시설 기준', [
    { param: 'pvInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'PV 모듈 접지/절연/보호장치 (JIS C 8955)' },
  ], [{ articleId: 'KEC-501.1', relation: 'equivalent', note: 'KEC 태양광' }])],

  // 전기차
  ['JIS-722.1', jis('722.1', '722.1', '전기차 충전 — CHAdeMO/Type 1', [
    { param: 'evCharging', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '일본: CHAdeMO 급속충전 + Type 1 완속충전' },
  ], [{ articleId: 'KEC-260.1', relation: 'equivalent', note: 'KEC EV 충전' }])],

  // 전압/주파수
  ['JIS-VOLTAGE', jis('VOLTAGE', '100/200V', '일본 표준 전압 — 100V/200V, 50/60Hz', [
    { param: 'voltage_V', operator: '<=', value: 200, unit: 'V', result: 'PASS', note: '단상 100V/200V, 3상 200V. 동일본 50Hz, 서일본 60Hz' },
  ])],

  // ── 추가 조항 ──

  // 단락전류 보호
  ['JIS-434.1', jis('434.1', '434.1', '단락전류 보호 — 차단용량', [
    { param: 'breakingCapacity_kA', operator: '>=', value: 0, unit: 'kA', result: 'PASS', note: '차단기 차단용량 ≥ 예상 단락전류. JIS C 8201-2-1 참조' },
  ], [{ articleId: 'IEC-434.1', relation: 'equivalent', note: 'IEC 60364-4-43 단락보호' }])],

  // 절연저항
  ['JIS-612.1', jis('612.1', '612.1', '절연저항 — 최소 기준', [
    { param: 'insulationResistance_MOhm', operator: '>=', value: 0.5, unit: 'MΩ', result: 'PASS', note: '300V 이하: 0.3MΩ, 300V 초과: 0.4MΩ (대지전압), 사용전압 600V 이하: 0.5MΩ (JIS C 1302)' },
  ], [{ articleId: 'KEC-612.1', relation: 'equivalent', note: 'KEC 절연저항 기준' }])],

  // 내진 설계
  ['JIS-SEISMIC', jis('SEISMIC', 'C 0920', '내진 설계 — 전기설비 내진', [
    { param: 'seismicDesign', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '수배전반/변압기/케이블랙 내진앵커 설치 (JIS C 0920, 일본 건축기준법 시행령)' },
  ])],

  // 의료 시설
  ['JIS-710.1', jis('710.1', '710.1', '의료 시설 — 절연변압기 IT 계통', [
    { param: 'medicalITSystem', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '수술실/ICU: IT 계통 + 절연감시장치. JIS T 1022 (의용전기기기 안전)' },
  ], [{ articleId: 'IEC-710.1', relation: 'equivalent', note: 'IEC 60364-7-710 의료시설' }])],
]);

export function getJISArticleCount(): number {
  return JIS_ARTICLES.size;
}

export function getJISArticle(idOrClause: string): CodeArticle | null {
  return JIS_ARTICLES.get(idOrClause)
    ?? JIS_ARTICLES.get(`JIS-${idOrClause}`)
    ?? [...JIS_ARTICLES.values()].find(a => a.article === idOrClause)
    ?? null;
}
