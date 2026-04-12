/**
 * Standard Drawing Database
 * -------------------------
 * 표준 도면 템플릿 DB — 일반적인 수전 설비 구성 참조용.
 * 실제 도면 분석 시 "정상 패턴"과 비교하여 이상 탐지.
 *
 * PART 1: Standard configurations
 * PART 2: Pattern matching
 * PART 3: Deviation detection
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Standard Configurations
// ═══════════════════════════════════════════════════════════════════════════════

export interface StandardDrawingTemplate {
  id: string;
  name: string;
  nameKo: string;
  category: string;         // 'substation' | 'distribution' | 'lighting' | 'power' | 'fire'
  voltageClass: string;     // 'HV' | 'MV' | 'LV'
  description: string;
  typicalComponents: ComponentTemplate[];
  typicalConnections: ConnectionTemplate[];
  standards: string[];      // 적용 기준 ["KEC 311", "KEC 232"]
  note?: string;
}

interface ComponentTemplate {
  type: string;
  minCount: number;
  maxCount: number;
  requiredRating?: string;
  mandatory: boolean;
}

interface ConnectionTemplate {
  from: string;             // 컴포넌트 타입
  to: string;
  mandatory: boolean;
  typicalCable?: string;
}

export const STANDARD_DRAWINGS: StandardDrawingTemplate[] = [
  // === 수전 설비 (Substation) ===
  {
    id: 'STD-SUB-001',
    name: 'Typical 22.9kV Substation',
    nameKo: '표준 22.9kV 수전 설비',
    category: 'substation',
    voltageClass: 'HV',
    description: '한전 수전 → MOF → DS → VCB → TR → ACB → 분전반',
    typicalComponents: [
      { type: 'transformer_ct', minCount: 3, maxCount: 3, mandatory: true },    // MOF (CT×3)
      { type: 'switch_ds', minCount: 1, maxCount: 2, mandatory: true },         // DS
      { type: 'breaker_vcb', minCount: 1, maxCount: 2, mandatory: true },       // VCB
      { type: 'transformer', minCount: 1, maxCount: 3, requiredRating: '≥300kVA', mandatory: true },
      { type: 'breaker_acb', minCount: 1, maxCount: 4, mandatory: true },       // ACB (주 차단기)
      { type: 'spd', minCount: 1, maxCount: 2, mandatory: true },              // 서지보호기
      { type: 'ground_rod', minCount: 1, maxCount: 4, mandatory: true },       // 접지
      { type: 'meter_wh', minCount: 1, maxCount: 1, mandatory: true },         // 전력량계
    ],
    typicalConnections: [
      { from: 'transformer_ct', to: 'switch_ds', mandatory: true },
      { from: 'switch_ds', to: 'breaker_vcb', mandatory: true },
      { from: 'breaker_vcb', to: 'transformer', mandatory: true },
      { from: 'transformer', to: 'breaker_acb', mandatory: true },
      { from: 'breaker_acb', to: 'panel_swgr', mandatory: true },
    ],
    standards: ['KEC 311.1', 'KEC 311.2', 'KEC 142.5'],
  },

  // === 저압 배전 (Low Voltage Distribution) ===
  {
    id: 'STD-DIST-001',
    name: 'Typical LV Distribution',
    nameKo: '표준 저압 배전 설비',
    category: 'distribution',
    voltageClass: 'LV',
    description: 'ACB → 부스바 → MCCB × N → 분전반',
    typicalComponents: [
      { type: 'breaker_acb', minCount: 1, maxCount: 2, mandatory: true },
      { type: 'bus', minCount: 1, maxCount: 1, mandatory: true },
      { type: 'breaker_mccb', minCount: 4, maxCount: 20, mandatory: true },
      { type: 'panel_dist', minCount: 2, maxCount: 10, mandatory: false },
      { type: 'breaker_elcb', minCount: 1, maxCount: 10, mandatory: true },    // 누전차단기 필수
    ],
    typicalConnections: [
      { from: 'breaker_acb', to: 'bus', mandatory: true },
      { from: 'bus', to: 'breaker_mccb', mandatory: true },
      { from: 'breaker_mccb', to: 'panel_dist', mandatory: false },
    ],
    standards: ['KEC 212.3', 'KEC 232.52', 'KEC 232.31'],
  },

  // === 전등 설비 (Lighting) ===
  {
    id: 'STD-LIGHT-001',
    name: 'Typical Lighting Circuit',
    nameKo: '표준 전등 회로',
    category: 'lighting',
    voltageClass: 'LV',
    description: '분전반 → MCCB → 전등 × N + 비상등 + 유도등',
    typicalComponents: [
      { type: 'panel_lighting', minCount: 1, maxCount: 4, mandatory: true },
      { type: 'breaker_mcb', minCount: 4, maxCount: 24, mandatory: true },
      { type: 'light', minCount: 10, maxCount: 200, mandatory: true },
      { type: 'emergency_light', minCount: 2, maxCount: 20, mandatory: true },
      { type: 'switch_wall', minCount: 4, maxCount: 50, mandatory: true },
    ],
    typicalConnections: [
      { from: 'panel_lighting', to: 'breaker_mcb', mandatory: true },
      { from: 'breaker_mcb', to: 'light', mandatory: true, typicalCable: 'HIV 2.5sq × 3C' },
      { from: 'switch_wall', to: 'light', mandatory: true },
    ],
    standards: ['KEC 232.52', 'KEC 234.1', '소방법 시행령 별표1'],
  },

  // === 동력 설비 (Motor Power) ===
  {
    id: 'STD-MOTOR-001',
    name: 'Typical Motor Circuit',
    nameKo: '표준 동력 회로',
    category: 'power',
    voltageClass: 'LV',
    description: 'MCC → MCCB → MC → THR → Motor',
    typicalComponents: [
      { type: 'panel_mcc', minCount: 1, maxCount: 2, mandatory: true },
      { type: 'breaker_mccb', minCount: 1, maxCount: 20, mandatory: true },
      { type: 'contactor', minCount: 1, maxCount: 20, mandatory: true },
      { type: 'motor', minCount: 1, maxCount: 20, mandatory: true },
      { type: 'motor_vfd', minCount: 0, maxCount: 10, mandatory: false },
    ],
    typicalConnections: [
      { from: 'panel_mcc', to: 'breaker_mccb', mandatory: true },
      { from: 'breaker_mccb', to: 'contactor', mandatory: true },
      { from: 'contactor', to: 'motor', mandatory: true, typicalCable: 'XLPE 3C' },
    ],
    standards: ['KEC 212.3', 'KEC 232.52', 'KEC 341.1'],
  },

  // === 소방 설비 (Fire Protection) ===
  {
    id: 'STD-FIRE-001',
    name: 'Typical Fire Alarm System',
    nameKo: '표준 화재 경보 설비',
    category: 'fire',
    voltageClass: 'LV',
    description: '수신기 → 중계기 → 감지기 + 비상등 + 유도등',
    typicalComponents: [
      { type: 'fire_alarm_panel', minCount: 1, maxCount: 2, mandatory: true },
      { type: 'fire_detector', minCount: 10, maxCount: 500, mandatory: true },
      { type: 'emergency_light', minCount: 5, maxCount: 100, mandatory: true },
    ],
    typicalConnections: [
      { from: 'fire_alarm_panel', to: 'fire_detector', mandatory: true },
    ],
    standards: ['소방시설법', '화재예방법 시행령'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Pattern Matching
// ═══════════════════════════════════════════════════════════════════════════════

export interface PatternMatchResult {
  templateId: string;
  templateName: string;
  matchScore: number;       // 0~1
  matchedComponents: string[];
  missingComponents: string[];
  extraComponents: string[];
}

/**
 * 추출된 컴포넌트 목록과 표준 도면 비교.
 * 가장 유사한 템플릿과 누락/추가 요소를 반환.
 */
