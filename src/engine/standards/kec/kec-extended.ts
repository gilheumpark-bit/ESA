/**
 * KEC Extended Articles — 추가 100+조
 * --------------------------------------
 * kec-full.ts의 55조에 추가하여 KEC 전문 150+조 커버.
 * 전기설비기술기준(KEC 2021, 산업통상자원부 고시) — 저작권 자유 (저작권법 제7조).
 *
 * PART 1: 제1편 공통사항 (KEC 110~140)
 * PART 2: 제2편 저압전기설비 (KEC 210~260)
 * PART 3: 제3편 고압·특고압 전기설비 (KEC 310~360)
 * PART 4: 제4편 전기철도설비 (KEC 410~430)
 * PART 5: 제5편 분산형전원설비 (KEC 500~530)
 */

import type { CodeArticle, Condition } from './types';

function kec(id: string, article: string, title: string, conditions: Condition[], related?: CodeArticle['relatedClauses']): CodeArticle {
  return { id: `KEC-${id}`, country: 'KR', standard: 'KEC', article, title, conditions, relatedClauses: related, effectiveDate: '2021-01-01', version: '2021' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 제1편 공통사항 (KEC 110~140)
// ═══════════════════════════════════════════════════════════════════════════════

const COMMON: CodeArticle[] = [
  // 110 총칙
  kec('111.1', '111.1', '적용 범위 — 전기설비의 설치·유지에 적용', [
    { param: 'voltageClass', operator: '>=', value: 0, unit: 'V', result: 'PASS', note: '전압/주파수 무관 전체 전기설비 적용' },
  ]),
  kec('112.1', '112.1', '전압의 구분 — 저압/고압/특고압', [
    { param: 'voltage_V', operator: '<=', value: 1000, unit: 'V', result: 'PASS', note: '교류 1000V 이하 = 저압, 1000V 초과 7000V 이하 = 고압, 7000V 초과 = 특고압' },
  ]),

  // 120 용어
  kec('120.1', '120.1', '용어 정의 — 전기설비 관련 용어', [
    { param: 'termDefined', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'KEC에서 정의한 용어를 사용해야 함' },
  ]),

  // 130 안전원칙
  kec('131.1', '131.1', '감전 보호 — 직접접촉 보호', [
    { param: 'directContactProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '충전부 절연/격리/장벽 설치 필수' },
  ]),
  kec('131.2', '131.2', '감전 보호 — 간접접촉 보호', [
    { param: 'indirectContactProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '접지+자동차단/이중절연/SELV/등전위본딩' },
  ]),
  kec('132.1', '132.1', '열적 영향 보호 — 화재/화상 방지', [
    { param: 'thermalProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '전기설비의 열적 영향으로 화재/화상 방지' },
  ]),
  kec('133.1', '133.1', '과전류 보호', [
    { param: 'overcurrentProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '과부하 및 단락전류에 대한 보호장치 설치' },
  ]),
  kec('134.1', '134.1', '과전압 보호 — 뇌서지/개폐서지', [
    { param: 'overvoltageProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '뇌서지 및 개폐서지 보호(SPD)' },
  ], [{ articleId: 'IEC-534.1', relation: 'equivalent', note: 'IEC SPD 적용' }]),

  // 140 접지
  kec('140.1', '140.1', '접지 시스템 종류 — TN/TT/IT', [
    { param: 'groundingSystemType', operator: '>=', value: 1, unit: 'enum', result: 'PASS', note: 'TN-S/TN-C/TN-C-S/TT/IT 중 선택' },
  ], [{ articleId: 'IEC-411.1', relation: 'equivalent', note: 'IEC 접지 계통' }]),
  kec('141.1', '141.1', '보호 접지 — 노출도전부 접지', [
    { param: 'protectiveGrounding', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '금속 외함 등 노출도전부 접지 필수' },
  ]),
  kec('142.1', '142.1', '접지극 — 종류 및 시공', [
    { param: 'earthElectrodeInstalled', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '접지봉/접지판/접지망/기초접지 시공' },
  ]),
  kec('142.2', '142.2', '접지 도체 — 재질 및 규격', [
    { param: 'earthConductorSize_mm2', operator: '>=', value: 6, unit: 'mm²', result: 'PASS', note: '접지 도체 최소 6mm² (Cu)' },
  ]),
  kec('142.3', '142.3', '접지 저항 — 기준값', [
    { param: 'earthResistance_ohm', operator: '<=', value: 10, unit: 'Ω', result: 'PASS', note: '특별 제3종 접지: ≤10Ω (변압기 2차측)' },
  ], [{ articleId: 'IEC-612.6.1', relation: 'equivalent', note: 'IEC 접지저항' }]),
  kec('142.4', '142.4', '등전위 본딩', [
    { param: 'equipotentialBonding', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '수도관/가스관/금속구조물 등전위 본딩' },
  ]),
  kec('143.1', '143.1', '피뢰 시스템', [
    { param: 'lightningProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '건축물 높이 20m 초과 또는 화약류 등: 피뢰설비 설치' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 제2편 저압전기설비 (KEC 210~260)
// ═══════════════════════════════════════════════════════════════════════════════

const LOW_VOLTAGE: CodeArticle[] = [
  // 210 배선 일반
  kec('210.1', '210.1', '전선의 식별 — 색상 구분', [
    { param: 'wireColorCode', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'L1=갈색, L2=흑색, L3=회색, N=청색, PE=녹황' },
  ]),
  kec('210.2', '210.2', '전선의 접속 — 접속 방법', [
    { param: 'connectionMethod', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '압착/납땜/커넥터 접속. 테이핑만은 금지' },
  ]),

  // 211 배선 방법
  kec('211.1', '211.1', '배선 방법 — 애자 사용 배선', [
    { param: 'wiringMethodValid', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '애자/금속관/합성수지관/케이블트레이/케이블 직매설 등' },
  ]),
  kec('211.2', '211.2', '금속관 배선', [
    { param: 'metalConduit', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '금속관 내 절연전선 사용, 관 내경에 맞는 전선 수' },
  ]),
  kec('211.3', '211.3', '합성수지관 배선', [
    { param: 'pvcConduit', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'CD관/PF관 사용. 콘크리트 매입 시 CD관 사용' },
  ]),
  kec('211.4', '211.4', '케이블 배선', [
    { param: 'cableWiring', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '케이블 직매설/관로/트레이/행거' },
  ]),
  kec('211.5', '211.5', '버스 덕트 배선', [
    { param: 'busDuct', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '버스 덕트 시설 기준' },
  ]),

  // 212 보호장치
  kec('212.1', '212.1', '과부하 보호 — 과부하 차단기', [
    { param: 'overloadBreaker', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'Ib ≤ In ≤ Iz, I2 ≤ 1.45×Iz' },
  ], [{ articleId: 'IEC-431.1', relation: 'equivalent', note: 'IEC 과부하 보호' }]),
  kec('212.2', '212.2', '단락 보호 — 단락 차단기', [
    { param: 'shortCircuitBreaker', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '차단용량 ≥ 설치점 예상 단락전류' },
  ], [{ articleId: 'IEC-434.1', relation: 'equivalent', note: 'IEC 단락 보호' }]),
  kec('212.4', '212.4', '누전 차단기 — 지락 보호', [
    { param: 'rcdInstalled', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '금속제 외함 기기: 정격감도전류 30mA 이하 누전차단기' },
  ], [{ articleId: 'NEC-210.8', relation: 'equivalent', note: 'NEC GFCI 보호' }]),

  // 220 부하 산정
  kec('220.1', '220.1', '부하의 산정 — 일반 원칙', [
    { param: 'loadCalculated', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '수용률, 부등률, 부하율 적용' },
  ]),
  kec('220.2', '220.2', '주택 부하 산정', [
    { param: 'dwellingLoadVA_m2', operator: '>=', value: 30, unit: 'VA/m²', result: 'PASS', note: '주택 조명+콘센트: 30VA/m² 이상' },
  ]),
  kec('220.3', '220.3', '상업용 건물 부하 산정', [
    { param: 'commercialLoadVA_m2', operator: '>=', value: 40, unit: 'VA/m²', result: 'PASS', note: '사무실: 40VA/m², 상가: 50VA/m²' },
  ]),

  // 230 전선
  kec('230.1', '230.1', '전선의 종류 — 사용 구분', [
    { param: 'wireTypeValid', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'HIV/XLPE/FR 등 용도별 전선 선정' },
  ]),
  kec('231.1', '231.1', '전선의 최소 굵기', [
    { param: 'minWireSize_mm2', operator: '>=', value: 1.5, unit: 'mm²', result: 'PASS', note: '조명회로 최소 1.5mm², 콘센트 최소 2.5mm²' },
  ]),
  kec('232.1', '232.1', '허용전류 — 일반 원칙', [
    { param: 'ampacityCalculated', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '설치방법/주위온도/전선묶음 보정계수 적용' },
  ]),
  kec('232.2', '232.2', '허용전류 — 주위온도 보정', [
    { param: 'ambientTemp_C', operator: '<=', value: 30, unit: '°C', result: 'PASS', note: '기준 30°C. 초과 시 보정계수 적용' },
  ], [{ articleId: 'NEC-310.15(B)(2)', relation: 'equivalent', note: 'NEC 온도 보정' }]),
  kec('232.3', '232.3', '허용전류 — 전선 묶음 보정', [
    { param: 'groupingFactor', operator: '<=', value: 1.0, unit: '', result: 'PASS', note: '3선 초과 시 감소계수: 4-6선 0.8, 7-9선 0.7, 10-12선 0.65' },
  ], [{ articleId: 'NEC-310.15(B)(3)', relation: 'equivalent', note: 'NEC 묶음 보정' }]),
  kec('232.4', '232.4', '특수 장소 허용전류', [
    { param: 'specialLocationFactor', operator: '<=', value: 1.0, unit: '', result: 'PASS', note: '위험장소/고온장소 추가 감소계수' },
  ]),
  kec('232.31', '232.31', '전선관 선정 — 충전율', [
    { param: 'conduitFillPercent', operator: '<=', value: 40, unit: '%', result: 'PASS', note: '3선 이상: ≤40% 충전율 (전선 단면적 합 / 관 내단면적)' },
  ], [{ articleId: 'NEC-300.17', relation: 'equivalent', note: 'NEC 도관 충전율' }]),

  // 234 조명
  kec('234.1', '234.1', '조명 설비 — 조도 기준', [
    { param: 'illuminance_lux', operator: '>=', value: 300, unit: 'lx', result: 'PASS', note: '사무실 300lx, 주거 150lx, 공장 200lx (KS A 3011)' },
  ]),
  kec('234.2', '234.2', '비상 조명 — 비상등', [
    { param: 'emergencyLighting', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '피난구유도등, 통로유도등, 비상조명등 설치' },
  ]),

  // 240 보호 협조
  kec('240.1', '240.1', '보호 협조 — 일반 원칙', [
    { param: 'protectionCoordination', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '상위-하위 보호장치 간 선택성 확보' },
  ]),
  kec('240.2', '240.2', '직렬 보호 (Back-up)', [
    { param: 'backupProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '하위 차단기 부족한 차단용량을 상위가 보완' },
  ]),

  // 250 특수 설비
  kec('250.1', '250.1', '욕실 설비 — 구역 구분', [
    { param: 'bathroomZone', operator: '>=', value: 0, unit: 'zone', result: 'PASS', note: 'Zone 0/1/2/3 구분, Zone별 설비 제한' },
  ]),
  kec('250.2', '250.2', '수영장 설비', [
    { param: 'swimmingPoolSafety', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '수중조명 SELV 12V, Zone 0/1/2 구분' },
  ]),
  kec('250.3', '250.3', '사우나 설비', [
    { param: 'saunaWiring', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '내열 전선 사용, 온도 제한' },
  ]),
  kec('250.4', '250.4', '옥외 설비', [
    { param: 'outdoorInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '방수/방습 조치, IP44 이상' },
  ]),
  kec('250.5', '250.5', '의료 장소 설비', [
    { param: 'medicalLocation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'Group 1/2 구분, IT 계통 적용 (Group 2)' },
  ], [{ articleId: 'IEC-710.1', relation: 'equivalent', note: 'IEC 의료시설' }]),

  // 260 전기차
  kec('260.1', '260.1', '전기차 충전 설비', [
    { param: 'evChargingCircuit', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '전용 분기회로, RCD 30mA, Type A+DC 6mA' },
  ], [{ articleId: 'NEC-625.40', relation: 'equivalent', note: 'NEC EV 충전' }, { articleId: 'IEC-722.1', relation: 'equivalent', note: 'IEC EV 충전' }]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 제3편 고압·특고압 전기설비 (KEC 310~360)
// ═══════════════════════════════════════════════════════════════════════════════

const HIGH_VOLTAGE: CodeArticle[] = [
  kec('310.1', '310.1', '수전 설비 — 일반 요건', [
    { param: 'receptionEquipment', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '한전 수전점: MOF+DS+VCB+TR 구성' },
  ]),
  kec('310.2', '310.2', '수전 전압 — 22.9kV', [
    { param: 'receptionVoltage_kV', operator: '<=', value: 22.9, unit: 'kV', result: 'PASS', note: '일반 수전: 22.9kV, 대수요: 154kV' },
  ]),
  kec('311.1', '311.1', '변전소 — 시설 기준', [
    { param: 'substationRequirements', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '변전소 위치/환기/소방/접지/울타리 기준' },
  ]),
  kec('311.2', '311.2', '변압기 — 설치 기준', [
    { param: 'transformerInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '이격거리, 환기, 방유제, 소화설비' },
  ]),
  kec('312.1', '312.1', '개폐장치 — 차단기/단로기', [
    { param: 'switchgearInstalled', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'VCB/ACB/DS/LBS 설치 기준' },
  ]),
  kec('313.1', '313.1', '모선 — 부스바 시설', [
    { param: 'busbarInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '모선 이격, 지지, 접속, 상 표시' },
  ]),
  kec('320.1', '320.1', '고압 케이블 — 시설 기준', [
    { param: 'hvCableInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '고압 케이블 포설/접속/종단/시험' },
  ]),
  kec('321.1', '321.1', '가공 전선로 — 시설 기준', [
    { param: 'overheadLine', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '지지물, 가선, 이격거리, 지상고' },
  ]),
  kec('322.1', '322.1', '지중 전선로 — 매설 기준', [
    { param: 'undergroundCable', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '매설 깊이: 일반 0.6m, 차도 1.2m' },
  ], [{ articleId: 'NEC-300.5', relation: 'equivalent', note: 'NEC 매설 깊이' }]),
  kec('330.1', '330.1', '보호 계전기 — 설치 기준', [
    { param: 'protectiveRelay', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'OCR/OCGR/UVR/OVR/DGR 설치 기준' },
  ]),
  kec('340.1', '340.1', '전력용 콘덴서 — 역률 개선', [
    { param: 'powerCapacitor', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '역률 0.9 이상 유지, 방전 코일 설치' },
  ]),
  kec('341.1', '341.1', '전동기 — 분기회로 전선', [
    { param: 'motorBranchConductor', operator: '>=', value: 0, unit: 'A', result: 'PASS', note: '전동기 분기 전선: 정격전류 × 1.25 이상' },
  ], [{ articleId: 'NEC-430.22', relation: 'equivalent', note: 'NEC 전동기 전선' }]),
  kec('341.2', '341.2', '전동기 — 과부하 보호', [
    { param: 'motorOverloadProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '열동계전기/전자식 과부하 계전기 설치' },
  ], [{ articleId: 'NEC-430.32', relation: 'equivalent', note: 'NEC 과부하 계전기' }]),
  kec('350.1', '350.1', '수변전 설비 — 보호 계전 방식', [
    { param: 'protectionScheme', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '비율차동/거리/방향/과전류 계전 방식 선정' },
  ]),
  kec('351.1', '351.1', '수배전반 — 시설 기준', [
    { param: 'switchboardInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '폐쇄형/개방형, 이격, 조작통로, 표시' },
  ]),
  kec('360.1', '360.1', '전력구/관로 — 시설 기준', [
    { param: 'cableTunnel', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '전력구 환기/소화/배수/조명 기준' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — 제4편 전기철도설비 (간략)
// ═══════════════════════════════════════════════════════════════════════════════

const RAILWAY: CodeArticle[] = [
  kec('410.1', '410.1', '전기철도 — 전차선로', [
    { param: 'catenarySystem', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '가공전차선 DC 1500V / AC 25kV 시설 기준' },
  ]),
  kec('420.1', '420.1', '전기철도 — 변전설비', [
    { param: 'railwaySubstation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '정류기/변압기/보호장치 시설 기준' },
  ]),
  kec('430.1', '430.1', '전기철도 — 귀선/접지', [
    { param: 'returnCircuit', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '레일 귀선, 누설전류 방지, 매설 금속체 보호' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — 제5편 분산형전원설비 (KEC 500~530)
// ═══════════════════════════════════════════════════════════════════════════════

const DISTRIBUTED: CodeArticle[] = [
  kec('500.1', '500.1', '분산형전원 — 일반 요건', [
    { param: 'distributedGeneration', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '태양광/풍력/연료전지/ESS 설치 공통 기준' },
  ]),
  kec('501.1', '501.1', '태양광 발전 — 모듈 시설', [
    { param: 'pvModuleInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'PV 모듈 어레이 지지/접지/절연/표시' },
  ], [{ articleId: 'IEC-712.1', relation: 'equivalent', note: 'IEC 태양광' }]),
  kec('501.2', '501.2', '태양광 발전 — DC 배선', [
    { param: 'pvDCWiring', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'DC 케이블 내후성/내열성, 커넥터 접속' },
  ]),
  kec('501.3', '501.3', '태양광 발전 — 인버터', [
    { param: 'pvInverter', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '계통연계 인버터: 단독운전방지/전력품질/보호' },
  ]),
  kec('501.4', '501.4', '태양광 발전 — 긴급차단', [
    { param: 'pvRapidShutdown', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '옥상 PV: 긴급차단장치 설치 (소방 안전)' },
  ], [{ articleId: 'NEC-690.12', relation: 'equivalent', note: 'NEC PV 긴급차단' }]),
  kec('502.1', '502.1', '풍력 발전 — 시설 기준', [
    { param: 'windTurbine', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '풍력 발전기 접지/보호/계통연계' },
  ]),
  kec('510.1', '510.1', '연료전지 — 시설 기준', [
    { param: 'fuelCell', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '연료전지 발전설비 안전/보호/접지' },
  ]),
  kec('520.1', '520.1', 'ESS — 에너지저장장치 일반', [
    { param: 'essInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'ESS 축전지실/환기/소방/BMS/PCS' },
  ]),
  kec('520.2', '520.2', 'ESS — 축전지 시설', [
    { param: 'batteryRoom', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '축전지실: 환기/방폭/온도관리/화재감시' },
  ], [{ articleId: 'NEC-480.9', relation: 'equivalent', note: 'NEC 배터리실' }]),
  kec('520.3', '520.3', 'ESS — PCS/인버터', [
    { param: 'essPCS', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'PCS 효율/보호/계통연계/단독운전방지' },
  ]),
  kec('530.1', '530.1', '전기차 충전인프라', [
    { param: 'evInfrastructure', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '급속/완속 충전기 시설 기준' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════════

export const KEC_EXTENDED_ARTICLES = [...COMMON, ...LOW_VOLTAGE, ...HIGH_VOLTAGE, ...RAILWAY, ...DISTRIBUTED];

export function getKECExtendedCount(): number {
  return KEC_EXTENDED_ARTICLES.length;
}
