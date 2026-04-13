/**
 * NEC 2023 Articles — 40+ 핵심 조항
 * -----------------------------------
 * 기준값/숫자/표/조건식만 저장 (사실 정보, 저작권 자유).
 * 원문 문장 미포함. 원문 확인: https://www.nfpa.org/codes-and-standards
 *
 * PART 1: Wiring & Protection (Article 210, 215, 220, 240)
 * PART 2: Conductors & Ampacity (Article 310)
 * PART 3: Grounding (Article 250)
 * PART 4: Motors (Article 430)
 * PART 5: Voltage Drop (Informative)
 * PART 6: Wiring Methods & Special (Article 300, 400, 500)
 */

import type { CodeArticle } from '../kec/types';

/** 원문 확인 링크 */
export const NEC_SOURCE_URL = 'https://www.nfpa.org/codes-and-standards/nfpa-70-standard-development/70';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Wiring & Protection
// ═══════════════════════════════════════════════════════════════════════════════

function nec(id: string, article: string, title: string, conditions: CodeArticle['conditions'], related?: CodeArticle['relatedClauses']): CodeArticle {
  return { id: `NEC-${id}`, country: 'US', standard: 'NEC', article, title, conditions, relatedClauses: related, effectiveDate: '2023-01-01', version: '2023' };
}

