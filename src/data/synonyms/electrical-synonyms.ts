// =============================================================================
// 전기공학 약어/동의어 매핑
// 약어 → [한국어, 영어 정식명칭, ...추가 동의어]
// =============================================================================

export const ELECTRICAL_SYNONYMS: Map<string, string[]> = new Map([
  // =========================================================================
  // PART 1: 차단기/개폐기 (Breakers & Switches)
  // =========================================================================
  ['MCCB', ['배선용차단기', 'Molded Case Circuit Breaker']],
  ['VCB', ['진공차단기', 'Vacuum Circuit Breaker']],
  ['ACB', ['기중차단기', 'Air Circuit Breaker']],
  ['GCB', ['가스차단기', 'Gas Circuit Breaker']],
  ['OCB', ['유입차단기', 'Oil Circuit Breaker']],
  ['MBB', ['자기차단기', 'Magnetic Blowout Breaker']],
  ['ELCB', ['누전차단기', 'Earth Leakage Circuit Breaker', 'ELB']],
  ['RCD', ['잔류전류장치', 'Residual Current Device']],
  ['RCCB', ['잔류전류차단기', 'Residual Current Circuit Breaker']],
  ['RCBO', ['잔류전류과전류보호장치', 'Residual Current Breaker with Overcurrent']],
  ['GFCI', ['지락차단기', 'Ground Fault Circuit Interrupter']],
  ['CB', ['차단기', 'Circuit Breaker']],
  ['DS', ['단로기', 'Disconnector', 'Disconnect Switch', 'Isolator']],
  ['LBS', ['부하개폐기', 'Load Break Switch']],
  ['ATS', ['자동절환개폐기', 'Automatic Transfer Switch']],
  ['MTS', ['수동절환개폐기', 'Manual Transfer Switch']],

  // =========================================================================
  // PART 2: 변압기/변성기 (Transformers)
  // =========================================================================
  ['TR', ['변압기', 'Transformer', 'Xfmr']],
  ['CT', ['변류기', 'Current Transformer']],
  ['PT', ['계기용변압기', 'Potential Transformer']],
  ['VT', ['계기용변압기', 'Voltage Transformer']],
  ['ZCT', ['영상변류기', 'Zero-phase Current Transformer']],
  ['GPT', ['접지형계기용변압기', 'Grounding Potential Transformer']],
  ['MOF', ['계기용변성기', 'Metering Outfit']],
  ['PCT', ['보호용변류기', 'Protection Current Transformer']],
  ['AVR', ['자동전압조정기', 'Automatic Voltage Regulator']],
  ['SVR', ['자동전압조정기', 'Step Voltage Regulator']],

  // =========================================================================
  // PART 3: 배전설비 (Distribution Equipment)
  // =========================================================================
  ['GIS', ['가스절연개폐장치', 'Gas Insulated Switchgear']],
  ['C-GIS', ['콤팩트가스절연개폐장치', 'Compact Gas Insulated Switchgear']],
  ['SWBD', ['배전반', 'Switchboard']],
  ['MCC', ['모터제어반', 'Motor Control Center']],
  ['PDP', ['동력분전반', 'Power Distribution Panel']],
  ['LP', ['조명분전반', 'Lighting Panel', 'Lighting Panelboard']],
  ['SDP', ['부분전반', 'Sub Distribution Panel']],
  ['MSB', ['주배전반', 'Main Switchboard']],
  ['DB', ['분전반', 'Distribution Board']],

  // =========================================================================
  // PART 4: 측정/계측 (Measurement)
  // =========================================================================
  ['PF', ['역률', 'Power Factor', 'cos phi']],
  ['VD', ['전압강하', 'Voltage Drop', 'V-Drop']],
  ['THD', ['전고조파왜형률', 'Total Harmonic Distortion']],
  ['TDD', ['총수요왜형률', 'Total Demand Distortion']],
  ['DMM', ['디지털멀티미터', 'Digital Multimeter']],
  ['WHM', ['전력량계', 'Watt-Hour Meter']],
  ['CTD', ['전류전압변환기', 'Current-to-Digital']],

  // =========================================================================
  // PART 5: 신재생/ESS (Renewable & Storage)
  // =========================================================================
  ['ESS', ['에너지저장장치', 'Energy Storage System']],
  ['BESS', ['배터리에너지저장장치', 'Battery Energy Storage System']],
  ['PCS', ['전력변환장치', 'Power Conversion System']],
  ['PV', ['태양광', 'Photovoltaic', 'Solar']],
  ['WT', ['풍력발전기', 'Wind Turbine']],
  ['BMS', ['배터리관리시스템', 'Battery Management System']],
  ['EMS', ['에너지관리시스템', 'Energy Management System']],
  ['MPPT', ['최대전력점추종', 'Maximum Power Point Tracking']],
  ['SOC', ['충전상태', 'State of Charge']],
  ['SOH', ['건강상태', 'State of Health']],
  ['DOD', ['방전깊이', 'Depth of Discharge']],
  ['LFP', ['리튬인산철', 'Lithium Iron Phosphate', 'LiFePO4']],
  ['NMC', ['삼원계', 'Nickel Manganese Cobalt', 'Li(NiMnCo)O2']],

  // =========================================================================
  // PART 6: 전동기/드라이브 (Motor & Drives)
  // =========================================================================
  ['VFD', ['가변주파수드라이브', 'Variable Frequency Drive', 'Inverter Drive']],
  ['VVVF', ['가변전압가변주파수', 'Variable Voltage Variable Frequency']],
  ['DOL', ['전전압기동', 'Direct On Line']],
  ['MC', ['전자접촉기', 'Magnetic Contactor']],
  ['THR', ['열동형과전류계전기', 'Thermal Overload Relay', 'OLR']],
  ['SS', ['소프트스타터', 'Soft Starter']],
  ['IM', ['유도전동기', 'Induction Motor']],
  ['SM', ['동기전동기', 'Synchronous Motor']],
  ['PM', ['영구자석전동기', 'Permanent Magnet Motor']],
  ['BLDC', ['브러시리스DC모터', 'Brushless DC Motor']],

  // =========================================================================
  // PART 7: 보호/계전기 (Protection & Relays)
  // =========================================================================
  ['OCR', ['과전류계전기', 'Overcurrent Relay', '51/50']],
  ['OCGR', ['지락과전류계전기', 'Ground Overcurrent Relay', '51G/50G']],
  ['UVR', ['부족전압계전기', 'Undervoltage Relay', '27']],
  ['OVR', ['과전압계전기', 'Overvoltage Relay', '59']],
  ['DFR', ['주파수계전기', 'Frequency Relay', '81']],
  ['SGR', ['선택지락계전기', 'Selective Ground Relay', '67G']],
  ['OVGR', ['지락과전압계전기', 'Ground Overvoltage Relay', '59G']],
  ['RPR', ['역전력계전기', 'Reverse Power Relay', '32']],

  // =========================================================================
  // PART 8: 접지/피뢰 (Grounding & Lightning)
  // =========================================================================
  ['SPD', ['서지보호장치', 'Surge Protective Device']],
  ['LA', ['피뢰기', 'Lightning Arrester', 'Surge Arrester']],
  ['NGR', ['중성점접지저항', 'Neutral Grounding Resistor']],
  ['PE', ['보호접지', 'Protective Earth', 'Protective Conductor']],
  ['GND', ['접지', 'Ground', 'Earth']],
  ['LPS', ['피뢰시스템', 'Lightning Protection System']],

  // =========================================================================
  // PART 9: 케이블/전선 (Cables & Wires)
  // =========================================================================
  ['XLPE', ['가교폴리에틸렌', 'Cross-linked Polyethylene']],
  ['PVC', ['폴리염화비닐', 'Polyvinyl Chloride']],
  ['EPR', ['에틸렌프로필렌고무', 'Ethylene Propylene Rubber']],
  ['LSZH', ['저독성난연', 'Low Smoke Zero Halogen', 'HFIX']],
  ['CV', ['CV케이블', 'XLPE Insulated PVC Sheathed Cable']],
  ['CVV', ['CVV케이블', 'Control Cable']],
  ['FR', ['내화', 'Fire Resistant']],
  ['AWG', ['미국전선규격', 'American Wire Gauge']],
  ['MCM', ['밀서큘러밀', 'Thousand Circular Mils', 'kcmil']],
  ['EMT', ['전선관', 'Electrical Metallic Tubing']],

  // =========================================================================
  // PART 10: 기타 전기 약어 (General)
  // =========================================================================
  ['UPS', ['무정전전원장치', 'Uninterruptible Power Supply']],
  ['SLD', ['단선도', 'Single Line Diagram']],
  ['P&ID', ['배관계장도', 'Piping and Instrumentation Diagram']],
  ['MV', ['중전압', 'Medium Voltage']],
  ['HV', ['고전압', 'High Voltage']],
  ['LV', ['저전압', 'Low Voltage']],
  ['EHV', ['초고전압', 'Extra High Voltage']],
  ['UHV', ['극초고전압', 'Ultra High Voltage']],
  ['DC', ['직류', 'Direct Current']],
  ['AC', ['교류', 'Alternating Current']],
  ['kVA', ['킬로볼트암페어', 'Kilovolt-Ampere']],
  ['MVA', ['메가볼트암페어', 'Megavolt-Ampere']],
  ['DG', ['디젤발전기', 'Diesel Generator']],
  ['SCADA', ['원격감시제어', 'Supervisory Control and Data Acquisition']],
  ['RTU', ['원격단말장치', 'Remote Terminal Unit']],
  ['PLC', ['프로그래머블로직컨트롤러', 'Programmable Logic Controller']],
  ['HMI', ['휴먼머신인터페이스', 'Human Machine Interface']],
  ['DCS', ['분산제어시스템', 'Distributed Control System']],
  ['EPC', ['설계조달시공', 'Engineering Procurement Construction']],
  ['FAT', ['공장인수시험', 'Factory Acceptance Test']],
  ['SAT', ['현장인수시험', 'Site Acceptance Test']],

  // =========================================================================
  // PART 9: 일본어 동의어 (Japanese Synonyms)
  // =========================================================================
  ['アース', ['접지', 'Grounding', 'Earthing', '接地']],
  ['接地抵抗', ['접지저항', 'Ground Resistance', 'アース抵抗']],
  ['電圧降下', ['전압강하', 'Voltage Drop']],
  ['過電流', ['과전류', 'Overcurrent']],
  ['短絡', ['단락', 'Short Circuit', '短絡電流']],
  ['遮断器', ['차단기', 'Circuit Breaker', 'ブレーカー']],
  ['変圧器', ['변압기', 'Transformer', 'トランス']],
  ['配電盤', ['배전반', 'Switchboard', 'Distribution Board']],
  ['電線管', ['전선관', 'Conduit', 'コンジット']],
  ['許容電流', ['허용전류', 'Ampacity', 'Allowable Current']],
  ['力率', ['역률', 'Power Factor']],
  ['漏電', ['누전', 'Earth Leakage', 'Ground Fault']],
  ['太陽光発電', ['태양광발전', 'Solar PV', 'Photovoltaic']],
  ['蓄電池', ['축전지', 'Battery', 'Storage Battery']],
  ['電動機', ['전동기', 'Motor', 'モーター']],
  ['受変電設備', ['수변전설비', 'Substation', 'Receiving/Transforming Equipment']],
  ['絶縁抵抗', ['절연저항', 'Insulation Resistance']],
  ['耐圧試験', ['내전압시험', 'Withstand Voltage Test', 'Hi-Pot Test']],
  ['電気設備技術基準', ['전기설비기술기준', 'Technical Standard for Electrical Facilities']],
  ['内線規程', ['내선규정', 'Internal Wiring Regulations']],
]);

// =============================================================================
// 역방향 검색 헬퍼: 한국어/영어 → 약어
// =============================================================================

/** 정식명칭 → 약어 역방향 조회 */
export function findAbbreviation(fullName: string): string | undefined {
  const lower = fullName.toLowerCase();
  for (const [abbr, names] of ELECTRICAL_SYNONYMS) {
    if (names.some((n) => n.toLowerCase() === lower)) {
      return abbr;
    }
  }
  return undefined;
}

/** 약어인지 확인 */
export function isKnownAbbreviation(term: string): boolean {
  return ELECTRICAL_SYNONYMS.has(term.toUpperCase());
}

/** 약어 → 한국어 명칭 */
export function getKoreanName(abbreviation: string): string | undefined {
  const entry = ELECTRICAL_SYNONYMS.get(abbreviation.toUpperCase());
  return entry?.[0];
}

/** 약어 → 영어 명칭 */
export function getEnglishName(abbreviation: string): string | undefined {
  const entry = ELECTRICAL_SYNONYMS.get(abbreviation.toUpperCase());
  return entry?.[1];
}
