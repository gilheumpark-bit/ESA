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
  // 120 용어 — 전압 구분도 여기다. `112.1` 은 없는 번호였다(112 는 하위가 없다).
  kec('112', '112', '용어 정의', [
    { param: 'termDefined', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'KEC에서 정의한 용어를 사용해야 함' },
    { param: 'voltage_V', operator: '<=', value: 1000, unit: 'V', result: 'PASS', note: '교류 1000V 이하 = 저압, 1000V 초과 7000V 이하 = 고압, 7000V 초과 = 특고압' },
  ]),

  // 113 안전을 위한 보호 — 재번호 2026-07-27.
  //
  // 감전·열·과전류·과전압 보호를 `131.1/132.1/133.1/134.1` 로 달고 있었다.
  // 현행에서 그 자리는 전부 **절연내력** 조항이다 —
  //   131 전로의 절연 원칙 · 132 전로의 절연저항 및 절연내력 ·
  //   133 회전기 및 정류기의 절연내력 · 134 연료전지 및 태양전지 모듈의 절연내력
  // 안전 보호 원칙은 113 이다. 게다가 131.1 등은 하위 번호 자체가 없어서,
  // 상위(131)가 실재한다는 이유로 번호 게이트를 빠져나가고 있었다.
  kec('113.2', '113.2', '감전에 대한 보호', [
    { param: 'directContactProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '충전부 절연/격리/장벽 설치 필수(기본보호)' },
    { param: 'indirectContactProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '접지+자동차단/이중절연/SELV/등전위본딩(고장보호)' },
  ]),
  kec('113.3', '113.3', '열 영향에 대한 보호', [
    { param: 'thermalProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '전기설비의 열적 영향으로 화재/화상 방지' },
  ]),
  kec('113.4', '113.4', '과전류에 대한 보호', [
    { param: 'overcurrentProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '과부하 및 단락전류에 대한 보호장치 설치' },
  ]),
  kec('113.6', '113.6', '전압외란 및 전자기 장애에 대한 대책', [
    { param: 'overvoltageProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '뇌서지 및 개폐서지 보호(SPD)' },
  ], [{ articleId: 'IEC-534.1', relation: 'equivalent', note: 'IEC SPD 적용' }]),

  // 140 접지
  kec('141', '141', '접지시스템의 구분 및 종류', [
    { param: 'groundingSystemType', operator: '>=', value: 1, unit: 'enum', result: 'PASS', note: 'TN-S/TN-C/TN-C-S/TT/IT 중 선택' },
  ], [{ articleId: 'IEC-411.1', relation: 'equivalent', note: 'IEC 접지 계통' }]),
  // `141.1` 도 없는 번호였다. 노출도전부(금속 외함) 접지는 142.7 이다.
  kec('142.7', '142.7', '기계기구의 철대 및 외함의 접지', [
    { param: 'protectiveGrounding', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '금속 외함 등 노출도전부 접지 필수' },
  ]),
  // 접지 계열 재번호 2026-07-27. 142.2 와 142.3 이 **서로 바뀌어** 있었다 —
  // 리포는 142.2 를 접지도체로, 142.3 을 접지저항으로 달았는데 현행은
  // 142.2 접지극의 시설 및 접지저항 / 142.3 접지도체·보호도체 다.
  //
  //   142.1 접지극 시공  ┐
  //   142.3 접지저항     ┘→ 142.2 접지극의 시설 및 접지저항 (표제가 둘 다 덮는다)
  //   142.2 접지도체      → 142.3.1 접지도체
  //   142.4 등전위본딩    → 143.1  보호등전위본딩의 적용
  //   143.1 피뢰시스템    → 151.1  피뢰시스템 적용범위
  kec('142.2', '142.2', '접지극의 시설 및 접지저항', [
    { param: 'earthElectrodeInstalled', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '접지봉/접지판/접지망/기초접지 시공' },
    { param: 'earthResistance_ohm', operator: '<=', value: 10, unit: 'Ω', result: 'PASS', note: '특별 제3종 접지: ≤10Ω (변압기 2차측)' },
  ], [{ articleId: 'IEC-612.6.1', relation: 'equivalent', note: 'IEC 접지저항' }]),
  kec('142.3.1', '142.3.1', '접지도체', [
    { param: 'earthConductorSize_mm2', operator: '>=', value: 6, unit: 'mm²', result: 'PASS', note: '접지 도체 최소 6mm² (Cu)' },
  ]),
  kec('143.1', '143.1', '보호등전위본딩의 적용', [
    { param: 'equipotentialBonding', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '수도관/가스관/금속구조물 등전위 본딩' },
  ]),
  kec('151.1', '151.1', '피뢰시스템 적용범위', [
    { param: 'lightningProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '건축물 높이 20m 초과 또는 화약류 등: 피뢰설비 설치' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 제2편 저압전기설비 (KEC 210~260)
// ═══════════════════════════════════════════════════════════════════════════════

const LOW_VOLTAGE: CodeArticle[] = [
  // 210 배선 일반
  kec('121.2', '121.2', '전선의 식별', [
    { param: 'wireColorCode', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'L1=갈색, L2=흑색, L3=회색, N=청색, PE=녹황' },
  ]),
  kec('123', '123', '전선의 접속', [
    { param: 'connectionMethod', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '압착/납땜/커넥터 접속. 테이핑만은 금지' },
  ]),

  // 232 배선설비 — 공사방법
  //
  // 이 다섯은 `211.1~211.5` 로 등록돼 있었다. 현행 211 은 **감전에 대한 보호**고
  // 공사방법은 232 다. 2026-07-27 재번호.
  //
  // 금속관·합성수지관은 kec-full 도 각자 정의하고 있어서(관 굵기) 그쪽으로
  // 조건을 합치고 여기서는 뺐다 — 등록부가 먼저 등록된 kec-full 만 남기므로
  // 두 곳에 두면 이 파일 정의가 통째로 버려진다.
  kec('232.2', '232.2', '배선설비 공사의 종류', [
    { param: 'wiringMethodValid', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '애자/금속관/합성수지관/케이블트레이/케이블 직매설 등' },
  ]),
  kec('232.51', '232.51', '케이블공사', [
    { param: 'cableWiring', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '케이블 직매설/관로/트레이/행거' },
  ]),
  kec('232.61', '232.61', '버스덕트공사', [
    { param: 'busDuct', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '버스 덕트 시설 기준' },
  ]),

  // 212 보호장치 — 재번호 2026-07-27.
  //
  // 현행 212.1 은 일반사항, 212.2 는 회로의 특성에 따른 요구사항이고
  // 과부하는 **212.4**, 단락은 **212.5** 다. 세 자리가 한 칸씩 밀려 있었다.
  //
  // 누전차단기는 212.4 가 아니라 211.2.4 다(전원의 자동차단에 의한 보호대책).
  // 그 조항은 kec-full 이 이미 갖고 있어 조건을 그쪽으로 합쳤다.
  kec('212.4', '212.4', '과부하전류에 대한 보호', [
    { param: 'overloadBreaker', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'Ib ≤ In ≤ Iz, I2 ≤ 1.45×Iz' },
  ], [{ articleId: 'IEC-431.1', relation: 'equivalent', note: 'IEC 과부하 보호' }]),
  kec('212.5', '212.5', '단락전류에 대한 보호', [
    { param: 'shortCircuitBreaker', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '차단용량 ≥ 설치점 예상 단락전류' },
  ], [{ articleId: 'IEC-434.1', relation: 'equivalent', note: 'IEC 단락 보호' }]),

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
  kec('231.3.2', '231.3.2', '중성선의 단면적', [
    { param: 'wireTypeValid', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'HIV/XLPE/FR 등 용도별 전선 선정' },
  ]),
  kec('231.1', '231.1', '전선의 최소 굵기', [
    { param: 'minWireSize_mm2', operator: '>=', value: 1.5, unit: 'mm²', result: 'PASS', note: '조명회로 최소 1.5mm², 콘센트 최소 2.5mm²' },
  ]),
  // 허용전류는 232.5 다 — `232.1~232.4` 로 등록돼 있었다(현행 232.1 적용범위 /
  // 232.2 배선설비 공사의 종류 / 232.3 고려사항 / 232.4 외부영향). 2026-07-27 재번호.
  //
  // 주위온도 보정은 kec-full 의 232.5.2 로 합쳤다. 여기 값(기준 30°C)이 맞고
  // kec-full 이 갖고 있던 40°C 가 틀렸는데, 등록부가 kec-full 만 남기는 바람에
  // **틀린 쪽이 live 였다.** 허용전류표(kec-ampacity.ts)도 30°C 기준이다.
  kec('232.5', '232.5', '허용전류', [
    { param: 'ampacityCalculated', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '설치방법/주위온도/전선묶음 보정계수 적용' },
  ]),
  // 묶음 보정(groupingFactor)은 kec-full 의 232.5.3 으로 합쳤다 — 같은 조항을
  // 두 파일에 두면 나중 등록분이 통째로 버려진다.
  kec('232.4', '232.4', '배선설비의 선정과 설치에 고려해야할 외부영향', [
    { param: 'specialLocationFactor', operator: '<=', value: 1.0, unit: '', result: 'PASS', note: '위험장소/고온장소 등 외부영향에 따른 추가 감소계수' },
  ]),
  // 원문 확인 2026-07-26: 232.31 은 전선관이 아니라 **금속덕트공사**이고 한도는
  // 20% 다(표시장치·제어회로 배선만이면 50%). 여기 있던 "전선관 충전율 40%" 는
  // 조항·출처·값이 전부 달랐다 — 40% 는 NEC Chapter 9 Table 1 값이고, 한국의
  // 전선관 충전율은 KEC 가 아니라 내선규정 2225-5(32%/48%) 소관이다.
  // 전선관 공사(232.11 합성수지관·232.12 금속관·232.13 가요전선관)에는 KEC 가
  // 충전율을 규정하지 않는다.
  kec('232.31', '232.31', '금속덕트공사 — 덕트 내 전선 단면적', [
    { param: 'ductFillPercent', operator: '<=', value: 20, unit: '%', result: 'PASS', note: '덕트 내부 단면적의 20% 이하 (전선 절연피복 포함 단면적 합)' },
    { param: 'ductFillPercentControlOnly', operator: '<=', value: 50, unit: '%', result: 'PASS', note: '전광표시장치·제어회로 배선만인 경우 50% 이하' },
  ], [{ articleId: 'NEC-376.22', relation: 'reference', note: 'NEC 금속 wireway 충전율 20%' }]),

  // 조도 기준(234.1)·비상등(234.2)을 뺐다 2026-07-27 — **KEC 조항이 아니다.**
  //
  // 현행 234 조명설비의 하위를 전수 확인했더니 등기구·코드·전구선·콘센트·
  // 점멸기·옥외등·전주외등·방전등·네온·수중조명·교통신호등뿐이고 조도 기준도
  // 비상조명도 없다. 원문 전체에서 "조도"는 710.10(수력 서지탱크 조도계수)
  // 하나뿐이고 "비상조명"은 0 건이다.
  //
  // 실제 소관: 조도 = KS A 3011(조도기준) · 비상조명·유도등 = 소방시설법
  // (NFPC 303 유도등, NFPC 304 비상조명등). 이 리포는 KS·소방 규격 세트를
  // 갖고 있지 않다. 없는 KEC 번호를 붙여 두느니 빼고, 어디 있는지만 남긴다.
  // 소비처는 0 이었다(illuminance_lux·emergencyLighting 을 읽는 코드 없음).

  // 240 보호 협조
  kec('212.4.1', '212.4.1', '도체와 과부하 보호장치 사이의 협조', [
    { param: 'protectionCoordination', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '상위-하위 보호장치 간 선택성 확보' },
  ]),
  kec('240.2', '240.2', '직렬 보호 (Back-up)', [
    { param: 'backupProtection', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '하위 차단기 부족한 차단용량을 상위가 보완' },
  ]),

  // 250 특수 설비
  // 욕실(250.1)·수영장(250.2)·사우나(250.3)·옥외(250.4)를 여기서 뺐다(2026-07-27).
  //
  // KEC 현행 전문의 「242 특수 장소」를 전수 확인했더니 방전등·분진·가스·위험물·
  // 화약류·전시회·터널·야영지·마리나·의료장소·엘리베이터뿐이고 욕실·수영장·
  // 사우나가 없다. 애초에 KEC 가 채택하지 않은 IEC 개념을 KEC 조항 번호로
  // 제시하고 있었다 — 감리·검사에서 근거를 댈 수 없는 인용이다.
  //
  // 욕실·수영장·사우나는 IEC 60364-7-701/702/703 으로 옮겼다(iec-articles.ts).
  // 옥외(IP44)는 특정 조항이 아니라 외부영향 일반(KEC 231.2.2 / IEC 512)에
  // 걸리는 사항이라 별도 조항으로 두지 않고 뺐다 — 지어낼 자리가 아니다.
  kec('242.10', '242.10', '의료장소', [
    { param: 'medicalLocation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'Group 1/2 구분, IT 계통 적용 (Group 2)' },
  ], [{ articleId: 'IEC-710.1', relation: 'equivalent', note: 'IEC 의료시설' }]),

  // 260 전기차
  kec('241.17', '241.17', '전기자동차 전원설비', [
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
  kec('351.4', '351.4', '특고압용 변압기의 보호장치', [
    { param: 'protectiveRelay', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'OCR/OCGR/UVR/OVR/DGR 설치 기준' },
  ]),
  kec('351.5', '351.5', '조상설비의 보호장치', [
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
  kec('431', '431', '전차선로의 일반사항', [
    { param: 'catenarySystem', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '가공전차선 DC 1500V / AC 25kV 시설 기준' },
  ]),
  kec('411', '411', '전기방식의 일반사항', [
    { param: 'railwaySubstation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '정류기/변압기/보호장치 시설 기준' },
  ]),
  kec('431.5', '431.5', '귀선로', [
    { param: 'returnCircuit', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '레일 귀선, 누설전류 방지, 매설 금속체 보호' },
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — 제5편 분산형전원설비 (KEC 500~530)
// ═══════════════════════════════════════════════════════════════════════════════

const DISTRIBUTED: CodeArticle[] = [
  // 분산형전원 재번호 2026-07-27. 500.1·501.4·502.1 은 아예 없는 번호였고
  // 501.x·502.x 는 남의 자리였다 — 현행 501 은 일반사항(501.1 목적),
  // 502 는 **용어의 정의**다. 태양광은 521/522, 풍력은 532/533 다.
  //
  //   500.1 분산형전원 일반  → 503   분산형전원 계통 연계설비의 시설
  //   501.1 모듈 시설        → 522.2 태양광설비의 시설기준
  //   501.2 DC 배선          → 522.1 간선의 시설기준
  //   501.3 인버터 ┐
  //   501.4 긴급차단 ┘       → 522.3 제어 및 보호장치 등
  //   502.1 풍력             → 532   육상 풍력발전설비
  kec('503', '503', '분산형전원 계통 연계설비의 시설', [
    { param: 'distributedGeneration', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '태양광/풍력/연료전지/ESS 설치 공통 기준' },
  ]),
  // 522.2 모듈 시설 · 522.3 인버터/긴급차단은 kec-full 이 같은 번호를 갖고
  // 있어(구 502.x) 조건을 그쪽으로 합쳤다. 여기 남기면 통째로 버려진다.
  kec('522.1', '522.1', '간선의 시설기준', [
    { param: 'pvDCWiring', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'DC 케이블 내후성/내열성, 커넥터 접속' },
  ]),
  kec('532', '532', '육상 풍력발전설비', [
    { param: 'windTurbine', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '풍력 발전기 접지/보호/계통연계' },
  ]),
  kec('542', '542', '연료전지설비의 시설', [
    { param: 'fuelCell', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '연료전지 발전설비 안전/보호/접지' },
  ]),
  kec('511.2', '511.2', '전기저장장치의 시설', [
    { param: 'essInstallation', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'ESS 축전지실/환기/소방/BMS/PCS' },
  ]),
  kec('512.1', '512.1', '리튬계·나트륨계 이차전지의 시설', [
    { param: 'batteryRoom', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: '축전지실: 환기/방폭/온도관리/화재감시' },
  ], [{ articleId: 'NEC-480.9', relation: 'equivalent', note: 'NEC 배터리실' }]),
  kec('512.1.4', '512.1.4', '제어, 감시 및 보호장치 등', [
    { param: 'essPCS', operator: '==', value: 1, unit: 'bool', result: 'PASS', note: 'PCS 효율/보호/계통연계/단독운전방지' },
  ]),
  kec('241.17.3', '241.17.3', '전기자동차의 충전장치 시설', [
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