const WIRING: CodeArticle[] = [
  nec('210.3', '210.3', '분기회로 정격 (15/20/30/40/50A)', [
    { param: 'branchCircuitRating', operator: '<=', value: 50, unit: 'A', result: 'PASS', note: '분기회로 표준 정격: 15, 20, 30, 40, 50A' },
  ], [{ articleId: 'KEC-212.3', relation: 'equivalent', note: 'KEC 과전류보호 선정' }]),

  nec('210.19', '210.19', '분기회로 전선 크기 — 허용전류 ≥ 부하', [
    { param: 'conductorAmpacity', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: '전선 허용전류 ≥ 비연속부하 + 연속부하×1.25' },
  ], [{ articleId: 'NEC-310.16', relation: 'reference', note: 'Table 310.16 허용전류' }, { articleId: 'KEC-232.52', relation: 'equivalent', note: 'KEC 분기회로 전선' }]),

  nec('210.52', '210.52', '주거 콘센트 배치 기준', [
    { param: 'wallSpaceFt', operator: '<=', value: 6, unit: 'ft', result: 'PASS', note: '벽면: 어느 지점에서든 6ft 이내 콘센트' },
    { param: 'countertopSpaceFt', operator: '<=', value: 4, unit: 'ft', result: 'PASS', note: '주방 카운터: 4ft 이내 콘센트' },
  ], [{ articleId: 'NEC-210.8', relation: 'reference', note: 'GFCI 요구 장소와 교차 확인' }]),

  nec('210.8', '210.8', 'GFCI 보호 필요 장소', [
    { param: 'gfciRequired', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '욕실/주방/옥외/차고/미완성 지하실: GFCI 필수' },
  ], [{ articleId: 'KEC-232.4', relation: 'equivalent', note: 'KEC 누전차단기 설치' }]),

  nec('210.12', '210.12', 'AFCI 보호 필요 장소', [
    { param: 'afciRequired', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '거실/침실/서재 등 주거 공간: AFCI 필수' },
  ], [{ articleId: 'NEC-210.8', relation: 'reference', note: 'GFCI/AFCI 병행 보호' }]),

  nec('215.2', '215.2', '간선 전선 크기 — 허용전류 기준', [
    { param: 'feederAmpacity', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: '간선 허용전류 ≥ 비연속부하 + 연속부하×1.25' },
  ], [{ articleId: 'KEC-232.52', relation: 'equivalent', note: 'KEC 간선 전압강하' }]),

  nec('220.12', '220.12', '용도별 조명 부하 단위', [
    { param: 'lightingLoadVAperSqFt', operator: '>=', value: 3.5, unit: 'VA/ft²', result: 'PASS', note: '사무실 3.5, 주거 3, 상가 2.25 VA/ft²' },
  ]),

  nec('220.40', '220.40', '일반 부하 계산 — 수용률 적용', [
    { param: 'demandFactor', operator: '>=', value: 0, unit: '%', result: 'PASS', note: '첫 10kVA 100%, 초과분 40% (일반 조명)' },
  ]),

  nec('240.4', '240.4', '전선 보호 — OCPD ≤ 전선 허용전류', [
    { param: 'ocpdRating', operator: '<=', value: 0, unit: 'A', result: 'PASS', note: '과전류보호장치 정격 ≤ 전선 허용전류 (예외: 240.4(B))' },
  ], [{ articleId: 'NEC-310.16', relation: 'reference', note: 'Table 310.16' }, { articleId: 'KEC-212.3', relation: 'equivalent', note: 'KEC 과전류차단기' }]),

  nec('240.6', '240.6', '표준 과전류보호장치 정격 (A)', [
    { param: 'ocpdRating', operator: '>=', value: 15, unit: 'A', result: 'PASS', note: '표준 정격: 15,20,25,30,35,40,45,50,60,70,80,90,100,...,6000A' },
  ], [{ articleId: 'NEC-240.4', relation: 'reference', note: '전선 보호 협조' }, { articleId: 'KEC-212.3', relation: 'equivalent', note: 'KEC 표준 차단기 정격' }]),

  nec('240.21', '240.21', '간선 과전류보호장치 위치', [
    { param: 'tapLengthFt', operator: '<=', value: 25, unit: 'ft', result: 'PASS', note: '25ft 탭 룰: 탭 길이 ≤ 25ft, 허용전류 ≥ 부하' },
  ], [{ articleId: 'NEC-240.4', relation: 'reference', note: '과전류보호 기본 원칙' }]),

  nec('240.86', '240.86', '직렬정격 차단기 조합', [
    { param: 'seriesRatingValid', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '상위+하위 차단기 직렬정격 유효 여부' },
  ], [{ articleId: 'NEC-240.4', relation: 'reference', note: '보호 협조 기본' }]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Conductors & Ampacity (Article 310)
// ═══════════════════════════════════════════════════════════════════════════════

const CONDUCTORS: CodeArticle[] = [
  nec('310.16', '310.16', '절연전선 허용전류 (도관 내 3선 이하, 30°C)', [
    { param: 'loadCurrent', operator: '<=', value: 0, unit: 'A', result: 'PASS', note: '부하전류 ≤ Table 310.16 허용전류' },
  ], [{ articleId: 'NEC-240.4', relation: 'reference', note: '과전류보호 협조' }, { articleId: 'NEC-310.15(B)(3)', relation: 'reference', note: '묶음 보정' }, { articleId: 'KEC-232.3', relation: 'equivalent', note: 'KEC 허용전류' }]),

  nec('310.15(B)(2)', '310.15(B)(2)', '주위 온도 보정 계수', [
    { param: 'ambientTemp', operator: '<=', value: 30, unit: '°C', result: 'PASS', note: '기준 30°C. 초과 시 보정계수 적용 (Table 310.15(B)(2)(a))' },
  ], [{ articleId: 'NEC-310.16', relation: 'reference', note: '기본 허용전류표' }, { articleId: 'KEC-232.3', relation: 'equivalent', note: 'KEC 온도 보정' }]),

  nec('310.15(B)(3)', '310.15(B)(3)', '전선 묶음 감소 계수', [
    { param: 'conductorCount', operator: '<=', value: 3, unit: 'ea', result: 'PASS', note: '1-3선: 100%, 4-6: 80%, 7-9: 70%, 10-20: 50%, 21-30: 45%, 31-40: 40%, 41+: 35%' },
  ], [{ articleId: 'NEC-310.16', relation: 'reference', note: '기본 허용전류표' }, { articleId: 'KEC-232.3', relation: 'equivalent', note: 'KEC 밀집 보정' }]),

  nec('310.10', '310.10', '전선 사용 환경 조건', [
    { param: 'ambientTemp', operator: '<=', value: 90, unit: '°C', result: 'PASS', note: '전선 절연체 온도 등급 이하에서 사용' },
  ], [{ articleId: 'NEC-310.16', relation: 'reference', note: '허용전류 온도 등급' }]),

  nec('310.106', '310.106', '도체 최소 규격', [
    { param: 'conductorSizeAWG', operator: '>=', value: 14, unit: 'AWG', result: 'PASS', note: '일반 분기회로 최소 14AWG (15A), 12AWG (20A), 10AWG (30A)' },
  ], [{ articleId: 'NEC-210.3', relation: 'reference', note: '분기회로 정격 연동' }]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Grounding (Article 250)
// ═══════════════════════════════════════════════════════════════════════════════

const GROUNDING: CodeArticle[] = [
  nec('250.24', '250.24', '수전점 접지 계통 — 접지극 도체 연결', [
    { param: 'groundingElectrodePresent', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '수전점에 접지극 도체 필수' },
  ], [{ articleId: 'KEC-142.5', relation: 'equivalent', note: 'KEC 접지 시스템' }]),

  nec('250.52', '250.52', '접지극 종류', [
    { param: 'groundingElectrodeType', operator: '>=', value: 1, unit: 'ea', result: 'PASS', note: '금속 수도관/접지봉/콘크리트 내 철근/접지환 중 1개 이상' },
  ], [{ articleId: 'NEC-250.53', relation: 'reference', note: '접지극 설치 + 저항' }, { articleId: 'KEC-142.5', relation: 'equivalent', note: 'KEC 접지극' }]),

  nec('250.66', '250.66', '접지극 도체 크기 (Table 250.66)', [
    { param: 'largestServiceConductor_AWG', operator: '>=', value: 2, unit: 'AWG', result: 'PASS', note: '수전 2AWG→접지 8AWG, 1/0→6, 2/0→4, 3/0+→2AWG' },
  ], [{ articleId: 'KEC-142.5-A', relation: 'equivalent', note: 'KEC 접지도체 크기' }]),

  nec('250.118', '250.118', '기기 접지 도체 종류', [
    { param: 'egcTypeValid', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '동선, EMT, 금속 가요전선관, MC 케이블 외장 등' },
  ]),

  nec('250.122', '250.122', '기기 접지 도체 크기 (Table 250.122)', [
    { param: 'ocpdRating', operator: '<=', value: 6000, unit: 'A', result: 'PASS', note: '15A→14AWG, 20→12, 30→10, 60→10, 100→8, 200→6, 300→4, 400→3' },
  ]),

  nec('250.53', '250.53', '접지극 설치 — 접지저항', [
    { param: 'groundResistance', operator: '<=', value: 25, unit: 'Ω', result: 'PASS', note: '단일 봉 25Ω 초과 시 추가 접지극 필요' },
  ]),

  nec('250.30', '250.30', '독립 전원 접지 (발전기/변압기)', [
    { param: 'separatelyDerivedGrounding', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '독립 전원계통: 본딩점퍼 + 접지극 도체 필수' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Motors (Article 430)
// ═══════════════════════════════════════════════════════════════════════════════

const MOTORS: CodeArticle[] = [
  nec('430.6', '430.6', '전동기 전부하전류 — Table 430.247~250 사용', [
    { param: 'motorFLC', operator: '>', value: 0, unit: 'A', result: 'PASS', note: '명판 아닌 NEC 표 값 사용 (430.247: DC, 430.248: 단상, 430.250: 3상)' },
  ]),

  nec('430.22', '430.22', '전동기 분기회로 전선 — ≥125% FLC', [
    { param: 'branchConductorAmpacity', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: '분기 전선 허용전류 ≥ FLC × 1.25' },
  ], [{ articleId: 'KEC-341.1', relation: 'equivalent', note: 'KEC 전동기 분기회로' }]),

  nec('430.24', '430.24', '다중 전동기 회로 전선 크기', [
    { param: 'multiMotorConductor', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: '최대 FLC×1.25 + 나머지 FLC 합' },
  ]),

  nec('430.32', '430.32', '과부하 계전기 정격', [
    { param: 'overloadRelayRating', operator: '<=', value: 0, unit: 'A', result: 'PASS', note: 'SF≥1.15: ≤115% FLA, SF<1.15: ≤125% FLA' },
  ]),

  nec('430.52', '430.52', '전동기 분기 과전류보호장치 최대 정격', [
    { param: 'motorBranchOCPD_percent', operator: '<=', value: 250, unit: '%', result: 'PASS', note: '역한시 차단기 ≤250%, 순시트립 ≤800%' },
  ]),

  nec('430.62', '430.62', '전동기 간선 과전류보호장치', [
    { param: 'motorFeederOCPD', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: '최대 전동기 OCPD + 나머지 FLC 합' },
  ]),

  nec('430.109', '430.109', '전동기 개폐기 정격', [
    { param: 'motorDisconnectRating', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: '개폐기 ≥ 115% FLC (HP 정격 또는 전류 정격)' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Voltage Drop (Informative Notes)
// ═══════════════════════════════════════════════════════════════════════════════

const VOLTAGE_DROP: CodeArticle[] = [
  nec('VD-BRANCH', '210.19(A) IN', '분기회로 전압강하 권고 ≤3%', [
    { param: 'voltageDropPercent', operator: '<=', value: 3, unit: '%', result: 'PASS', note: '분기회로 전압강하 ≤3% (권고, 의무 아님)' },
  ], [{ articleId: 'KEC-232.52', relation: 'equivalent', note: 'KEC 분기 전압강하 ≤3% (의무)' }]),

  nec('VD-FEEDER', '215.2(A)(4) IN', '간선 전압강하 권고 ≤3%, 합산 ≤5%', [
    { param: 'voltageDropPercent', operator: '<=', value: 3, unit: '%', result: 'PASS', note: '간선 ≤3%, 간선+분기 합산 ≤5% (권고)' },
    { param: 'totalVoltageDropPercent', operator: '<=', value: 5, unit: '%', result: 'PASS', note: '합산 전압강하 ≤5%' },
  ], [{ articleId: 'KEC-232.52', relation: 'equivalent', note: 'KEC 합산 ≤5% (의무)' }]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Wiring Methods & Special
// ═══════════════════════════════════════════════════════════════════════════════

const WIRING_METHODS: CodeArticle[] = [
  nec('300.5', '300.5', '지중 매설 깊이 (Table 300.5)', [
    { param: 'burialDepthIn', operator: '>=', value: 24, unit: 'in', result: 'PASS', note: '직매: 24in, RMC: 6in, PVC: 18in (일반 조건)' },
  ], [{ articleId: 'KEC-232.31', relation: 'equivalent', note: 'KEC 매설 깊이' }]),

  nec('300.17', '300.17', '도관 내 전선 수 제한', [
    { param: 'conduitFillPercent', operator: '<=', value: 40, unit: '%', result: 'PASS', note: '3선 이상: ≤40% 충전율' },
  ], [{ articleId: 'KEC-232.31', relation: 'equivalent', note: 'KEC 충전율 40%' }, { articleId: 'JIS-521.2', relation: 'reference', note: 'JIS 충전율 32%' }]),

  nec('408.36', '408.36', '분전반 과전류보호 최대 수', [
    { param: 'panelCircuitCount', operator: '<=', value: 42, unit: 'ea', result: 'PASS', note: '분전반 당 최대 42회로 (2023 기준)' },
  ], [{ articleId: 'KEC-242.1', relation: 'equivalent', note: 'KEC 분전반 회로수' }]),

  nec('480.9', '480.9', '배터리실 환기 요건', [
    { param: 'batteryVentilation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '축전지실: 수소 가스 환기 시스템 필수' },
  ], [{ articleId: 'IEC-554.1', relation: 'equivalent', note: 'IEC 축전지실 환기' }]),

  nec('690.12', '690.12', '태양광 긴급차단장치', [
    { param: 'pvRapidShutdown', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '옥상 PV: 30초 이내 80V 이하 긴급차단 필수' },
  ], [{ articleId: 'KEC-501.1', relation: 'equivalent', note: 'KEC 태양광 안전' }, { articleId: 'IEC-712.1', relation: 'equivalent', note: 'IEC PV 안전' }]),

  nec('625.40', '625.40', '전기차 충전기 분기회로', [
    { param: 'evBranchCircuit', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: 'Level 2: 전용 분기회로 40A, 전선 ≥ 50A 허용전류' },
  ], [{ articleId: 'KEC-260.1', relation: 'equivalent', note: 'KEC EV 충전' }, { articleId: 'JIS-722.1', relation: 'equivalent', note: 'JIS EV 충전' }]),

  nec('700.12', '700.12', '비상 전원 — 자동 전환', [
    { param: 'emergencyTransferTime', operator: '<=', value: 10, unit: 's', result: 'PASS', note: '비상 전원: 10초 이내 자동 절환' },
  ], [{ articleId: 'KEC-700.1', relation: 'equivalent', note: 'KEC 비상전원' }]),

  nec('701.12', '701.12', '예비 전원 — 자동 전환', [
    { param: 'standbyTransferTime', operator: '<=', value: 60, unit: 's', result: 'PASS', note: '예비 전원: 60초 이내 자동 절환' },
  ], [{ articleId: 'NEC-700.12', relation: 'reference', note: '비상전원 연동' }]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// Export — 전체 NEC Articles Map (40조)
// ═══════════════════════════════════════════════════════════════════════════════

const ALL_NEC = [...WIRING, ...CONDUCTORS, ...GROUNDING, ...MOTORS, ...VOLTAGE_DROP, ...WIRING_METHODS];

export const NEC_ARTICLES_FULL = new Map<string, CodeArticle>(
  ALL_NEC.map(a => [a.id, a])
);

export function getNECArticleCount(): number {
  return NEC_ARTICLES_FULL.size;
}

export function getNECArticleFull(idOrClause: string): CodeArticle | null {
  return NEC_ARTICLES_FULL.get(idOrClause)
    ?? NEC_ARTICLES_FULL.get(`NEC-${idOrClause}`)
    ?? [...NEC_ARTICLES_FULL.values()].find(a => a.article === idOrClause)
    ?? null;
}
