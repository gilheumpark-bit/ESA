/**
 * IEC 60364 Articles — 25+ 핵심 조항
 * ------------------------------------
 * 기준값/숫자/조건식만 저장 (사실 정보, 저작권 자유).
 * 원문 확인: https://webstore.iec.ch/en/publication/59666
 *
 * PART 1: Protection (Part 4-41, 4-43)
 * PART 2: Selection & Erection (Part 5-52, 5-53, 5-54)
 * PART 3: Verification (Part 6-61)
 * PART 4: Special Installations (Part 7)
 */

import type { CodeArticle } from '../kec/types';

export const IEC_SOURCE_URL = 'https://webstore.iec.ch/en/publication/59666';

function iec(id: string, article: string, title: string, conditions: CodeArticle['conditions'], related?: CodeArticle['relatedClauses']): CodeArticle {
  return { id: `IEC-${id}`, country: 'INT', standard: 'IEC 60364', article, title, conditions, relatedClauses: related, effectiveDate: '2017-03-01', version: '6th Ed.' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Protection against electric shock (Part 4)
// ═══════════════════════════════════════════════════════════════════════════════

const PROTECTION: CodeArticle[] = [
  iec('411.1', '411.1', '감전 보호 — 접촉전압 제한', [
    { param: 'touchVoltage', operator: '<=', value: 50, unit: 'V', result: 'PASS', note: '접촉전압 ≤50V AC (건조 조건)' },
  ], [{ articleId: 'KEC-142.5', relation: 'equivalent', note: 'KEC 접지 보호' }, { articleId: 'NEC-250.24', relation: 'equivalent', note: 'NEC 접지' }]),

  iec('411.3.2', '411.3.2', 'TN 계통 자동차단 시간', [
    { param: 'disconnectionTime_s', operator: '<=', value: 0.4, unit: 's', result: 'PASS', note: 'TN 230V ≤32A: ≤0.4s, 배전회로: ≤5s' },
  ], [{ articleId: 'KEC-212.3', relation: 'equivalent', note: 'KEC 차단시간' }]),

  iec('411.3.3', '411.3.3', 'TT 계통 RCD 보호', [
    { param: 'rcdRating_mA', operator: '<=', value: 30, unit: 'mA', result: 'PASS', note: 'TT ≤32A 콘센트: RCD ≤30mA' },
  ]),

  iec('411.4', '411.4', 'IT 계통 보호 조건', [
    { param: 'insulationMonitor', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'IT 계통: 절연감시장치(IMD) 필수' },
  ]),

  iec('411.6', '411.6', 'SELV/PELV 초저압 회로', [
    { param: 'voltage', operator: '<=', value: 50, unit: 'V AC', result: 'PASS', note: 'SELV: ≤50V AC / 120V DC (접촉 보호 면제)' },
  ]),

  iec('413.1', '413.1', '간접 접촉 보호 — 보호 등전위 본딩', [
    { param: 'bondingPresent', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '주 등전위 본딩: 수도관/가스관/금속구조물 연결' },
  ]),

  iec('431.1', '431.1', '과전류 보호 — 과부하', [
    { param: 'overloadProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'Ib ≤ In ≤ Iz, I2 ≤ 1.45 × Iz' },
  ]),

  iec('434.1', '434.1', '단락전류 보호', [
    { param: 'breakingCapacity_kA', operator: '>=', value: 0, unit: 'kA', result: 'PASS', note: '차단용량 ≥ 설치점 예상 단락전류' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Selection & Erection (Part 5)
// ═══════════════════════════════════════════════════════════════════════════════

const SELECTION: CodeArticle[] = [
  iec('523.1', '523.1', '전선 허용전류 — 설치 방법별', [
    { param: 'loadCurrent', operator: '<=', value: 0, unit: 'A', result: 'PASS', note: '설치 방법(A1/A2/B1/B2/C/D/E/F)별 허용전류 적용' },
  ], [{ articleId: 'KEC-232.3', relation: 'equivalent', note: 'KEC 허용전류' }, { articleId: 'NEC-310.16', relation: 'equivalent', note: 'NEC Table 310.16' }]),

  iec('524.1', '524.1', '전선 단면적 — 기계적 강도', [
    { param: 'minConductorSize', operator: '>=', value: 1.5, unit: 'mm²', result: 'PASS', note: '고정 설비 최소: Cu 1.5mm², Al 16mm²' },
  ]),

  iec('525.1', '525.1', '전압강하 권고 기준', [
    { param: 'voltageDropPercent', operator: '<=', value: 4, unit: '%', result: 'PASS', note: '조명 ≤3%, 기타 ≤5% (권고)' },
  ], [{ articleId: 'KEC-232.52', relation: 'equivalent', note: 'KEC 전압강하' }, { articleId: 'NEC-VD-BRANCH', relation: 'equivalent', note: 'NEC 전압강하' }]),

  iec('533.1', '533.1', '개폐기 선정 — 차단용량', [
    { param: 'breakingCapacity_kA', operator: '>=', value: 0, unit: 'kA', result: 'PASS', note: '차단용량 ≥ 설치점 예상 단락전류' },
  ]),

  iec('534.1', '534.1', 'SPD 선정 및 적용', [
    { param: 'spdInstalled', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '뇌서지 위험 시 SPD 설치 (위험도 평가 per IEC 62305)' },
  ], [{ articleId: 'KEC-534.1', relation: 'equivalent', note: 'KEC SPD' }]),

  iec('543.1', '543.1', '보호 도체 단면적', [
    { param: 'protectiveConductorSize', operator: '>=', value: 0, unit: 'mm²', result: 'PASS', note: '상도체 ≤16mm²: 동일, 16~35: 16mm², >35: 상도체의 1/2' },
  ]),

  iec('544.1', '544.1', '접지극 종류 및 설치', [
    { param: 'earthElectrodePresent', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '기초접지/봉접지/판접지/환접지 중 선택' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Verification (Part 6)
// ═══════════════════════════════════════════════════════════════════════════════

const VERIFICATION: CodeArticle[] = [
  iec('612.1', '612.1', '육안 검사 — 통전 전 확인', [
    { param: 'visualInspectionDone', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '접속, 표시, 보호장치, 배선 방법 등 육안 검사' },
  ]),

  iec('612.3', '612.3', '절연 저항 시험', [
    { param: 'insulationResistance_MOhm', operator: '>=', value: 1, unit: 'MΩ', result: 'PASS', note: 'SELV/PELV: ≥0.5MΩ, ≤500V: ≥1MΩ (500V DC 시험)' },
  ]),

  iec('612.4', '612.4', '보호 도체 연속성 시험', [
    { param: 'continuityConductorOhm', operator: '<=', value: 1, unit: 'Ω', result: 'PASS', note: '보호 도체 연속성 확인 (저저항계 사용)' },
  ]),

  iec('612.5', '612.5', '극성 시험', [
    { param: 'polarityCorrect', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '단극 개폐기가 상도체(L)에 연결 확인' },
  ]),

  iec('612.6.1', '612.6.1', '접지극 저항 측정', [
    { param: 'earthResistance_Ohm', operator: '<=', value: 10, unit: 'Ω', result: 'PASS', note: 'TT: R_A × I_Δn ≤ 50V. 일반 목표 ≤10Ω' },
  ], [{ articleId: 'KEC-142.5-A', relation: 'equivalent', note: 'KEC 접지저항' }]),

  iec('612.9', '612.9', '기능 시험', [
    { param: 'functionalTestDone', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'RCD 동작, 비상차단, 기능 시험 수행' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Special Installations (Part 7)
// ═══════════════════════════════════════════════════════════════════════════════

const SPECIAL: CodeArticle[] = [
  iec('710.1', '710.1', '의료 시설 — 전기 설비', [
    { param: 'medicalITSystem', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'Group 2 의료실: IT 계통 + 절연감시 필수' },
  ]),

  iec('712.1', '712.1', '태양광 발전 설비', [
    { param: 'pvDisconnect', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'PV 어레이: DC 개폐기 + 역류방지 다이오드' },
  ]),

  iec('722.1', '722.1', '전기차 충전 설비', [
    { param: 'evDedicatedCircuit', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'EV 충전: 전용 회로 + Type A RCD (DC 6mA)' },
  ]),

  iec('753.1', '753.1', '난방 케이블/매트 설비', [
    { param: 'heatingCableRCD', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '바닥 난방: RCD ≤30mA + 금속 차폐층 접지' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// Export (25조)
// ═══════════════════════════════════════════════════════════════════════════════

const ALL_IEC = [...PROTECTION, ...SELECTION, ...VERIFICATION, ...SPECIAL];

export const IEC_ARTICLES = new Map<string, CodeArticle>(
  ALL_IEC.map(a => [a.id, a])
);

export function getIECArticleCount(): number {
  return IEC_ARTICLES.size;
}

export function getIECArticle(idOrClause: string): CodeArticle | null {
  return IEC_ARTICLES.get(idOrClause)
    ?? IEC_ARTICLES.get(`IEC-${idOrClause}`)
    ?? [...IEC_ARTICLES.values()].find(a => a.article === idOrClause)
    ?? null;
}
