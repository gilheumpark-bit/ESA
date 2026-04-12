/**
 * ESVA Multi-Domain Registry
 *
 * Central registry for all engineering domains supported by ESA.
 * Phase 1: electrical (전기) — current
 * Phase 2: fire (소방) — enabled
 * Phase 3: mechanical (기계) — disabled
 * Phase 4: civil (토목) — disabled
 *
 * PART 1: Types
 * PART 2: Domain definitions
 * PART 3: Keyword mapping
 * PART 4: Registry API
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface DomainConfig {
  /** Unique kebab-case identifier */
  id: string;
  /** Korean display name */
  name_ko: string;
  /** English display name */
  name_en: string;
  /** Lucide icon name for UI */
  icon: string;
  /** Calculator genre/category tags belonging to this domain */
  genres: string[];
  /** Reference standard families (e.g. KEC, NFSC, ASME) */
  standards: string[];
  /** Prefix for calculator IDs in this domain */
  calculatorPrefix: string;
  /** Prefix for sandbox agent isolation */
  sandboxPrefix: string;
  /** Whether this domain is active in the current phase */
  enabled: boolean;
}

export type DomainId = 'electrical' | 'fire' | 'mechanical' | 'civil';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Domain Definitions
// ═══════════════════════════════════════════════════════════════════════════════

const DOMAINS: Record<DomainId, DomainConfig> = {
  electrical: {
    id: 'electrical',
    name_ko: '전기',
    name_en: 'Electrical',
    icon: 'Zap',
    genres: [
      'power', 'voltage-drop', 'transformer', 'cable',
      'protection', 'grounding', 'renewable', 'motor',
      'substation', 'lighting', 'global', 'ai',
    ],
    standards: ['KEC', 'NEC', 'IEC 60364', 'IEEE'],
    calculatorPrefix: 'elec',
    sandboxPrefix: 'sandbox-elec',
    enabled: true,
  },

  fire: {
    id: 'fire',
    name_ko: '소방',
    name_en: 'Fire Protection',
    icon: 'Flame',
    genres: [
      'sprinkler', 'fire-pump', 'extinguisher',
      'smoke-exhaust', 'fire-alarm',
    ],
    standards: ['NFSC 101', 'NFSC 103', 'NFSC 203', 'NFSC 501', 'NFPA 13', 'NFPA 72'],
    calculatorPrefix: 'fire',
    sandboxPrefix: 'sandbox-fire',
    enabled: true,
  },

  mechanical: {
    id: 'mechanical',
    name_ko: '기계',
    name_en: 'Mechanical',
    icon: 'Cog',
    genres: [
      'pipe-sizing', 'heat-loss', 'pump-head',
      'boiler', 'hvac',
    ],
    standards: ['ASME B31', 'ASME BPVC', 'ASHRAE', 'KS B'],
    calculatorPrefix: 'mech',
    sandboxPrefix: 'sandbox-mech',
    enabled: false,
  },

  civil: {
    id: 'civil',
    name_ko: '토목',
    name_en: 'Civil',
    icon: 'Building2',
    genres: [
      'structural', 'geotechnical', 'hydraulics',
      'transportation', 'surveying',
    ],
    standards: ['ACI 318', 'AISC 360', 'KDS', 'KBC'],
    calculatorPrefix: 'civil',
    sandboxPrefix: 'sandbox-civil',
    enabled: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Keyword → Domain Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/** Korean/English keyword to domain ID lookup */
const KEYWORD_MAP: Record<string, DomainId> = {
  // 전기 (electrical)
  전기: 'electrical',
  전력: 'electrical',
  전압: 'electrical',
  전선: 'electrical',
  케이블: 'electrical',
  변압기: 'electrical',
  차단기: 'electrical',
  접지: 'electrical',
  KEC: 'electrical',
  NEC: 'electrical',
  IEC: 'electrical',

  // 소방 (fire)
  소방: 'fire',
  스프링클러: 'fire',
  소화기: 'fire',
  방화: 'fire',
  소화펌프: 'fire',
  화재감지기: 'fire',
  제연: 'fire',
  화재경보: 'fire',
  NFSC: 'fire',
  NFPA: 'fire',
  sprinkler: 'fire',
  'fire alarm': 'fire',
  'fire pump': 'fire',
  extinguisher: 'fire',

  // 기계 (mechanical)
  ASME: 'mechanical',
  보일러: 'mechanical',
  배관: 'mechanical',
  HVAC: 'mechanical',
  펌프: 'mechanical',
  열손실: 'mechanical',
  냉난방: 'mechanical',
  공조: 'mechanical',
  ASHRAE: 'mechanical',
  pipe: 'mechanical',
  boiler: 'mechanical',

  // 토목 (civil)
  토목: 'civil',
  구조: 'civil',
  콘크리트: 'civil',
  철근: 'civil',
  지반: 'civil',
  측량: 'civil',
  ACI: 'civil',
  AISC: 'civil',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Registry API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a domain configuration by ID.
 * Returns undefined if the domain does not exist.
 */
export function getDomain(id: DomainId): DomainConfig | undefined {
  return DOMAINS[id];
}

/**
 * Get all domains that are currently enabled.
 */
export function getEnabledDomains(): DomainConfig[] {
  return Object.values(DOMAINS).filter((d) => d.enabled);
}

/**
 * Get all registered domains regardless of enabled state.
 */
export function getAllDomains(): DomainConfig[] {
  return Object.values(DOMAINS);
}

/**
 * Resolve a keyword (Korean or English) to its domain.
 * Returns undefined if the keyword is not mapped.
 *
 * Case-insensitive for English keywords; exact match for Korean.
 */
export function getDomainByKeyword(keyword: string): DomainConfig | undefined {
  // Try exact match first
  const directId = KEYWORD_MAP[keyword];
  if (directId) return DOMAINS[directId];

  // Try case-insensitive match for English keywords
  const lower = keyword.toLowerCase();
  for (const [key, domainId] of Object.entries(KEYWORD_MAP)) {
    if (key.toLowerCase() === lower) {
      return DOMAINS[domainId];
    }
  }

  return undefined;
}

/**
 * Check if a specific domain is enabled.
 */
export function isDomainEnabled(id: DomainId): boolean {
  return DOMAINS[id]?.enabled ?? false;
}

/**
 * Get all domain IDs.
 */
export function getDomainIds(): DomainId[] {
  return Object.keys(DOMAINS) as DomainId[];
}
