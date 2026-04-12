/**
 * Standard Conversion Engine
 *
 * Cross-reference converter between KEC, NEC, IEC, and JIS standards.
 * Maps equivalent clauses across different national/international electrical codes.
 *
 * PART 1: Types
 * PART 2: Mapping table (30+ entries)
 * PART 3: Conversion engine
 * PART 4: Public API
 */

// ---------------------------------------------------------------------------
// PART 1 -- Types
// ---------------------------------------------------------------------------

export type StandardCode = 'KEC' | 'NEC' | 'IEC' | 'JIS';

export interface ConversionResult {
  /** Target clause identifier */
  toClause: string;
  /** Confidence level: 0.0 to 1.0 */
  confidence: number;
  /** Explanatory notes about the conversion */
  notes: string[];
  /** Key differences between source and target clauses */
  differences: string[];
  /** Source standard info */
  fromStandard: StandardCode;
  fromClause: string;
  /** Target standard info */
  toStandard: StandardCode;
}

export interface ConvertOptions {
  fromStandard: StandardCode;
  fromClause: string;
  toStandard: StandardCode;
}

export interface EquivalentEntry {
  standard: StandardCode;
  clause: string;
  confidence: number;
}

interface MappingEntry {
  topic: string;
  topic_ko: string;
  kec?: string;
  nec?: string;
  iec?: string;
  jis?: string;
  /** Cross-standard confidence pairs: [fromStd-toStd, confidence] */
  confidences: Record<string, number>;
  notes: string[];
  differences: string[];
}

// ---------------------------------------------------------------------------
// PART 2 -- Mapping table (30+ entries)
// ---------------------------------------------------------------------------