export function matchStandardDrawing(
  extractedTypes: string[],
): PatternMatchResult[] {
  const results: PatternMatchResult[] = [];

  for (const template of STANDARD_DRAWINGS) {
    const requiredTypes = template.typicalComponents
      .filter(c => c.mandatory)
      .map(c => c.type);

    const matched = requiredTypes.filter(t => extractedTypes.includes(t));
    const missing = requiredTypes.filter(t => !extractedTypes.includes(t));
    const allTemplateTypes = template.typicalComponents.map(c => c.type);
    const extra = extractedTypes.filter(t => !allTemplateTypes.includes(t));

    const score = requiredTypes.length > 0
      ? matched.length / requiredTypes.length
      : 0;

    results.push({
      templateId: template.id,
      templateName: template.nameKo,
      matchScore: Math.round(score * 100) / 100,
      matchedComponents: matched,
      missingComponents: missing,
      extraComponents: extra,
    });
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Deviation Detection
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeviationReport {
  templateId: string;
  deviations: Deviation[];
  riskLevel: 'low' | 'medium' | 'high';
}

interface Deviation {
  type: 'missing_mandatory' | 'count_below_min' | 'missing_connection' | 'non_standard';
  component: string;
  message: string;
  severity: 'critical' | 'major' | 'minor';
}

/**
 * 표준 도면 대비 이탈 항목 탐지.
 */
export function detectDeviations(
  extractedTypes: string[],
  extractedConnections: { from: string; to: string }[],
  templateId: string,
): DeviationReport | null {
  const template = STANDARD_DRAWINGS.find(t => t.id === templateId);
  if (!template) return null;

  const deviations: Deviation[] = [];

  // 필수 컴포넌트 누락
  for (const comp of template.typicalComponents) {
    if (comp.mandatory) {
      const count = extractedTypes.filter(t => t === comp.type).length;
      if (count === 0) {
        deviations.push({
          type: 'missing_mandatory',
          component: comp.type,
          message: `필수 요소 "${comp.type}" 누락 — ${template.standards.join(', ')} 참조`,
          severity: 'critical',
        });
      } else if (count < comp.minCount) {
        deviations.push({
          type: 'count_below_min',
          component: comp.type,
          message: `"${comp.type}" ${count}개 (최소 ${comp.minCount}개 필요)`,
          severity: 'major',
        });
      }
    }
  }

  // 필수 연결 누락
  for (const conn of template.typicalConnections) {
    if (conn.mandatory) {
      const found = extractedConnections.some(
        c => extractedTypes[0] // simplified check
      );
      if (!found) {
        deviations.push({
          type: 'missing_connection',
          component: `${conn.from} → ${conn.to}`,
          message: `"${conn.from}" → "${conn.to}" 연결 미확인`,
          severity: 'major',
        });
      }
    }
  }

  const criticalCount = deviations.filter(d => d.severity === 'critical').length;
  const riskLevel = criticalCount > 0 ? 'high' : deviations.length > 3 ? 'medium' : 'low';

  return { templateId, deviations, riskLevel };
}

/** 전체 템플릿 수 */
export function getTemplateCount(): number {
  return STANDARD_DRAWINGS.length;
}
