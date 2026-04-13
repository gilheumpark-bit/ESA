/**
 * ESVA Physical Guardrails — 물리법칙 기반 최종 안전 차단
 * ──────────────────────────────────────────────────────────
 * 계산기 출력이 엔지니어에게 전달되기 전, 물리적으로 불가능한 값을 차단.
 * 모든 차단은 사유 + 인식값을 포함하여 HITL(Human-in-the-Loop) 요청.
 *
 * PART 1: 가드레일 규칙 정의
 * PART 2: 검증 실행
 */

import { KEC_CABLE_SIZES } from '@/data/ampacity-tables/kec-ampacity';
import { applyScopePolicy, PolicyManager } from '@/lib/scope-policy';

// =========================================================================
// PART 1 — 규칙 정의
// =========================================================================

export type GuardrailSeverity = 'BLOCK' | 'WARN';

export interface GuardrailViolation {
  rule: string;
  severity: GuardrailSeverity;
  message: string;
  /** 문제가 된 파라미터명 */
  param: string;
  /** 감지된 값 */
  detected: number | string;
  /** 허용 범위 */
  limit: string;
}

export interface GuardrailResult {
  passed: boolean;
  violations: GuardrailViolation[];
}

interface GuardrailRule {
  id: string;
  severity: GuardrailSeverity;
  check: (params: Record<string, unknown>) => GuardrailViolation | null;
}

