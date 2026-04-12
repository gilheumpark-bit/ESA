/**
 * ESVA Search Engine — Autocomplete
 *
 * IEC 60050 based autocomplete with prefix + fuzzy matching.
 *
 * PART 1: Autocomplete dictionary (100+ electrical terms)
 * PART 2: Calculator & standard suggestion sources
 * PART 3: Fuzzy matching utilities
 * PART 4: Public API — getAutocompleteSuggestions()
 */

import type {
  Suggestion,
  SuggestionType,
  AutocompleteDictEntry,
  SupportedLanguage,
} from './types';
import { CALCULATOR_REGISTRY } from '@engine/calculators';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Autocomplete Dictionary (IEC 60050 Based)
// ═══════════════════════════════════════════════════════════════════════════════

export const AUTOCOMPLETE_DICTIONARY: readonly AutocompleteDictEntry[] = [
  // ── Transformers ──────────────────────────────────────────────────────────
  { term: '변압기', termEn: 'transformer', synonyms: ['TR', 'transformer', 'xfmr'], category: '변환기기', relatedCalc: 'transformer-capacity', iecRef: '421-01-01' },
  { term: '계기용변압기', termEn: 'potential transformer', synonyms: ['PT', 'VT', 'potential transformer'], category: '변환기기', iecRef: '321-02-01' },
  { term: '변류기', termEn: 'current transformer', synonyms: ['CT', 'current transformer'], category: '변환기기', iecRef: '321-02-02' },
  { term: '계기용변성기', termEn: 'instrument transformer', synonyms: ['MOF', 'instrument transformer'], category: '변환기기', iecRef: '321-02-03' },
  { term: '단권변압기', termEn: 'autotransformer', synonyms: ['autotransformer', 'auto-TR'], category: '변환기기' },

  // ── Circuit Breakers ──────────────────────────────────────────────────────
  { term: '배선용차단기', termEn: 'molded case circuit breaker', synonyms: ['MCCB', 'molded case circuit breaker'], category: '개폐기기', relatedCalc: 'breaker-sizing', iecRef: '441-14-20' },
  { term: '누전차단기', termEn: 'earth leakage circuit breaker', synonyms: ['ELCB', 'ELB', 'GFCI', 'RCD', 'earth leakage'], category: '개폐기기', iecRef: '442-05-02' },
  { term: '기중차단기', termEn: 'air circuit breaker', synonyms: ['ACB', 'air circuit breaker'], category: '개폐기기', iecRef: '441-14-21' },
  { term: '진공차단기', termEn: 'vacuum circuit breaker', synonyms: ['VCB', 'vacuum circuit breaker'], category: '개폐기기', iecRef: '441-14-22' },
  { term: '가스차단기', termEn: 'gas circuit breaker', synonyms: ['GCB', 'SF6 breaker', 'gas circuit breaker'], category: '개폐기기', iecRef: '441-14-23' },
  { term: '유입차단기', termEn: 'oil circuit breaker', synonyms: ['OCB', 'oil circuit breaker'], category: '개폐기기' },
  { term: '차단기', termEn: 'circuit breaker', synonyms: ['CB', 'circuit breaker', 'breaker'], category: '개폐기기', relatedCalc: 'breaker-sizing' },

  // ── Switchgear & Panels ───────────────────────────────────────────────────
  { term: '스위치기어', termEn: 'switchgear', synonyms: ['SWGR', 'switchgear', 'S/G'], category: '배전설비' },
  { term: '수배전반', termEn: 'switchboard', synonyms: ['switchboard', 'SWBD'], category: '배전설비' },
  { term: '분전반', termEn: 'distribution board', synonyms: ['PDB', 'panel board', 'distribution board', 'DB'], category: '배전설비' },
  { term: '전동기제어반', termEn: 'motor control center', synonyms: ['MCC', 'motor control center'], category: '배전설비' },
  { term: '제어반', termEn: 'control panel', synonyms: ['control panel', 'CP'], category: '배전설비' },

  // ── Protection ────────────────────────────────────────────────────────────
  { term: '보호계전기', termEn: 'protective relay', synonyms: ['relay', 'protective relay', '계전기'], category: '보호', iecRef: '448-11-01' },
  { term: '과전류계전기', termEn: 'overcurrent relay', synonyms: ['OCR', 'overcurrent relay', '51'], category: '보호', iecRef: '448-14-01' },
  { term: '과전압계전기', termEn: 'overvoltage relay', synonyms: ['OVR', 'overvoltage relay', '59'], category: '보호' },
  { term: '부족전압계전기', termEn: 'undervoltage relay', synonyms: ['UVR', 'undervoltage relay', '27'], category: '보호' },
  { term: '지락방향계전기', termEn: 'directional ground relay', synonyms: ['DGR', 'DGOCR', 'directional ground relay', '67N'], category: '보호' },
  { term: '지락과전류계전기', termEn: 'ground overcurrent relay', synonyms: ['OCGR', 'ground overcurrent relay', '51N'], category: '보호' },
  { term: '비율차동계전기', termEn: 'differential relay', synonyms: ['87', 'differential relay'], category: '보호' },
  { term: '거리계전기', termEn: 'distance relay', synonyms: ['21', 'distance relay', '임피던스릴레이'], category: '보호' },
  { term: '전자식과전류계전기', termEn: 'electronic overcurrent relay', synonyms: ['EOCR', 'electronic OCR'], category: '보호' },
  { term: '서지보호장치', termEn: 'surge protective device', synonyms: ['SPD', 'surge arrester', 'surge protective device'], category: '보호', iecRef: '614-03-11' },
  { term: '피뢰기', termEn: 'lightning arrester', synonyms: ['LA', 'lightning arrester', 'arrestor'], category: '보호', iecRef: '614-03-01' },
  { term: '퓨즈', termEn: 'fuse', synonyms: ['fuse', 'HRC fuse'], category: '보호', iecRef: '441-18-01' },

  // ── Cable & Wiring ────────────────────────────────────────────────────────
  { term: '케이블', termEn: 'cable', synonyms: ['cable', '전선', 'wire'], category: '전선', relatedCalc: 'cable-sizing', iecRef: '461-01-01' },
  { term: 'CV케이블', termEn: 'CV cable', synonyms: ['CV cable', 'XLPE cable', '가교폴리에틸렌'], category: '전선', relatedCalc: 'cable-sizing' },
  { term: 'IV전선', termEn: 'IV wire', synonyms: ['IV', 'PVC wire'], category: '전선' },
  { term: 'HIV전선', termEn: 'HIV wire', synonyms: ['HIV', '내열비닐전선'], category: '전선' },
  { term: 'FR-CV케이블', termEn: 'FR-CV cable', synonyms: ['FR-CV', 'flame retardant'], category: '전선' },
  { term: '부스바', termEn: 'busbar', synonyms: ['busbar', 'bus bar', '모선'], category: '전선' },
  { term: '버스덕트', termEn: 'bus duct', synonyms: ['bus duct', 'busway'], category: '전선' },
  { term: '케이블트레이', termEn: 'cable tray', synonyms: ['cable tray', 'tray'], category: '전선' },
  { term: '전선관', termEn: 'conduit', synonyms: ['conduit', 'raceway', '레이스웨이'], category: '전선' },

  // ── Grounding ─────────────────────────────────────────────────────────────
  { term: '접지', termEn: 'grounding', synonyms: ['ground', 'earthing', 'earth', 'grounding'], category: '접지', relatedCalc: 'ground-resistance', iecRef: '195-01-01' },
  { term: '접지봉', termEn: 'ground rod', synonyms: ['ground rod', 'earth rod', 'electrode'], category: '접지', relatedCalc: 'ground-resistance' },
  { term: '접지저항', termEn: 'grounding resistance', synonyms: ['ground resistance', 'earth resistance'], category: '접지', relatedCalc: 'ground-resistance' },
  { term: '접지선', termEn: 'grounding conductor', synonyms: ['ground wire', 'earthing conductor'], category: '접지' },
  { term: '등전위본딩', termEn: 'equipotential bonding', synonyms: ['bonding', 'equipotential bonding'], category: '접지' },
  { term: '피뢰시스템', termEn: 'lightning protection system', synonyms: ['LPS', 'lightning protection'], category: '접지' },

  // ── Power System ──────────────────────────────────────────────────────────
  { term: '역률', termEn: 'power factor', synonyms: ['PF', 'power factor', 'cos phi'], category: '전력', relatedCalc: 'single-phase-power', iecRef: '131-11-42' },
  { term: '수용률', termEn: 'demand factor', synonyms: ['demand factor', 'DF'], category: '전력', relatedCalc: 'transformer-capacity', iecRef: '691-10-02' },
  { term: '부등률', termEn: 'diversity factor', synonyms: ['diversity factor'], category: '전력', relatedCalc: 'transformer-capacity' },
  { term: '부하율', termEn: 'load factor', synonyms: ['load factor', 'LF'], category: '전력', iecRef: '691-10-01' },
  { term: '전압강하', termEn: 'voltage drop', synonyms: ['voltage drop', 'VD', '전압 강하'], category: '전력', relatedCalc: 'voltage-drop', iecRef: '601-01-23' },
  { term: '단락전류', termEn: 'short-circuit current', synonyms: ['short circuit current', 'fault current', 'Isc'], category: '전력', relatedCalc: 'short-circuit', iecRef: '448-12-08' },
  { term: '고장전류', termEn: 'fault current', synonyms: ['fault current', 'Isc'], category: '전력', relatedCalc: 'short-circuit' },
  { term: '정격전류', termEn: 'rated current', synonyms: ['rated current', 'In'], category: '전력', iecRef: '151-16-10' },
  { term: '허용전류', termEn: 'current-carrying capacity', synonyms: ['ampacity', 'current carrying capacity', 'CCC'], category: '전력', relatedCalc: 'cable-sizing', iecRef: '826-11-13' },
  { term: '유효전력', termEn: 'active power', synonyms: ['active power', 'real power', 'P'], category: '전력', iecRef: '131-11-42' },
  { term: '무효전력', termEn: 'reactive power', synonyms: ['reactive power', 'Q', 'var'], category: '전력', iecRef: '131-11-44' },
  { term: '피상전력', termEn: 'apparent power', synonyms: ['apparent power', 'S', 'VA'], category: '전력', iecRef: '131-11-41' },
  { term: '전력손실', termEn: 'power loss', synonyms: ['power loss', 'loss'], category: '전력' },
  { term: '임피던스', termEn: 'impedance', synonyms: ['impedance', 'Z'], category: '전력', iecRef: '131-12-43' },
  { term: '리액턴스', termEn: 'reactance', synonyms: ['reactance', 'X', 'XL', 'XC'], category: '전력', iecRef: '131-12-44' },

  // ── Motors & Generators ───────────────────────────────────────────────────
  { term: '전동기', termEn: 'motor', synonyms: ['motor', '모터'], category: '회전기', iecRef: '411-31-01' },
  { term: '유도전동기', termEn: 'induction motor', synonyms: ['induction motor', 'IM'], category: '회전기', iecRef: '411-33-01' },
  { term: '동기전동기', termEn: 'synchronous motor', synonyms: ['synchronous motor', 'SM'], category: '회전기' },
  { term: '발전기', termEn: 'generator', synonyms: ['generator', 'alternator'], category: '회전기', iecRef: '411-31-02' },
  { term: '비상발전기', termEn: 'emergency generator', synonyms: ['emergency generator', 'genset', '비상용발전기'], category: '회전기' },
  { term: '인버터', termEn: 'inverter', synonyms: ['inverter', 'VFD', 'VVVF', '가변주파수드라이브'], category: '회전기', iecRef: '551-12-03' },

  // ── Renewable Energy ──────────────────────────────────────────────────────
  { term: '태양광', termEn: 'solar PV', synonyms: ['solar', 'PV', 'photovoltaic', '태양전지'], category: '신재생', relatedCalc: 'solar-generation', iecRef: '151-13-81' },
  { term: '태양광모듈', termEn: 'PV module', synonyms: ['PV module', 'solar panel', 'solar module'], category: '신재생', relatedCalc: 'solar-generation' },
  { term: '태양광인버터', termEn: 'PV inverter', synonyms: ['PV inverter', 'solar inverter', 'grid-tie inverter'], category: '신재생' },
  { term: '에너지저장장치', termEn: 'energy storage system', synonyms: ['ESS', 'energy storage', 'BESS'], category: '신재생', relatedCalc: 'battery-capacity' },
  { term: '배터리', termEn: 'battery', synonyms: ['battery', '축전지', '리튬이온'], category: '신재생', relatedCalc: 'battery-capacity' },
  { term: '풍력발전기', termEn: 'wind turbine', synonyms: ['wind turbine', 'wind generator', '풍력'], category: '신재생' },
  { term: '연료전지', termEn: 'fuel cell', synonyms: ['fuel cell', 'FC'], category: '신재생' },

  // ── Power Electronics ─────────────────────────────────────────────────────
  { term: '정류기', termEn: 'rectifier', synonyms: ['rectifier', '다이오드'], category: '전력전자' },
  { term: '콘덴서', termEn: 'capacitor', synonyms: ['capacitor', 'cap', '진상콘덴서'], category: '전력전자', iecRef: '436-01-01' },
  { term: '리액터', termEn: 'reactor', synonyms: ['reactor', 'inductor', '직렬리액터'], category: '전력전자' },
  { term: '고조파', termEn: 'harmonics', synonyms: ['harmonics', 'THD', 'harmonic distortion'], category: '전력전자', iecRef: '161-08-10' },
  { term: '고조파필터', termEn: 'harmonic filter', synonyms: ['harmonic filter', 'passive filter', 'active filter'], category: '전력전자' },

  // ── Automation & Control ──────────────────────────────────────────────────
  { term: '자동절체스위치', termEn: 'automatic transfer switch', synonyms: ['ATS', 'automatic transfer switch'], category: '자동화' },
  { term: '무정전전원장치', termEn: 'uninterruptible power supply', synonyms: ['UPS', 'uninterruptible power supply'], category: '자동화' },
  { term: 'PLC', termEn: 'PLC', synonyms: ['programmable logic controller', '프로그래머블 로직 컨트롤러'], category: '자동화' },
  { term: 'SCADA', termEn: 'SCADA', synonyms: ['supervisory control', '원격감시제어'], category: '자동화' },

  // ── Measurements & Quantities ─────────────────────────────────────────────
  { term: '전압', termEn: 'voltage', synonyms: ['voltage', 'V', 'potential'], category: '물리량', iecRef: '131-11-56' },
  { term: '전류', termEn: 'current', synonyms: ['current', 'A', 'ampere'], category: '물리량', iecRef: '131-11-60' },
  { term: '전력', termEn: 'power', synonyms: ['power', 'W', 'watt'], category: '물리량', relatedCalc: 'single-phase-power', iecRef: '131-11-41' },
  { term: '저항', termEn: 'resistance', synonyms: ['resistance', 'R', 'ohm'], category: '물리량', iecRef: '131-12-04' },
  { term: '주파수', termEn: 'frequency', synonyms: ['frequency', 'Hz', 'hertz'], category: '물리량', iecRef: '103-06-02' },
  { term: '절연저항', termEn: 'insulation resistance', synonyms: ['insulation resistance', 'megger'], category: '물리량', iecRef: '151-15-42' },

  // ── Installation Types ────────────────────────────────────────────────────
  { term: '수변전설비', termEn: 'substation', synonyms: ['substation', '수전설비', '변전소', '수변전'], category: '설비' },
  { term: '비상전원', termEn: 'emergency power', synonyms: ['emergency power', '비상전원설비'], category: '설비' },
  { term: '예비전원', termEn: 'standby power', synonyms: ['standby power', '예비전원설비'], category: '설비' },
  { term: '조명설비', termEn: 'lighting system', synonyms: ['lighting', '조명'], category: '설비' },
  { term: '동력설비', termEn: 'power installation', synonyms: ['power installation', '동력'], category: '설비' },
  { term: '전열설비', termEn: 'heating installation', synonyms: ['heating', '전열', '히터'], category: '설비' },
  { term: '방폭설비', termEn: 'explosion-proof', synonyms: ['explosion proof', 'Ex', '방폭'], category: '설비' },

  // ── Standards & Codes ─────────────────────────────────────────────────────
  { term: 'KEC', termEn: 'Korea Electrotechnical Code', synonyms: ['한국전기설비기술기준', '전기설비기술기준', '기술기준'], category: '기준' },
  { term: 'NEC', termEn: 'National Electrical Code', synonyms: ['national electrical code', 'NFPA 70'], category: '기준' },
  { term: 'IEC', termEn: 'International Electrotechnical Commission', synonyms: ['국제전기기술위원회'], category: '기준' },
  { term: 'IEEE', termEn: 'IEEE', synonyms: ['Institute of Electrical and Electronics Engineers'], category: '기준' },
  { term: '내선규정', termEn: 'internal wiring regulations', synonyms: ['KECG', '한국전기공사협회'], category: '기준' },
  { term: '전기사업법', termEn: 'Electric Utility Act', synonyms: ['electric utility act'], category: '기준' },

  // ── Calculations & Concepts ───────────────────────────────────────────────
  { term: '부하계산', termEn: 'load calculation', synonyms: ['load calculation', '부하산정'], category: '계산', relatedCalc: 'transformer-capacity' },
  { term: '조도계산', termEn: 'illumination calculation', synonyms: ['illumination calculation', '조도', 'lux'], category: '계산' },
  { term: '수용가용량', termEn: 'customer demand', synonyms: ['customer demand', '계약전력'], category: '계산' },
  { term: '전력계통', termEn: 'power system', synonyms: ['power system', '계통', 'grid'], category: '계산' },
  { term: '단상전력', termEn: 'single-phase power', synonyms: ['single phase power', '단상'], category: '계산', relatedCalc: 'single-phase-power' },
  { term: '3상전력', termEn: 'three-phase power', synonyms: ['three phase power', '삼상', '3상'], category: '계산', relatedCalc: 'three-phase-power' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Calculator & Standard Sources
// ═══════════════════════════════════════════════════════════════════════════════

/** Common KEC/NEC/IEC clause references for standard-type suggestions */
const STANDARD_REFERENCES: readonly { text: string; subtitle: string }[] = [
  { text: 'KEC 131', subtitle: '공통사항 — 전선' },
  { text: 'KEC 132', subtitle: '공통사항 — 전로의 절연' },
  { text: 'KEC 140', subtitle: '공통사항 — 접지시스템' },
  { text: 'KEC 210', subtitle: '저압전기설비 — 일반' },
  { text: 'KEC 212', subtitle: '저압전기설비 — 배선' },
  { text: 'KEC 213', subtitle: '저압전기설비 — 개폐기 및 과전류보호' },
  { text: 'KEC 232', subtitle: '고압·특고압 전기설비 — 전선로' },
  { text: 'KEC 241', subtitle: '전력보안 통신설비' },
  { text: 'KEC 310', subtitle: '분산형전원 — 일반사항' },
  { text: 'KEC 351', subtitle: '분산형전원 — 태양광' },
  { text: 'KEC 352', subtitle: '분산형전원 — 풍력' },
  { text: 'KEC 353', subtitle: '분산형전원 — 연료전지' },
  { text: 'KEC 354', subtitle: '분산형전원 — ESS' },
  { text: 'NEC 210', subtitle: 'Branch Circuits' },
  { text: 'NEC 215', subtitle: 'Feeders' },
  { text: 'NEC 220', subtitle: 'Branch-Circuit, Feeder, and Service Load Calculations' },
  { text: 'NEC 230', subtitle: 'Services' },
  { text: 'NEC 240', subtitle: 'Overcurrent Protection' },
  { text: 'NEC 250', subtitle: 'Grounding and Bonding' },
  { text: 'NEC 300', subtitle: 'General Requirements for Wiring Methods' },
  { text: 'NEC 310', subtitle: 'Conductors for General Wiring' },
  { text: 'NEC 480', subtitle: 'Storage Batteries' },
  { text: 'NEC 690', subtitle: 'Solar Photovoltaic Systems' },
  { text: 'NEC 705', subtitle: 'Interconnected Electric Power Production Sources' },
  { text: 'IEC 60364', subtitle: 'Low-Voltage Electrical Installations' },
  { text: 'IEC 61936', subtitle: 'Power Installations Exceeding 1 kV AC' },
  { text: 'IEC 60909', subtitle: 'Short-Circuit Currents in Three-Phase AC Systems' },
  { text: 'IEC 61439', subtitle: 'Low-Voltage Switchgear and Controlgear Assemblies' },
  { text: 'IEEE 80', subtitle: 'Guide for Safety in AC Substation Grounding' },
  { text: 'IEEE 142', subtitle: 'Grounding of Industrial and Commercial Power Systems' },
  { text: 'IEEE 1584', subtitle: 'Guide for Performing Arc-Flash Hazard Calculations' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Fuzzy Matching Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a candidate string matches the partial input.
 * Uses prefix matching first, then 1-edit-distance fuzzy match.
 *
 * @returns Score: 1.0 for prefix, 0.7 for fuzzy, 0 for no match
 */
function matchScore(candidate: string, partial: string): number {
  const cLower = candidate.toLowerCase();
  const pLower = partial.toLowerCase();

  // Exact prefix match
  if (cLower.startsWith(pLower)) {
    return 1.0;
  }

  // Substring containment
  if (cLower.includes(pLower)) {
    return 0.8;
  }

  // 1-edit-distance fuzzy match (for short inputs only, to avoid false positives)
  if (pLower.length >= 2 && pLower.length <= 10) {
    if (isWithinEditDistance(cLower, pLower, 1)) {
      return 0.6;
    }
  }

  return 0;
}

/**
 * Check if the prefix of candidate (up to partial.length+1 chars)
 * is within the given edit distance of partial.
 * Uses a bounded Levenshtein approach.
 */
function isWithinEditDistance(candidate: string, partial: string, maxDist: number): boolean {
  const n = partial.length;
  // Compare against the first n+maxDist characters of candidate
  const m = Math.min(candidate.length, n + maxDist);
  const sub = candidate.substring(0, m);

  // Row-based Levenshtein with early termination
  let prevRow: number[] = [];
  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= sub.length; i++) {
    const currRow: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = sub[i - 1] === partial[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,       // insertion
        prevRow[j] + 1,            // deletion
        prevRow[j - 1] + cost,     // substitution
      );
      rowMin = Math.min(rowMin, currRow[j]);
    }
    // Early exit: if the entire row exceeds maxDist, no solution
    if (rowMin > maxDist) return false;
    prevRow = currRow;
  }

  return prevRow[n] <= maxDist;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Public API
// ═══════════════════════════════════════════════════════════════════════════════

/** In-memory recent searches (session-scoped) */
const recentSearches: string[] = [];
const MAX_RECENT = 20;

/**
 * Record a search query for recent-search suggestions.
 * Call this after a user performs a search.
 */
export function recordRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length === 0) return;

  // Remove duplicate if exists, then prepend
  const idx = recentSearches.indexOf(trimmed);
  if (idx !== -1) recentSearches.splice(idx, 1);
  recentSearches.unshift(trimmed);

  // Trim to max size
  if (recentSearches.length > MAX_RECENT) {
    recentSearches.length = MAX_RECENT;
  }
}

/**
 * Get autocomplete suggestions for a partial query string.
 *
 * @param partial - The partial input typed by the user
 * @param lang    - Display language preference
 * @param limit   - Maximum number of suggestions (default: 10)
 * @returns Array of scored, deduplicated Suggestion objects
 */
export function getAutocompleteSuggestions(
  partial: string,
  lang: SupportedLanguage,
  limit: number = 10,
): Suggestion[] {
  const trimmed = partial.trim();
  if (trimmed.length === 0) {
    // Return recent searches when input is empty
    return recentSearches.slice(0, limit).map((text) => ({
      text,
      type: 'recent' as SuggestionType,
      icon: 'clock',
    }));
  }

  const candidates: Suggestion[] = [];

  // --- Source 1: Dictionary terms ---
  for (const entry of AUTOCOMPLETE_DICTIONARY) {
    const displayText = lang === 'ko' ? entry.term : (entry.termEn || entry.term);
    const allTexts = [entry.term, entry.termEn || '', ...entry.synonyms];
    let bestScore = 0;

    for (const t of allTexts) {
      if (t.length === 0) continue;
      const s = matchScore(t, trimmed);
      bestScore = Math.max(bestScore, s);
    }

    if (bestScore > 0) {
      candidates.push({
        text: displayText,
        type: 'term',
        icon: 'zap',
        subtitle: lang === 'ko' ? entry.termEn : entry.term,
        score: bestScore,
      });
    }
  }

  // --- Source 2: Calculator names ---
  for (const [, calc] of CALCULATOR_REGISTRY) {
    const displayText = lang === 'ko' ? calc.name : calc.nameEn;
    const allTexts = [calc.name, calc.nameEn, calc.id];
    let bestScore = 0;

    for (const t of allTexts) {
      const s = matchScore(t, trimmed);
      bestScore = Math.max(bestScore, s);
    }

    if (bestScore > 0) {
      candidates.push({
        text: displayText,
        type: 'calculator',
        icon: 'calculator',
        subtitle: lang === 'ko' ? calc.nameEn : calc.name,
        score: bestScore,
      });
    }
  }

  // --- Source 3: Standard references ---
  for (const ref of STANDARD_REFERENCES) {
    const s = matchScore(ref.text, trimmed);
    if (s > 0) {
      candidates.push({
        text: ref.text,
        type: 'standard',
        icon: 'book-open',
        subtitle: ref.subtitle,
        score: s,
      });
    }
  }

  // --- Source 4: Recent searches ---
  for (const recent of recentSearches) {
    const s = matchScore(recent, trimmed);
    if (s > 0) {
      candidates.push({
        text: recent,
        type: 'recent',
        icon: 'clock',
        score: s * 0.9, // Slight penalty so term/calc rank higher at equal match
      });
    }
  }

  // Deduplicate by text (keep highest score)
  const deduped = new Map<string, Suggestion>();
  for (const c of candidates) {
    const key = c.text.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || (c.score ?? 0) > (existing.score ?? 0)) {
      deduped.set(key, c);
    }
  }

  // Sort by score descending, then alphabetically
  const sorted = Array.from(deduped.values()).sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.text.localeCompare(b.text);
  });

  return sorted.slice(0, limit);
}