const MAPPINGS: MappingEntry[] = [
  {
    topic: 'Grounding - General',
    topic_ko: '접지 - 일반',
    kec: '140',
    nec: '250',
    iec: '60364-5-54',
    jis: 'C 60364-5-54',
    confidences: {
      'KEC-NEC': 0.85, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.80, 'NEC-JIS': 0.75, 'IEC-JIS': 0.92,
    },
    notes: ['KEC 접지 체계는 IEC 기반으로 설계됨', 'NEC Article 250은 접지와 본딩을 함께 다룸'],
    differences: ['KEC는 TT/TN/IT 체계를 명시적으로 구분', 'NEC는 equipment grounding conductor 개념이 별도로 존재'],
  },
  {
    topic: 'Grounding Resistance',
    topic_ko: '접지저항',
    kec: '140.5',
    nec: '250.53',
    iec: '60364-5-54.8',
    jis: 'C 60364-5-54.8',
    confidences: {
      'KEC-NEC': 0.80, 'KEC-IEC': 0.92, 'KEC-JIS': 0.90,
      'NEC-IEC': 0.78, 'NEC-JIS': 0.75, 'IEC-JIS': 0.95,
    },
    notes: ['접지저항 기준값이 규격마다 다름'],
    differences: ['KEC: 종류별 10Ω/100Ω 등', 'NEC: 25Ω 이하 또는 보충접지극 사용'],
  },
  {
    topic: 'Overcurrent Protection',
    topic_ko: '과전류 보호',
    kec: '232.1',
    nec: '240',
    iec: '60364-4-43',
    jis: 'C 60364-4-43',
    confidences: {
      'KEC-NEC': 0.85, 'KEC-IEC': 0.92, 'KEC-JIS': 0.90,
      'NEC-IEC': 0.82, 'NEC-JIS': 0.78, 'IEC-JIS': 0.93,
    },
    notes: ['과전류 보호 원칙은 국제적으로 유사', 'KEC와 IEC는 거의 동일한 접근법'],
    differences: ['NEC는 차단기/퓨즈 정격 기준이 미국 표준 사이즈에 맞춤', 'IEC/KEC는 %Iz 기반 협조 사용'],
  },
  {
    topic: 'Short Circuit Protection',
    topic_ko: '단락보호',
    kec: '232.5',
    nec: '240.1',
    iec: '60364-4-43.4',
    jis: 'C 60364-4-43.4',
    confidences: {
      'KEC-NEC': 0.82, 'KEC-IEC': 0.93, 'KEC-JIS': 0.90,
      'NEC-IEC': 0.80, 'NEC-JIS': 0.78, 'IEC-JIS': 0.94,
    },
    notes: ['차단 시간과 let-through 에너지 기준이 핵심'],
    differences: ['KEC/IEC: I²t 법칙 명시적 적용', 'NEC: AIC(Ampere Interrupting Capacity) 중심 접근'],
  },
  {
    topic: 'Voltage Drop',
    topic_ko: '전압강하',
    kec: '232.51',
    nec: '210.19(A) FPN',
    iec: '60364-5-52.525',
    jis: 'C 60364-5-52',
    confidences: {
      'KEC-NEC': 0.80, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.75, 'NEC-JIS': 0.72, 'IEC-JIS': 0.90,
    },
    notes: ['NEC 전압강하 기준은 권고(FPN)이며 강제 아님', 'KEC/IEC는 기준값을 명시'],
    differences: ['KEC: 간선 3%, 분기 2% (총 5%)', 'NEC: 권고 3%+2%=5%', 'IEC: 4% 기준'],
  },
  {
    topic: 'Cable Ampacity',
    topic_ko: '전선 허용전류',
    kec: '232.41',
    nec: '310.16',
    iec: '60364-5-52.523',
    jis: 'C 3005',
    confidences: {
      'KEC-NEC': 0.78, 'KEC-IEC': 0.90, 'KEC-JIS': 0.85,
      'NEC-IEC': 0.75, 'NEC-JIS': 0.70, 'IEC-JIS': 0.88,
    },
    notes: ['허용전류 표는 규격마다 기준 온도가 다름', 'NEC 310.16: 30°C 기준', 'IEC/KEC: 30°C 또는 40°C'],
    differences: ['도체 규격: KEC/IEC mm², NEC AWG/kcmil', '보정계수 적용 방식이 상이'],
  },
  {
    topic: 'RCD / GFCI',
    topic_ko: '누전차단기',
    kec: '232.75',
    nec: '210.8',
    iec: '60364-4-41.411',
    jis: 'C 60364-4-41',
    confidences: {
      'KEC-NEC': 0.82, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.78, 'NEC-JIS': 0.75, 'IEC-JIS': 0.92,
    },
    notes: ['KEC/IEC: RCD 기반', 'NEC: GFCI(5mA) 기반', '정격 감도전류가 다름'],
    differences: ['KEC: 30mA 이하', 'NEC: GFCI 5mA (인체보호)', 'IEC: 30mA (인체), 300mA (화재)'],
  },
  {
    topic: 'Motor Circuits',
    topic_ko: '전동기 회로',
    kec: '230',
    nec: '430',
    iec: '60364-5-55.559',
    jis: 'C 60364-5-55',
    confidences: {
      'KEC-NEC': 0.80, 'KEC-IEC': 0.88, 'KEC-JIS': 0.85,
      'NEC-IEC': 0.75, 'NEC-JIS': 0.72, 'IEC-JIS': 0.90,
    },
    notes: ['전동기 보호, 과부하, 기동 관련 규정'],
    differences: ['NEC 430은 매우 상세한 별도 Article', 'KEC/IEC는 일반 설비 규정 내 포함'],
  },
  {
    topic: 'Distribution Boards',
    topic_ko: '분전반',
    kec: '220',
    nec: '408',
    iec: '61439-1',
    jis: 'C 8480',
    confidences: {
      'KEC-NEC': 0.78, 'KEC-IEC': 0.85, 'KEC-JIS': 0.82,
      'NEC-IEC': 0.72, 'NEC-JIS': 0.70, 'IEC-JIS': 0.85,
    },
    notes: ['분전반 구조/설치 기준', 'IEC 61439는 저압 개폐장치 및 제어장치 조립체 전용 규격'],
    differences: ['KEC: 건축전기설비 내 포함', 'NEC 408: Switchboards, Switchgear, Panelboards'],
  },
  {
    topic: 'Transformer Installation',
    topic_ko: '변압기 설비',
    kec: '310',
    nec: '450',
    iec: '60076',
    jis: 'C 4304',
    confidences: {
      'KEC-NEC': 0.80, 'KEC-IEC': 0.85, 'KEC-JIS': 0.82,
      'NEC-IEC': 0.75, 'NEC-JIS': 0.72, 'IEC-JIS': 0.88,
    },
    notes: ['변압기 설치, 보호, 환기 기준'],
    differences: ['NEC 450: 설치 규정 중심', 'IEC 60076: 변압기 제품 규격'],
  },
  {
    topic: 'PV Systems',
    topic_ko: '태양광 발전 설비',
    kec: '520',
    nec: '690',
    iec: '60364-7-712',
    jis: 'C 60364-7-712',
    confidences: {
      'KEC-NEC': 0.82, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.78, 'NEC-JIS': 0.75, 'IEC-JIS': 0.92,
    },
    notes: ['태양광 발전 설비 설치/보호 기준'],
    differences: ['NEC 690: rapid shutdown 요구사항 포함', 'KEC/IEC: DC 보호 중심'],
  },
  {
    topic: 'Emergency Power',
    topic_ko: '비상전원 설비',
    kec: '250',
    nec: '700',
    iec: '60364-5-56',
    jis: 'C 60364-5-56',
    confidences: {
      'KEC-NEC': 0.78, 'KEC-IEC': 0.85, 'KEC-JIS': 0.82,
      'NEC-IEC': 0.75, 'NEC-JIS': 0.72, 'IEC-JIS': 0.90,
    },
    notes: ['비상전원, 예비전원 설비 기준'],
    differences: ['NEC: Emergency(700)/Legally Required Standby(701)/Optional Standby(702) 구분'],
  },
  {
    topic: 'Surge Protection (SPD)',
    topic_ko: '서지보호장치',
    kec: '150',
    nec: '242',
    iec: '60364-5-53.534',
    jis: 'C 60364-5-53',
    confidences: {
      'KEC-NEC': 0.82, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.80, 'NEC-JIS': 0.78, 'IEC-JIS': 0.92,
    },
    notes: ['SPD 설치 위치, 등급, 보호 레벨'],
    differences: ['SPD Type 분류가 규격마다 약간 상이'],
  },
  {
    topic: 'Metering',
    topic_ko: '계량 설비',
    kec: '210',
    nec: '230.82',
    iec: '62053',
    jis: 'C 1216',
    confidences: {
      'KEC-NEC': 0.70, 'KEC-IEC': 0.80, 'KEC-JIS': 0.75,
      'NEC-IEC': 0.65, 'NEC-JIS': 0.60, 'IEC-JIS': 0.78,
    },
    notes: ['계량기 설치/정확도 기준', '규격간 직접 대응이 약한 분야'],
    differences: ['KEC: 독립 조항', 'NEC: 인입설비(230) 내 일부 규정'],
  },
  {
    topic: 'Branch Circuits',
    topic_ko: '분기회로',
    kec: '232.10',
    nec: '210',
    iec: '60364-5-52',
    jis: 'C 60364-5-52',
    confidences: {
      'KEC-NEC': 0.85, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.80, 'NEC-JIS': 0.78, 'IEC-JIS': 0.92,
    },
    notes: ['분기회로 설계, 부하 산정 기준'],
    differences: ['NEC: 분기회로 종류(15A/20A/30A 등) 명시', 'KEC/IEC: 전류에 의한 일반 분류'],
  },
  {
    topic: 'Wiring Methods',
    topic_ko: '배선 방식',
    kec: '232.30',
    nec: '300',
    iec: '60364-5-52.521',
    jis: 'C 60364-5-52',
    confidences: {
      'KEC-NEC': 0.78, 'KEC-IEC': 0.88, 'KEC-JIS': 0.85,
      'NEC-IEC': 0.72, 'NEC-JIS': 0.70, 'IEC-JIS': 0.90,
    },
    notes: ['전선관, 케이블트레이, 배선 방법 규정'],
    differences: ['NEC: Chapter 3 전체가 배선 방법', 'KEC/IEC: 설치 방법 코드(A1/A2/B1/B2/C/D/E/F)'],
  },
  {
    topic: 'Conduit Fill',
    topic_ko: '전선관 충전율',
    kec: '232.33',
    nec: '344.22',
    iec: '60364-5-52.522',
    jis: 'C 60364-5-52',
    confidences: {
      'KEC-NEC': 0.85, 'KEC-IEC': 0.88, 'KEC-JIS': 0.85,
      'NEC-IEC': 0.80, 'NEC-JIS': 0.78, 'IEC-JIS': 0.90,
    },
    notes: ['전선관 내 충전율 제한'],
    differences: ['NEC: 1선 53%, 2선 31%, 3선+ 40%', 'KEC: 유사하지만 전선관 종류별 차이'],
  },
  {
    topic: 'Arc Flash',
    topic_ko: '아크 플래시',
    kec: '(미규정)',
    nec: '110.16',
    iec: '(IEC 62271-200 참고)',
    jis: '(미규정)',
    confidences: {
      'KEC-NEC': 0.30, 'KEC-IEC': 0.40, 'KEC-JIS': 0.50,
      'NEC-IEC': 0.50, 'NEC-JIS': 0.30, 'IEC-JIS': 0.40,
    },
    notes: ['아크 플래시 기준은 NEC/NFPA 70E 중심', 'KEC/JIS에는 직접 대응 조항 없음'],
    differences: ['NEC: 아크 플래시 경고 라벨 요구', 'IEEE 1584 기반 계산 표준'],
  },
  {
    topic: 'Selectivity / Protection Coordination',
    topic_ko: '보호 협조',
    kec: '232.8',
    nec: '240.12',
    iec: '60364-4-43.435',
    jis: 'C 60364-4-43',
    confidences: {
      'KEC-NEC': 0.82, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.78, 'NEC-JIS': 0.75, 'IEC-JIS': 0.92,
    },
    notes: ['상위/하위 보호장치 간 협조 기준'],
    differences: ['NEC: selective coordination은 특정 시설(병원 등)에서 의무'],
  },
  {
    topic: 'Power Factor Correction',
    topic_ko: '역률 개선',
    kec: '232.52',
    nec: '460',
    iec: '60364-5-56.560',
    jis: 'C 4801',
    confidences: {
      'KEC-NEC': 0.75, 'KEC-IEC': 0.85, 'KEC-JIS': 0.80,
      'NEC-IEC': 0.72, 'NEC-JIS': 0.68, 'IEC-JIS': 0.85,
    },
    notes: ['역률 보상용 콘덴서 설치 기준'],
    differences: ['KEC: 역률 0.9 이상 권장', 'NEC 460: 콘덴서 설비 규정'],
  },
  {
    topic: 'Hazardous Locations',
    topic_ko: '폭발 위험 장소',
    kec: '240',
    nec: '500',
    iec: '60079',
    jis: 'C 60079',
    confidences: {
      'KEC-NEC': 0.70, 'KEC-IEC': 0.88, 'KEC-JIS': 0.85,
      'NEC-IEC': 0.65, 'NEC-JIS': 0.60, 'IEC-JIS': 0.92,
    },
    notes: ['NEC: Division 시스템', 'IEC/KEC/JIS: Zone 시스템'],
    differences: ['NEC Division 1/2 ↔ IEC Zone 0/1/2 대응 관계 존재하지만 완전 일치 아님'],
  },
  {
    topic: 'Swimming Pools',
    topic_ko: '수영장 설비',
    kec: '260.3',
    nec: '680',
    iec: '60364-7-702',
    jis: 'C 60364-7-702',
    confidences: {
      'KEC-NEC': 0.80, 'KEC-IEC': 0.90, 'KEC-JIS': 0.88,
      'NEC-IEC': 0.75, 'NEC-JIS': 0.72, 'IEC-JIS': 0.92,
    },
    notes: ['수영장/분수 주변 전기 설비 안전 기준'],
    differences: ['NEC 680: 수중 조명, GFCI 요구사항 상세', 'IEC: Zone 0/1/2 거리 기준'],
  },
  {
    topic: 'Fire Alarm Systems',
    topic_ko: '화재경보 설비',
    kec: '260.1',
    nec: '760',
    iec: '60364-5-56',
    jis: 'C 60364-5-56',
    confidences: {
      'KEC-NEC': 0.72, 'KEC-IEC': 0.80, 'KEC-JIS': 0.78,
      'NEC-IEC': 0.68, 'NEC-JIS': 0.65, 'IEC-JIS': 0.85,
    },
    notes: ['화재경보 회로 배선 기준'],
    differences: ['NEC: Power-limited vs Non-power-limited 구분', 'KEC: 소방법과 연계'],
  },
  {
    topic: 'Data/Communication Cabling',
    topic_ko: '정보통신 배선',
    kec: '260.5',
    nec: '800',
    iec: '11801',
    jis: 'X 5150',
    confidences: {
      'KEC-NEC': 0.70, 'KEC-IEC': 0.75, 'KEC-JIS': 0.72,
      'NEC-IEC': 0.65, 'NEC-JIS': 0.62, 'IEC-JIS': 0.80,
    },
    notes: ['통신 케이블 설치 및 보호 기준'],
    differences: ['IEC 11801: 구조화 배선 규격', 'NEC 800: 통신 회로 설치 규정'],
  },
  {
    topic: 'Lighting Design',
    topic_ko: '조명 설계',
    kec: '(건축법 참조)',
    nec: '(IESNA 참조)',
    iec: '12464-1',
    jis: 'Z 9110',
    confidences: {
      'KEC-NEC': 0.60, 'KEC-IEC': 0.70, 'KEC-JIS': 0.68,
      'NEC-IEC': 0.55, 'NEC-JIS': 0.55, 'IEC-JIS': 0.82,
    },
    notes: ['조도 기준은 전기규정보다 건축/조명 규격에 해당'],
    differences: ['IEC 12464: 실내 작업장 조명', 'JIS Z 9110: 조도 기준'],
  },
  {
    topic: 'UPS Installation',
    topic_ko: 'UPS 설비',
    kec: '250.3',
    nec: '706',
    iec: '62040',
    jis: 'C 4411',
    confidences: {
      'KEC-NEC': 0.75, 'KEC-IEC': 0.82, 'KEC-JIS': 0.78,
      'NEC-IEC': 0.72, 'NEC-JIS': 0.68, 'IEC-JIS': 0.85,
    },
    notes: ['UPS/ESS 설비 설치 기준'],
    differences: ['NEC 706: ESS 전용 Article (2020 신설)'],
  },
  {
    topic: 'Service Entrance',
    topic_ko: '인입구 설비',
    kec: '200',
    nec: '230',
    iec: '60364-5-51',
    jis: 'C 60364-5-51',
    confidences: {
      'KEC-NEC': 0.78, 'KEC-IEC': 0.85, 'KEC-JIS': 0.82,
      'NEC-IEC': 0.72, 'NEC-JIS': 0.70, 'IEC-JIS': 0.88,
    },
    notes: ['수전 설비, 인입 방식'],
    differences: ['NEC: overhead/underground service 구분 상세'],
  },
  {
    topic: 'Demand Factor',
    topic_ko: '수요율',
    kec: '232.11',
    nec: '220',
    iec: '60364-5-52.Annex A',
    jis: 'C 60364-5-52',
    confidences: {
      'KEC-NEC': 0.80, 'KEC-IEC': 0.85, 'KEC-JIS': 0.82,
      'NEC-IEC': 0.75, 'NEC-JIS': 0.72, 'IEC-JIS': 0.88,
    },
    notes: ['부하 산정, 수요율 적용 기준'],
    differences: ['NEC 220: 상세한 부하 계산 방법 제시', 'KEC: 한국전력 수요율표 참조'],
  },
  {
    topic: 'Wire/Cable Types',
    topic_ko: '전선/케이블 종류',
    kec: '232.40',
    nec: '310',
    iec: '60227/60245',
    jis: 'C 3005',
    confidences: {
      'KEC-NEC': 0.72, 'KEC-IEC': 0.85, 'KEC-JIS': 0.82,
      'NEC-IEC': 0.68, 'NEC-JIS': 0.65, 'IEC-JIS': 0.88,
    },
    notes: ['전선/케이블 재료, 절연 등급'],
    differences: ['도체 규격: mm² vs AWG', '절연재 명칭이 상이 (THHN, XLPE 등)'],
  },
  {
    topic: 'High Voltage Installation',
    topic_ko: '고압 설비',
    kec: '300',
    nec: '490',
    iec: '61936-1',
    jis: 'C 60364-4',
    confidences: {
      'KEC-NEC': 0.75, 'KEC-IEC': 0.85, 'KEC-JIS': 0.80,
      'NEC-IEC': 0.70, 'NEC-JIS': 0.68, 'IEC-JIS': 0.85,
    },
    notes: ['고압(600V 초과) 설비 설치 기준'],
    differences: ['고압 기준 전압이 규격마다 다름: NEC 600V, IEC 1000V AC'],
  },
];