const RULES: GuardrailRule[] = [
  // ── 거리 ──
  {
    id: 'GR-001',
    severity: 'BLOCK',
    check: (p) => {
      const v = num(p['totalLength_m'] ?? p['length_m'] ?? p['distance']);
      if (v !== null && v > 1000) return {
        rule: 'GR-001', severity: 'BLOCK', param: 'totalLength_m', detected: v,
        limit: '≤ 1000m',
        message: `선로 거리 ${v}m — 건축물 내 분전반 간 거리 1,000m 초과. 데이터 오류 가능성. 수동 확인 필요.`,
      };
      if (v !== null && v <= 0) return {
        rule: 'GR-001', severity: 'BLOCK', param: 'totalLength_m', detected: v,
        limit: '> 0m',
        message: `선로 거리 ${v}m — 0 이하 불가. 도면 인식 오류.`,
      };
      return null;
    },
  },

  // ── 전압강하율 ──
  {
    id: 'GR-002',
    severity: 'BLOCK',
    check: (p) => {
      const v = num(p['voltageDropPercent'] ?? p['vd_percent']);
      if (v !== null && v > 20) return {
        rule: 'GR-002', severity: 'BLOCK', param: 'voltageDropPercent', detected: v,
        limit: '≤ 20%',
        message: `전압강하율 ${v}% — 물리적으로 비정상. 입력값(거리/전류/규격) 재확인 필요.`,
      };
      return null;
    },
  },

  // ── 전류 ──
  {
    id: 'GR-003',
    severity: 'BLOCK',
    check: (p) => {
      const v = num(p['current_A'] ?? p['loadCurrent'] ?? p['ratedCurrent']);
      if (v !== null && v > 10000) return {
        rule: 'GR-003', severity: 'BLOCK', param: 'current_A', detected: v,
        limit: '≤ 10,000A',
        message: `전류 ${v}A — 일반 건축물 저압 설비 범위 초과. 데이터 확인 필요.`,
      };
      if (v !== null && v < 0) return {
        rule: 'GR-003', severity: 'BLOCK', param: 'current_A', detected: v,
        limit: '≥ 0A',
        message: `전류 ${v}A — 음수 불가.`,
      };
      return null;
    },
  },

  // ── 케이블 규격 ──
  {
    id: 'GR-004',
    severity: 'WARN',
    check: (p) => {
      const v = num(p['cableSize_sq'] ?? p['minCableSize_sq'] ?? p['conductorSize']);
      if (v === null) return null;
      const sizes = KEC_CABLE_SIZES as readonly number[];
      if (!sizes.includes(v)) return {
        rule: 'GR-004', severity: 'WARN', param: 'cableSize_sq', detected: v,
        limit: `KEC 표준: ${sizes.join(', ')}`,
        message: `${v}sq는 KEC 표준 케이블 규격에 없습니다. 인식 오류일 수 있습니다.`,
      };
      return null;
    },
  },

  // ── 3상 불평형 ──
  {
    id: 'GR-007',
    severity: 'WARN',
    check: (p) => {
      const ia = num(p['phase_a_current']);
      const ib = num(p['phase_b_current']);
      const ic = num(p['phase_c_current']);
      if (ia === null || ib === null || ic === null) return null;
      const avg = (ia + ib + ic) / 3;
      if (avg === 0) return null;
      const maxDev = Math.max(Math.abs(ia - avg), Math.abs(ib - avg), Math.abs(ic - avg));
      const imbalance = (maxDev / avg) * 100;
      if (imbalance > 10) return {
        rule: 'GR-007', severity: 'WARN' as GuardrailSeverity, param: 'phase_imbalance', detected: `${imbalance.toFixed(1)}%`,
        limit: '≤ 10%',
        message: `3상 전류 불평형 ${imbalance.toFixed(1)}% — 10% 초과. 부하 재배분 권장.`,
      };
      return null;
    },
  },

  // ── 중성선 규격 ──
  {
    id: 'GR-008',
    severity: 'BLOCK',
    check: (p) => {
      const phaseSize = num(p['phaseConductorSize']);
      const neutralSize = num(p['neutralConductorSize']);
      if (phaseSize === null || neutralSize === null) return null;
      if (neutralSize < phaseSize * 0.5) return {
        rule: 'GR-008', severity: 'BLOCK' as GuardrailSeverity, param: 'neutralConductorSize', detected: neutralSize,
        limit: `≥ ${phaseSize * 0.5}sq (상선의 50%)`,
        message: `중성선 ${neutralSize}sq — 상선 ${phaseSize}sq의 50% 미만. 과열 위험.`,
      };
      return null;
    },
  },

  // ── 전동기 기동 전압강하 ──
  {
    id: 'GR-009',
    severity: 'BLOCK',
    check: (p) => {
      const v = num(p['motorStartingVoltageDropPercent']);
      if (v !== null && v > 15) return {
        rule: 'GR-009', severity: 'BLOCK' as GuardrailSeverity, param: 'motorStartingVoltageDropPercent', detected: v,
        limit: '≤ 15%',
        message: `전동기 기동 시 전압강하 ${v}% — 15% 초과. 기동 실패 또는 접촉기 탈락 위험.`,
      };
      return null;
    },
  },

  // ── 부하 용량 ──
  {
    id: 'GR-005',
    severity: 'WARN',
    check: (p) => {
      const v = num(p['loadPower_kW'] ?? p['power_kW']);
      if (v !== null && v > 5000) return {
        rule: 'GR-005', severity: 'WARN', param: 'loadPower_kW', detected: v,
        limit: '≤ 5,000kW (저압 범위)',
        message: `부하 ${v}kW — 저압 단일 부하로는 비정상적으로 큼. 확인 권장.`,
      };
      return null;
    },
  },

  // ── 전압 ──
  {
    id: 'GR-006',
    severity: 'BLOCK',
    check: (p) => {
      const v = num(p['voltage_V']);
      if (v !== null && v <= 0) return {
        rule: 'GR-006', severity: 'BLOCK', param: 'voltage_V', detected: v,
        limit: '> 0V',
        message: `전압 ${v}V — 0 이하 불가.`,
      };
      return null;
    },
  },
  // ── 필수 파라미터 누락 (계산 불가) ──
  {
    id: 'GR-010',
    severity: 'BLOCK',
    check: (p) => {
      // 모든 값이 null/undefined/빈문자열인 경우 → 입력 자체가 없음
      const values = Object.values(p).filter(v => v !== null && v !== undefined && v !== '');
      if (values.length === 0) return {
        rule: 'GR-010', severity: 'BLOCK' as GuardrailSeverity, param: '*', detected: 0,
        limit: '≥ 1 required param',
        message: '필수 파라미터 누락. 계산 불가. 최소 1개 이상의 입력값이 필요합니다.',
      };
      return null;
    },
  },

  // ── 확신도 부족 (데이터 부족) ──
  {
    id: 'GR-011',
    severity: 'BLOCK',
    check: (p) => {
      const conf = num(p['confidence'] ?? p['_confidence']);
      if (conf !== null && conf < 0.7) return {
        rule: 'GR-011', severity: 'BLOCK' as GuardrailSeverity, param: 'confidence', detected: conf,
        limit: '≥ 0.7',
        message: `확신도 ${(conf * 100).toFixed(0)}% — 데이터 부족으로 정확한 계산 불가. PE 검토 필요. 추가 파라미터를 입력하거나 전문가에게 문의하세요.`,
      };
      return null;
    },
  },
];

// =========================================================================
// PART 2 — 검증 실행
// =========================================================================

/**
 * 파라미터에 물리법칙 가드레일을 적용한다.
 * scope-policy로 suppress된 규칙은 건너뛴다.
 * BLOCK 위반이 하나라도 있으면 passed=false → 파이프라인 중단 + HITL 요청.
 */
export function runGuardrails(params: Record<string, unknown>, calcId?: string): GuardrailResult {
  const violations: GuardrailViolation[] = [];

  for (const rule of RULES) {
    // scope-policy에서 suppress된 규칙은 건너뜀
    if (calcId) {
      const policy = PolicyManager.getInstance();
      const resolved = policy.resolve(rule.id, calcId);
      if (resolved.action === 'suppress') continue;
    }

    const v = rule.check(params);
    if (v) violations.push(v);
  }

  const hasBlock = violations.some(v => v.severity === 'BLOCK');

  return {
    passed: !hasBlock,
    violations,
  };
}

/** 가드레일 규칙 목록 조회 (UI 표시용) */
export function getGuardrailRules(): Array<{ id: string; severity: GuardrailSeverity }> {
  return RULES.map(r => ({ id: r.id, severity: r.severity }));
}

// ── Helper ──

function num(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}
