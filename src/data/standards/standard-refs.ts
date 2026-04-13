// =============================================================================
// 전기 관련 표준/기준 참조 데이터베이스
// licenseType 설명:
//   'open'         — 전문 열람 가능 (공개 표준)
//   'summary_only' — 요약만 가능 (저작권 보호)
//   'link_only'    — 링크만 제공 (유료 표준)
// =============================================================================

export interface StandardRef {
  /** 고유 ID */
  id: string;
  /** 표준명 (코드) */
  standard: string;
  /** 세부 조항 */
  clause?: string;
  /** 한국어 제목 */
  title_ko: string;
  /** 영어 제목 */
  title_en: string;
  /** 판/년도 */
  edition?: string;
  /** 참조 URL */
  url?: string;
  /** 라이선스 유형 — 표시 방식 결정 */
  licenseType: 'open' | 'summary_only' | 'link_only';
  /** 적용 국가 */
  country: string;
  /** 표준 발행 기관 */
  body: string;
}

// =============================================================================
// PART 1: KEC (한국전기설비규정)
// =============================================================================

const KEC_REFS: StandardRef[] = [
  {
    id: 'kec-130',
    standard: 'KEC',
    clause: '130',
    title_ko: '전선',
    title_en: 'Wiring',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-140',
    standard: 'KEC',
    clause: '140',
    title_ko: '전로의 절연과 접지',
    title_en: 'Insulation and Grounding of Electrical Circuits',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-210',
    standard: 'KEC',
    clause: '210',
    title_ko: '저압 전기설비 — 일반사항',
    title_en: 'Low-voltage Installations — General',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-212',
    standard: 'KEC',
    clause: '212',
    title_ko: '저압 전기설비 — 배선설비',
    title_en: 'Low-voltage Installations — Wiring Systems',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-232',
    standard: 'KEC',
    clause: '232',
    title_ko: '저압 전기설비 — 전동기 등의 시설',
    title_en: 'Low-voltage Installations — Motor Installations',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-241',
    standard: 'KEC',
    clause: '241',
    title_ko: '저압 전기설비 — 과전류 보호',
    title_en: 'Low-voltage Installations — Overcurrent Protection',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-310',
    standard: 'KEC',
    clause: '310',
    title_ko: '고압/특고압 전기설비 — 일반사항',
    title_en: 'HV/EHV Installations — General',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-341',
    standard: 'KEC',
    clause: '341',
    title_ko: '고압/특고압 전기설비 — 개폐기 및 차단기',
    title_en: 'HV/EHV Installations — Switches and Breakers',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-351',
    standard: 'KEC',
    clause: '351',
    title_ko: '고압/특고압 전기설비 — 보호장치',
    title_en: 'HV/EHV Installations — Protective Devices',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-410',
    standard: 'KEC',
    clause: '410',
    title_ko: '전기 수용가설비 — 옥내배선',
    title_en: 'Customer Installations — Indoor Wiring',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-502',
    standard: 'KEC',
    clause: '502',
    title_ko: '분산형전원 설비',
    title_en: 'Distributed Energy Resource Installations',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
  {
    id: 'kec-510',
    standard: 'KEC',
    clause: '510',
    title_ko: '전기저장장치',
    title_en: 'Energy Storage Systems',
    edition: '2021',
    licenseType: 'open',
    country: 'KR',
    body: 'MOTIE',
  },
];

// =============================================================================
// PART 2: NEC (미국전기규정)
// =============================================================================

const NEC_REFS: StandardRef[] = [
  {
    id: 'nec-210',
    standard: 'NEC',
    clause: 'Article 210',
    title_ko: '분기회로',
    title_en: 'Branch Circuits',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-220',
    standard: 'NEC',
    clause: 'Article 220',
    title_ko: '분기회로, 급전선 및 서비스 부하 계산',
    title_en: 'Branch-Circuit, Feeder, and Service Load Calculations',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-230',
    standard: 'NEC',
    clause: 'Article 230',
    title_ko: '서비스',
    title_en: 'Services',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-240',
    standard: 'NEC',
    clause: 'Article 240',
    title_ko: '과전류 보호',
    title_en: 'Overcurrent Protection',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-250',
    standard: 'NEC',
    clause: 'Article 250',
    title_ko: '접지 및 본딩',
    title_en: 'Grounding and Bonding',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-310',
    standard: 'NEC',
    clause: 'Article 310',
    title_ko: '일반목적 전선 및 케이블',
    title_en: 'Conductors for General Wiring',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-430',
    standard: 'NEC',
    clause: 'Article 430',
    title_ko: '전동기, 전동기 회로 및 제어기',
    title_en: 'Motors, Motor Circuits, and Controllers',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-480',
    standard: 'NEC',
    clause: 'Article 480',
    title_ko: '축전지',
    title_en: 'Storage Batteries',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-690',
    standard: 'NEC',
    clause: 'Article 690',
    title_ko: '태양광발전 시스템',
    title_en: 'Solar Photovoltaic Systems',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-706',
    standard: 'NEC',
    clause: 'Article 706',
    title_ko: '에너지저장시스템',
    title_en: 'Energy Storage Systems',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'nec-712',
    standard: 'NEC',
    clause: 'Article 712',
    title_ko: '직류 마이크로그리드',
    title_en: 'DC Microgrids',
    edition: '2023',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
];

// =============================================================================
// PART 3: IEC Standards (국제전기기술위원회)
// =============================================================================

const IEC_REFS: StandardRef[] = [
  {
    id: 'iec-60050',
    standard: 'IEC 60050',
    clause: '全巻',
    title_ko: '국제전기기술용어집',
    title_en: 'International Electrotechnical Vocabulary',
    url: 'https://www.electropedia.org/',
    edition: '2024',
    licenseType: 'open',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-60076',
    standard: 'IEC 60076',
    clause: '60076-1~60076-22',
    title_ko: '전력 변압기',
    title_en: 'Power Transformers',
    url: 'https://webstore.iec.ch/en/publication/283',
    edition: '2024',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-60364',
    standard: 'IEC 60364',
    clause: '60364-1~60364-7',
    title_ko: '건축물 전기설비',
    title_en: 'Low-voltage Electrical Installations',
    url: 'https://webstore.iec.ch/en/publication/1879',
    edition: '2005+AMD2:2024',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-60529',
    standard: 'IEC 60529',
    clause: '60529',
    title_ko: 'IP 보호등급',
    title_en: 'Degrees of Protection Provided by Enclosures (IP Code)',
    url: 'https://webstore.iec.ch/en/publication/2452',
    edition: '1989+AMD2:2013',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-60909',
    standard: 'IEC 60909',
    clause: '60909-0~60909-4',
    title_ko: '교류 전력계통의 단락전류 계산',
    title_en: 'Short-circuit Currents in Three-phase AC Systems',
    url: 'https://webstore.iec.ch/en/publication/3886',
    edition: '2016',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-61439',
    standard: 'IEC 61439',
    clause: '61439-1~61439-7',
    title_ko: '저압 개폐장치 및 제어장치',
    title_en: 'Low-voltage Switchgear and Controlgear Assemblies',
    url: 'https://webstore.iec.ch/en/publication/5458',
    edition: '2020',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-61850',
    standard: 'IEC 61850',
    clause: '61850-1~61850-90',
    title_ko: '변전소 자동화 통신 네트워크',
    title_en: 'Communication Networks and Systems for Power Utility Automation',
    url: 'https://webstore.iec.ch/en/publication/6028',
    edition: '2024',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-62271',
    standard: 'IEC 62271',
    clause: '62271-1~62271-212',
    title_ko: '고전압 개폐장치 및 제어장치',
    title_en: 'High-voltage Switchgear and Controlgear',
    url: 'https://webstore.iec.ch/en/publication/6703',
    edition: '2017',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-62619',
    standard: 'IEC 62619',
    clause: '62619',
    title_ko: '산업용 이차전지 안전요건',
    title_en: 'Secondary Lithium Cells and Batteries for Industrial Applications — Safety',
    url: 'https://webstore.iec.ch/en/publication/7230',
    edition: '2022',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-62933',
    standard: 'IEC 62933',
    clause: '62933-1~62933-5',
    title_ko: '전기에너지저장시스템',
    title_en: 'Electrical Energy Storage Systems',
    url: 'https://webstore.iec.ch/en/publication/7477',
    edition: '2024',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-60079',
    standard: 'IEC 60079',
    clause: '60079-0~60079-35',
    title_ko: '폭발성 분위기 — 전기기기',
    title_en: 'Explosive Atmospheres — Electrical Equipment',
    url: 'https://webstore.iec.ch/en/publication/619',
    edition: '2017',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-61000',
    standard: 'IEC 61000',
    clause: '61000-1~61000-6',
    title_ko: '전자파 적합성',
    title_en: 'Electromagnetic Compatibility (EMC)',
    url: 'https://webstore.iec.ch/en/publication/4148',
    edition: '2024',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
  {
    id: 'iec-60947',
    standard: 'IEC 60947',
    clause: '60947-1~60947-9',
    title_ko: '저압 개폐기 및 제어기',
    title_en: 'Low-voltage Switchgear and Controlgear',
    url: 'https://webstore.iec.ch/en/publication/3978',
    edition: '2020',
    licenseType: 'link_only',
    country: 'INT',
    body: 'IEC',
  },
];

// =============================================================================
// PART 4: IEEE Standards
// =============================================================================

const IEEE_REFS: StandardRef[] = [
  {
    id: 'ieee-141',
    standard: 'IEEE 141',
    title_ko: '산업 및 상업용 전력 시스템의 배전 설계 (Red Book)',
    title_en: 'Electric Power Distribution for Industrial Plants (Red Book)',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
  {
    id: 'ieee-242',
    standard: 'IEEE 242',
    title_ko: '산업 및 상업용 전력 시스템의 보호 및 협조 (Buff Book)',
    title_en: 'Protection and Coordination of Industrial and Commercial Power Systems',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
  {
    id: 'ieee-399',
    standard: 'IEEE 399',
    title_ko: '산업용 및 상업용 전력 시스템 해석 (Brown Book)',
    title_en: 'Industrial and Commercial Power Systems Analysis',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
  {
    id: 'ieee-519',
    standard: 'IEEE 519',
    title_ko: '전력계통의 고조파 제어',
    title_en: 'Harmonic Control in Electric Power Systems',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
  {
    id: 'ieee-1584',
    standard: 'IEEE 1584',
    title_ko: '아크플래시 위험 계산 가이드',
    title_en: 'Guide for Performing Arc-Flash Hazard Calculations',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
  {
    id: 'ieee-80',
    standard: 'IEEE 80',
    title_ko: 'AC 변전소 접지 안전 가이드',
    title_en: 'Guide for Safety in AC Substation Grounding',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
  {
    id: 'ieee-1547',
    standard: 'IEEE 1547',
    title_ko: '분산전원의 전력계통 연계',
    title_en: 'Interconnection of Distributed Resources with Electric Power Systems',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
  {
    id: 'ieee-2030',
    standard: 'IEEE 2030',
    title_ko: '스마트그리드 상호운용성 가이드',
    title_en: 'Guide for Smart Grid Interoperability',
    licenseType: 'link_only',
    country: 'US',
    body: 'IEEE',
  },
];

// =============================================================================
// PART 5: KS (한국산업표준) & 기타
// =============================================================================

const KS_AND_OTHER_REFS: StandardRef[] = [
  {
    id: 'ks-c-iec-60364',
    standard: 'KS C IEC 60364',
    title_ko: '건축전기설비',
    title_en: 'Electrical Installations of Buildings',
    licenseType: 'summary_only',
    country: 'KR',
    body: 'KATS',
  },
  {
    id: 'ks-c-iec-61439',
    standard: 'KS C IEC 61439',
    title_ko: '저압 개폐장치 및 제어장치',
    title_en: 'Low-voltage Switchgear and Controlgear Assemblies',
    licenseType: 'summary_only',
    country: 'KR',
    body: 'KATS',
  },
  {
    id: 'ks-c-8321',
    standard: 'KS C 8321',
    title_ko: '저압차단기',
    title_en: 'Low-voltage Circuit Breakers',
    licenseType: 'summary_only',
    country: 'KR',
    body: 'KATS',
  },
  {
    id: 'nfpa-70e',
    standard: 'NFPA 70E',
    title_ko: '작업장 전기안전 기준',
    title_en: 'Standard for Electrical Safety in the Workplace',
    licenseType: 'summary_only',
    country: 'US',
    body: 'NFPA',
  },
  {
    id: 'ul-1741',
    standard: 'UL 1741',
    title_ko: '분산전원용 인버터, 컨버터, 제어기',
    title_en: 'Inverters, Converters, Controllers for Distributed Energy Resources',
    licenseType: 'link_only',
    country: 'US',
    body: 'UL',
  },
  {
    id: 'ul-9540',
    standard: 'UL 9540',
    title_ko: '에너지저장시스템 및 장비',
    title_en: 'Energy Storage Systems and Equipment',
    licenseType: 'link_only',
    country: 'US',
    body: 'UL',
  },
  {
    id: 'gb-50054',
    standard: 'GB 50054',
    title_ko: '저압 배전 설계 규범',
    title_en: 'Code for Design of Low Voltage Electrical Installations',
    licenseType: 'summary_only',
    country: 'CN',
    body: 'SAC',
  },
];

// =============================================================================
// PART 5b: JIS (日本産業規格 — 전기설비기술기준)
// =============================================================================

const JIS_REFS: StandardRef[] = [
  {
    id: 'jis-c0364-1', standard: 'JIS', clause: 'C 0364-1', title_ko: '저압 전기설비 — 총칙',
    title_en: 'Low-voltage electrical installations — General', edition: '2010',
    licenseType: 'link_only', country: 'JP', body: 'JSA',
    url: 'https://www.jisc.go.jp/',
  },
  {
    id: 'jis-c0364-4-41', standard: 'JIS', clause: 'C 0364-4-41', title_ko: '감전 보호',
    title_en: 'Protection against electric shock', edition: '2010',
    licenseType: 'summary_only', country: 'JP', body: 'JSA',
  },
  {
    id: 'jis-c0364-4-43', standard: 'JIS', clause: 'C 0364-4-43', title_ko: '과전류 보호',
    title_en: 'Protection against overcurrent', edition: '2010',
    licenseType: 'summary_only', country: 'JP', body: 'JSA',
  },
  {
    id: 'jis-c0364-5-52', standard: 'JIS', clause: 'C 0364-5-52', title_ko: '배선 설비 — 전선 및 케이블',
    title_en: 'Wiring systems — Selection and erection of cables', edition: '2010',
    licenseType: 'summary_only', country: 'JP', body: 'JSA',
  },
  {
    id: 'jis-c0364-5-54', standard: 'JIS', clause: 'C 0364-5-54', title_ko: '접지 및 보호도체',
    title_en: 'Earthing arrangements and protective conductors', edition: '2010',
    licenseType: 'summary_only', country: 'JP', body: 'JSA',
  },
  {
    id: 'jis-c0364-6', standard: 'JIS', clause: 'C 0364-6', title_ko: '검증 및 시험',
    title_en: 'Verification and testing', edition: '2010',
    licenseType: 'summary_only', country: 'JP', body: 'JSA',
  },
  {
    id: 'jis-c0364-7-701', standard: 'JIS', clause: 'C 0364-7-701', title_ko: '욕실 및 샤워실',
    title_en: 'Locations containing a bath or shower', edition: '2010',
    licenseType: 'summary_only', country: 'JP', body: 'JSA',
  },
  {
    id: 'jis-c60364-grounding-a', standard: 'JIS', clause: 'A종 접지', title_ko: 'A종 접지 (고압 기기 외함)',
    title_en: 'Class A Grounding — HV equipment enclosure (≤10Ω)', edition: '전기설비기술기준',
    licenseType: 'open', country: 'JP', body: '経済産業省',
  },
  {
    id: 'jis-c60364-grounding-b', standard: 'JIS', clause: 'B종 접지', title_ko: 'B종 접지 (변압기 혼촉 방지)',
    title_en: 'Class B Grounding — Transformer neutral (150/Ig Ω)', edition: '전기설비기술기준',
    licenseType: 'open', country: 'JP', body: '経済産業省',
  },
  {
    id: 'jis-c60364-grounding-c', standard: 'JIS', clause: 'C종 접지', title_ko: 'C종 접지 (300V 초과 저압 기기)',
    title_en: 'Class C Grounding — LV equipment >300V (≤10Ω)', edition: '전기설비기술기준',
    licenseType: 'open', country: 'JP', body: '経済産業省',
  },
  {
    id: 'jis-c60364-grounding-d', standard: 'JIS', clause: 'D종 접지', title_ko: 'D종 접지 (300V 이하 저압 기기)',
    title_en: 'Class D Grounding — LV equipment ≤300V (≤100Ω)', edition: '전기설비기술기준',
    licenseType: 'open', country: 'JP', body: '経済産業省',
  },
  {
    id: 'jis-c0364-vd', standard: 'JIS', clause: '전압강하', title_ko: '전압강하 기준 (내선규정 3202-1)',
    title_en: 'Voltage drop limits per Naisen Kitei 3202-1', edition: '내선규정',
    licenseType: 'open', country: 'JP', body: '日本電気協会',
  },
  {
    id: 'jis-c0364-conduit', standard: 'JIS', clause: '전선관', title_ko: '전선관 충전율 32%',
    title_en: 'Conduit fill rate 32% for 3+ wires', edition: '내선규정',
    licenseType: 'open', country: 'JP', body: '日本電気協会',
  },
  {
    id: 'jis-ev-chademo', standard: 'JIS', clause: 'CHAdeMO', title_ko: 'EV 급속충전 CHAdeMO 규격',
    title_en: 'CHAdeMO DC fast charging standard', edition: '2.0',
    licenseType: 'link_only', country: 'JP', body: 'CHAdeMO Association',
    url: 'https://www.chademo.com/',
  },
  {
    id: 'jis-c8105', standard: 'JIS', clause: 'C 8105', title_ko: '조명기구 — 안전 요구사항',
    title_en: 'Luminaires — Safety requirements', edition: '2017',
    licenseType: 'link_only', country: 'JP', body: 'JSA',
  },
];

// =============================================================================
// PART 6: Export
// =============================================================================

export const STANDARD_REFS: StandardRef[] = [
  ...KEC_REFS,
  ...NEC_REFS,
  ...IEC_REFS,
  ...IEEE_REFS,
  ...KS_AND_OTHER_REFS,
  ...JIS_REFS,
];

/** 표준별 조항 검색 */
export function getRefsByStandard(standard: string): StandardRef[] {
  const s = standard.toUpperCase();
  return STANDARD_REFS.filter((r) => r.standard.toUpperCase().includes(s));
}

/** 국가별 표준 검색 */
export function getRefsByCountry(country: string): StandardRef[] {
  return STANDARD_REFS.filter((r) => r.country === country.toUpperCase());
}

/** ID로 표준 참조 조회 */
export function getRefById(id: string): StandardRef | undefined {
  return STANDARD_REFS.find((r) => r.id === id);
}

/** 라이선스 유형별 필터 (UI에서 표시방법 결정) */
export function getOpenRefs(): StandardRef[] {
  return STANDARD_REFS.filter((r) => r.licenseType === 'open');
}