// ---------------------------------------------------------------------------
// PART 3 -- Conversion engine
// ---------------------------------------------------------------------------

function findMapping(standard: StandardCode, clause: string): MappingEntry | undefined {
  const stdKey = standard.toLowerCase() as 'kec' | 'nec' | 'iec' | 'jis';

  return MAPPINGS.find((m) => {
    const mappedClause = m[stdKey];
    if (!mappedClause) return false;
    // 정확 일치 또는 접두사 일치
    return mappedClause === clause || clause.startsWith(mappedClause);
  });
}

function getClauseFromMapping(mapping: MappingEntry, standard: StandardCode): string | undefined {
  const key = standard.toLowerCase() as 'kec' | 'nec' | 'iec' | 'jis';
  return mapping[key];
}

function getConfidence(mapping: MappingEntry, from: StandardCode, to: StandardCode): number {
  const key = `${from}-${to}`;
  const reverseKey = `${to}-${from}`;
  return mapping.confidences[key] ?? mapping.confidences[reverseKey] ?? 0.5;
}

// ---------------------------------------------------------------------------
// PART 4 -- Public API
// ---------------------------------------------------------------------------

/**
 * Convert a clause reference from one standard to another.
 *
 * Confidence levels:
 *   0.95-1.00: Direct equivalent (same concept, same scope)
 *   0.80-0.95: Equivalent with corrections (minor differences)
 *   0.60-0.80: Similar concept (significant differences)
 *   < 0.60:    No reliable conversion
 */
