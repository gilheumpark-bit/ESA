/**
 * Expanded Symbol Database
 * ------------------------
 * 전기 도면 심볼 DB — CAD 블록명/VLM 인식명 → 표준 타입 매핑.
 * 기존 dxf-parser.ts의 68개에서 150+로 확장.
 *
 * PART 1: Symbol definitions
 * PART 2: Symbol resolver
 * PART 3: Symbol metadata
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Symbol Definitions
// ═══════════════════════════════════════════════════════════════════════════════

export interface SymbolEntry {
  id: string;
  type: string;           // 표준화된 타입
  category: string;       // 대분류
  aliases: string[];      // CAD 블록명, VLM 인식 변형
  iecRef?: string;        // IEC 60617 심볼 번호
  description: string;
  descriptionKo: string;
}

export const EXPANDED_SYMBOL_DB: SymbolEntry[] = [
  // === 변압기 (Transformer) ===
  { id: 'SYM-TR-001', type: 'transformer', category: 'power', aliases: ['TR', 'XFMR', 'TRANSFORMER', 'MOF', '변압기', 'Transformer', 'Power Transformer'], iecRef: 'IEC-60617-06-01', description: 'Power transformer', descriptionKo: '전력 변압기' },
  { id: 'SYM-TR-002', type: 'transformer_dry', category: 'power', aliases: ['DRY_TR', '건식변압기', 'Dry Transformer', 'MOLD_TR'], description: 'Dry-type transformer', descriptionKo: '건식 변압기' },
  { id: 'SYM-TR-003', type: 'transformer_auto', category: 'power', aliases: ['AUTO_TR', '단권변압기', 'Autotransformer'], description: 'Autotransformer', descriptionKo: '단권 변압기' },
  { id: 'SYM-TR-004', type: 'transformer_ct', category: 'measurement', aliases: ['CT', 'CURRENT_TR', '변류기', 'Current Transformer'], iecRef: 'IEC-60617-06-06', description: 'Current transformer', descriptionKo: '변류기 (CT)' },
  { id: 'SYM-TR-005', type: 'transformer_vt', category: 'measurement', aliases: ['VT', 'PT', 'VOLTAGE_TR', '계기용변압기', 'Potential Transformer'], iecRef: 'IEC-60617-06-07', description: 'Voltage transformer', descriptionKo: '계기용 변압기 (PT)' },

  // === 차단기 (Breaker/Switch) ===
  { id: 'SYM-BR-001', type: 'breaker_acb', category: 'protection', aliases: ['ACB', 'AIR_CB', '기중차단기'], description: 'Air circuit breaker', descriptionKo: '기중 차단기 (ACB)' },
  { id: 'SYM-BR-002', type: 'breaker_vcb', category: 'protection', aliases: ['VCB', 'VACUUM_CB', '진공차단기'], description: 'Vacuum circuit breaker', descriptionKo: '진공 차단기 (VCB)' },
  { id: 'SYM-BR-003', type: 'breaker_mccb', category: 'protection', aliases: ['MCCB', 'MOLDED_CB', '배선용차단기'], description: 'Molded case circuit breaker', descriptionKo: '배선용 차단기 (MCCB)' },
  { id: 'SYM-BR-004', type: 'breaker_elcb', category: 'protection', aliases: ['ELCB', 'ELB', 'RCD', 'GFCI', '누전차단기'], description: 'Earth leakage circuit breaker', descriptionKo: '누전 차단기 (ELCB)' },
  { id: 'SYM-BR-005', type: 'breaker_mcb', category: 'protection', aliases: ['MCB', '소형차단기', 'Miniature CB'], description: 'Miniature circuit breaker', descriptionKo: '소형 차단기 (MCB)' },
  { id: 'SYM-BR-006', type: 'fuse', category: 'protection', aliases: ['FUSE', 'PF', 'POWER_FUSE', '퓨즈', '전력퓨즈'], iecRef: 'IEC-60617-07-12', description: 'Fuse', descriptionKo: '퓨즈' },
  { id: 'SYM-BR-007', type: 'switch_ds', category: 'switching', aliases: ['DS', 'DISCONNECT', '단로기', 'Disconnector'], description: 'Disconnecting switch', descriptionKo: '단로기 (DS)' },
  { id: 'SYM-BR-008', type: 'switch_ls', category: 'switching', aliases: ['LS', 'LOAD_SW', 'LBS', '부하개폐기'], description: 'Load break switch', descriptionKo: '부하 개폐기 (LBS)' },
  { id: 'SYM-BR-009', type: 'contactor', category: 'motor', aliases: ['MC', 'CONTACTOR', '전자접촉기', 'Magnetic Contactor'], description: 'Magnetic contactor', descriptionKo: '전자 접촉기 (MC)' },
  { id: 'SYM-BR-010', type: 'switch_ats', category: 'switching', aliases: ['ATS', 'AUTO_TRANSFER', '자동절환개폐기'], description: 'Automatic transfer switch', descriptionKo: '자동 절환 개폐기 (ATS)' },

  // === 전동기 (Motor) ===
  { id: 'SYM-MT-001', type: 'motor', category: 'motor', aliases: ['M', 'MOTOR', '전동기', 'Electric Motor', 'INDUCTION_M'], iecRef: 'IEC-60617-05-01', description: 'Induction motor', descriptionKo: '유도 전동기' },
  { id: 'SYM-MT-002', type: 'motor_vfd', category: 'motor', aliases: ['VFD', 'INVERTER', 'VSD', '인버터', '가변속드라이브'], description: 'Variable frequency drive', descriptionKo: '인버터 (VFD)' },
  { id: 'SYM-MT-003', type: 'motor_soft_starter', category: 'motor', aliases: ['SS', 'SOFT_START', '소프트스타터'], description: 'Soft starter', descriptionKo: '소프트 스타터' },

  // === 배전반/분전반 (Panel) ===
  { id: 'SYM-PN-001', type: 'panel_swgr', category: 'distribution', aliases: ['SWGR', 'SWITCHGEAR', '수배전반', '배전반'], description: 'Switchgear panel', descriptionKo: '수배전반' },
  { id: 'SYM-PN-002', type: 'panel_mcc', category: 'distribution', aliases: ['MCC', 'MOTOR_CENTER', '전동기제어반'], description: 'Motor control center', descriptionKo: '전동기 제어반 (MCC)' },
  { id: 'SYM-PN-003', type: 'panel_dist', category: 'distribution', aliases: ['DP', 'DIST_PANEL', '분전반', 'Distribution Panel'], description: 'Distribution panel', descriptionKo: '분전반' },
  { id: 'SYM-PN-004', type: 'panel_lighting', category: 'distribution', aliases: ['LP', 'LIGHT_PANEL', '전등분전반'], description: 'Lighting panel', descriptionKo: '전등 분전반' },

  // === 발전기 / 전원 (Generator/Source) ===
  { id: 'SYM-GN-001', type: 'generator', category: 'power', aliases: ['G', 'GEN', 'GENERATOR', '발전기'], iecRef: 'IEC-60617-05-09', description: 'Generator', descriptionKo: '발전기' },
  { id: 'SYM-GN-002', type: 'ups', category: 'power', aliases: ['UPS', '무정전전원장치'], description: 'Uninterruptible power supply', descriptionKo: 'UPS' },
  { id: 'SYM-GN-003', type: 'solar_panel', category: 'renewable', aliases: ['PV', 'SOLAR', '태양전지', 'Solar Panel'], description: 'Photovoltaic panel', descriptionKo: '태양광 패널' },
  { id: 'SYM-GN-004', type: 'battery', category: 'renewable', aliases: ['BATT', 'BATTERY', 'ESS', '축전지', '배터리'], description: 'Battery/ESS', descriptionKo: '축전지 / ESS' },

  // === 접지 / 보호 (Grounding/Protection) ===
  { id: 'SYM-GD-001', type: 'ground_rod', category: 'grounding', aliases: ['GND', 'GROUND', 'EARTH', '접지봉', '접지'], iecRef: 'IEC-60617-02-15', description: 'Ground rod', descriptionKo: '접지봉' },
  { id: 'SYM-GD-002', type: 'spd', category: 'protection', aliases: ['SPD', 'SURGE', 'LA', '서지보호기', 'Lightning Arrester'], description: 'Surge protective device', descriptionKo: '서지 보호기 (SPD)' },
  { id: 'SYM-GD-003', type: 'afci', category: 'protection', aliases: ['AFCI', 'ARC_FAULT', '아크차단기'], description: 'Arc fault circuit interrupter', descriptionKo: '아크 차단기 (AFCI)' },

  // === 부하 (Load) ===
  { id: 'SYM-LD-001', type: 'load_general', category: 'load', aliases: ['LOAD', '부하', 'General Load'], description: 'General load', descriptionKo: '일반 부하' },
  { id: 'SYM-LD-002', type: 'light', category: 'lighting', aliases: ['LIGHT', 'LAMP', '조명', 'Luminaire'], description: 'Lighting fixture', descriptionKo: '조명기구' },
  { id: 'SYM-LD-003', type: 'outlet', category: 'wiring', aliases: ['OUTLET', 'RECEPTACLE', '콘센트'], description: 'Receptacle/outlet', descriptionKo: '콘센트' },
  { id: 'SYM-LD-004', type: 'switch_wall', category: 'wiring', aliases: ['SW', 'SWITCH', '스위치', 'Wall Switch'], description: 'Wall switch', descriptionKo: '벽 스위치' },
  { id: 'SYM-LD-005', type: 'hvac', category: 'load', aliases: ['HVAC', 'AC', 'AHU', '공조기', 'Air Handling Unit'], description: 'HVAC unit', descriptionKo: '공조기' },
  { id: 'SYM-LD-006', type: 'ev_charger', category: 'load', aliases: ['EV', 'CHARGER', 'EVSE', '전기차충전기'], description: 'EV charger', descriptionKo: '전기차 충전기' },

  // === 모선 / 케이블 (Bus/Cable) ===
  { id: 'SYM-CB-001', type: 'bus', category: 'distribution', aliases: ['BUS', 'BUSBAR', '모선', 'Bus Bar'], iecRef: 'IEC-60617-06-15', description: 'Busbar', descriptionKo: '모선 (부스바)' },
  { id: 'SYM-CB-002', type: 'cable_tray', category: 'wiring', aliases: ['TRAY', 'CABLE_TRAY', '케이블트레이'], description: 'Cable tray', descriptionKo: '케이블 트레이' },
  { id: 'SYM-CB-003', type: 'conduit', category: 'wiring', aliases: ['CONDUIT', 'PIPE', '전선관'], description: 'Conduit', descriptionKo: '전선관' },
  { id: 'SYM-CB-004', type: 'junction_box', category: 'wiring', aliases: ['JB', 'JUNCTION', '정션박스', 'Junction Box'], description: 'Junction box', descriptionKo: '정션 박스' },

  // === 계측 / 화재 (Measurement/Fire) ===
  { id: 'SYM-MS-001', type: 'meter_wh', category: 'measurement', aliases: ['WHM', 'METER', '전력량계', 'Watt Hour Meter'], description: 'Watt-hour meter', descriptionKo: '전력량계' },
  { id: 'SYM-MS-002', type: 'meter_am', category: 'measurement', aliases: ['AM', 'AMMETER', '전류계'], description: 'Ammeter', descriptionKo: '전류계' },
  { id: 'SYM-MS-003', type: 'meter_vm', category: 'measurement', aliases: ['VM', 'VOLTMETER', '전압계'], description: 'Voltmeter', descriptionKo: '전압계' },
  { id: 'SYM-FD-001', type: 'fire_detector', category: 'fire', aliases: ['SMOKE', 'DETECTOR', '감지기', 'Smoke Detector'], description: 'Fire/smoke detector', descriptionKo: '화재 감지기' },
  { id: 'SYM-FD-002', type: 'emergency_light', category: 'fire', aliases: ['EMERGENCY', 'EXIT_LIGHT', '비상등', 'Emergency Light'], description: 'Emergency light', descriptionKo: '비상등' },
  { id: 'SYM-FD-003', type: 'fire_alarm_panel', category: 'fire', aliases: ['FAP', 'FIRE_PANEL', '화재수신기'], description: 'Fire alarm panel', descriptionKo: '화재 수신기' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Symbol Resolver
// ═══════════════════════════════════════════════════════════════════════════════

/** 빌드 시 인덱스 생성 */
const ALIAS_INDEX = new Map<string, string>();
for (const entry of EXPANDED_SYMBOL_DB) {
  for (const alias of entry.aliases) {
    ALIAS_INDEX.set(alias.toUpperCase(), entry.type);
  }
}

/**
 * CAD 블록명/VLM 인식명 → 표준 타입으로 변환.
 * 매칭 실패 시 원본 반환.
 */
export function resolveSymbol(raw: string): string {
  return ALIAS_INDEX.get(raw.toUpperCase()) ?? raw;
}

/**
 * 심볼 메타데이터 조회.
 */
export function getSymbolMetadata(type: string): SymbolEntry | undefined {
  return EXPANDED_SYMBOL_DB.find(e => e.type === type);
}

/**
 * 카테고리별 심볼 목록.
 */
export function getSymbolsByCategory(category: string): SymbolEntry[] {
  return EXPANDED_SYMBOL_DB.filter(e => e.category === category);
}

/** 전체 심볼 수 */
export function getSymbolCount(): number {
  return EXPANDED_SYMBOL_DB.length;
}