export function convertStandard(opts: ConvertOptions): ConversionResult {
  const { fromStandard, fromClause, toStandard } = opts;

  if (fromStandard === toStandard) {
    return {
      toClause: fromClause,
      confidence: 1.0,
      notes: ['Same standard — no conversion needed.'],
      differences: [],
      fromStandard,
      fromClause,
      toStandard,
    };
  }

  const mapping = findMapping(fromStandard, fromClause);
  if (!mapping) {
    return {
      toClause: '',
      confidence: 0,
      notes: [`No mapping found for ${fromStandard} ${fromClause}.`],
      differences: [],
      fromStandard,
      fromClause,
      toStandard,
    };
  }

  const targetClause = getClauseFromMapping(mapping, toStandard);
  if (!targetClause) {
    return {
      toClause: '',
      confidence: 0,
      notes: [`${toStandard} does not have a mapped equivalent for "${mapping.topic}".`],
      differences: mapping.differences,
      fromStandard,
      fromClause,
      toStandard,
    };
  }

  const confidence = getConfidence(mapping, fromStandard, toStandard);

  return {
    toClause: targetClause,
    confidence,
    notes: [
      `Topic: ${mapping.topic} (${mapping.topic_ko})`,
      ...mapping.notes,
    ],
    differences: mapping.differences,
    fromStandard,
    fromClause,
    toStandard,
  };
}

/**
 * Find all equivalent clauses across standards for a given clause.
 */
export function getEquivalentStandards(
  standard: StandardCode,
  clause: string,
): EquivalentEntry[] {
  const mapping = findMapping(standard, clause);
  if (!mapping) return [];

  const allStandards: StandardCode[] = ['KEC', 'NEC', 'IEC', 'JIS'];
  const results: EquivalentEntry[] = [];

  for (const targetStd of allStandards) {
    if (targetStd === standard) continue;
    const targetClause = getClauseFromMapping(mapping, targetStd);
    if (!targetClause) continue;

    results.push({
      standard: targetStd,
      clause: targetClause,
      confidence: getConfidence(mapping, standard, targetStd),
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * List all available mapping topics.
 */
export function listMappingTopics(): Array<{ topic: string; topic_ko: string; standards: StandardCode[] }> {
  return MAPPINGS.map((m) => {
    const standards: StandardCode[] = [];
    if (m.kec) standards.push('KEC');
    if (m.nec) standards.push('NEC');
    if (m.iec) standards.push('IEC');
    if (m.jis) standards.push('JIS');
    return { topic: m.topic, topic_ko: m.topic_ko, standards };
  });
}

/**
 * Search mappings by keyword.
 */
export function searchMappings(query: string): MappingEntry[] {
  const lower = query.toLowerCase();
  return MAPPINGS.filter(
    (m) =>
      m.topic.toLowerCase().includes(lower) ||
      m.topic_ko.includes(query) ||
      m.notes.some((n) => n.toLowerCase().includes(lower)),
  );
}
