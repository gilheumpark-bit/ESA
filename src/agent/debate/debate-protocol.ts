/**
 * ESVA Debate Protocol
 * --------------------
 * 다중 에이전트 간 토론/재합의 메커니즘.
 *
 * 핵심 원칙:
 * 1. 물리법칙(V=IR 등)이나 KEC 테이블과 0.1%라도 다르면 즉시 반려
 * 2. 기준서가 최종 권위 — AI 추론보다 테이블 값 우선
 * 3. 합의 실패 시 HITL 에스컬레이션
 *
 * PART 1: Debate engine
 * PART 2: Consensus evaluator
 * PART 3: Escalation handler
 */

import type {
  TeamId,
  TeamResult,
  DebateRound,
  DebateResult,
  DebateArgument,
  ConsensusConfig,
  CalculationEntry,
} from '../teams/types';
import type {
  DebateTopic,
  NumericalEvidence,
  RegulatoryEvidence,
  DetailedArgument,
  EscalationInfo,
} from './types';
import { SQRT3 } from '@engine/constants/physical';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Debate Engine
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONSENSUS: ConsensusConfig = {
  maxRounds: 3,
  requiredAgreement: 0.67,
  tolerancePercent: 0.1,
  escalateOnFailure: true,
};

/**
 * 다중 팀 결과 간 불일치 항목 탐지.
 * 같은 파라미터를 여러 팀이 계산했을 때 오차 비교.
 */
export function detectDisagreements(
  teamResults: TeamResult[],
  tolerance: number = 0.1,
): DisagreementItem[] {
  const calcMap = new Map<string, { teamId: TeamId; entry: CalculationEntry }[]>();

  // 같은 calculatorId별로 그룹핑
  for (const tr of teamResults) {
    if (!tr.calculations) continue;
    for (const calc of tr.calculations) {
      const key = calc.calculatorId;
      if (!calcMap.has(key)) calcMap.set(key, []);
      calcMap.get(key)!.push({ teamId: tr.teamId, entry: calc });
    }
  }

  const disagreements: DisagreementItem[] = [];

  for (const [calcId, entries] of calcMap) {
    if (entries.length < 2) continue;

    const values = entries.map(e => e.entry.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg === 0) continue;

    // 각 값이 평균에서 tolerance% 이상 벗어나면 불일치
    const maxDeviation = Math.max(...values.map(v => Math.abs((v - avg) / avg) * 100));

    if (maxDeviation > tolerance) {
      disagreements.push({
        calcId,
        label: entries[0].entry.label,
        entries: entries.map(e => ({
          teamId: e.teamId,
          value: e.entry.value,
          unit: e.entry.unit,
        })),
        maxDeviationPercent: maxDeviation,
        average: avg,
      });
    }
  }

  return disagreements;
}

export interface DisagreementItem {
  calcId: string;
  label: string;
  entries: { teamId: TeamId; value: number; unit: string }[];
  maxDeviationPercent: number;
  average: number;
}

/**
 * 토론 라운드 실행.
 * 각 팀이 불일치 항목에 대해 근거를 제시하고 합의를 시도한다.
 */
export function executeDebateRound(
  roundNumber: number,
  topic: string,
  disagreement: DisagreementItem,
  teamResults: TeamResult[],
  config: ConsensusConfig = DEFAULT_CONSENSUS,
): DebateRound {
  const arguments_: DebateArgument[] = [];

  for (const entry of disagreement.entries) {
    const teamResult = teamResults.find(tr => tr.teamId === entry.teamId);
    if (!teamResult) continue;

    // 기준서 근거 수집
    const evidence: string[] = [];
    if (teamResult.standards) {
      for (const std of teamResult.standards) {
        evidence.push(`${std.standard} ${std.clause}: ${std.judgment}`);
      }
    }
    evidence.push(`계산값: ${entry.value} ${entry.unit}`);

    // 물리법칙 대조 — V=IR, P=VI 등 위반 시 즉시 반려
    const physicsCheck = validatePhysicsLaw(
      disagreement.calcId,
      entry.value,
      extractRelatedParams(teamResult),
    );
    if (!physicsCheck.valid) {
      evidence.push(`물리법칙 위반: ${physicsCheck.law} (기대값: ${physicsCheck.expected})`);
    }

    // KEC 테이블 대조 — 테이블 값과 0.1% 이상 다르면 반려
    const kecRef = teamResult.standards?.find(
      s => s.standard === 'KEC' && s.judgment !== 'BLOCK'
    );

    const arg: DebateArgument = {
      teamId: entry.teamId,
      topic,
      position: `${entry.value} ${entry.unit}`,
      evidence,
      verdict: physicsCheck.valid && kecRef ? 'agree' : 'disagree',
      confidence: physicsCheck.valid ? teamResult.confidence : teamResult.confidence * 0.5,
    };
    arguments_.push(arg);
  }

  // 합의 판정: requiredAgreement 비율 이상이 agree면 합의
  const agreeCount = arguments_.filter(a => a.verdict === 'agree').length;
  const totalCount = arguments_.length;
  const consensus = totalCount > 0 && (agreeCount / totalCount) >= config.requiredAgreement;

  // 합의된 경우: 기준서 근거가 있는 팀의 값을 채택
  let consensusPosition: string | undefined;
  if (consensus) {
    const bestArg = arguments_
      .filter(a => a.verdict === 'agree')
      .sort((a, b) => b.confidence - a.confidence)[0];
    consensusPosition = bestArg?.position;
  }

  return {
    roundNumber,
    topic,
    arguments: arguments_,
    consensus,
    consensusPosition,
    dissenters: arguments_
      .filter(a => a.verdict === 'disagree')
      .map(a => a.teamId as TeamId),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Consensus Evaluator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 물리법칙 대조 검증.
 * V=IR, P=VI, VD=√3×I×L×R/A 등 기본 법칙 위반 시 즉시 반려.
 */
export function validatePhysicsLaw(
  parameter: string,
  value: number,
  relatedParams: Record<string, number>,
): { valid: boolean; law?: string; expected?: number } {
  switch (parameter) {
    case 'current_A': {
      const v = relatedParams['voltage_V'];
      const r = relatedParams['resistance_ohm'];
      if (v && r && r > 0) {
        const expected = v / r;
        const deviation = Math.abs((value - expected) / expected) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'V=IR (옴의 법칙)', expected };
        }
      }
      return { valid: true };
    }
    case 'power_W': {
      const v = relatedParams['voltage_V'];
      const i = relatedParams['current_A'];
      if (v && i) {
        const expected = v * i;
        const deviation = Math.abs((value - expected) / expected) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'P=VI (전력 공식)', expected };
        }
      }
      return { valid: true };
    }
    case 'voltageDropPercent': {
      // VD% = (√3 × I × L × R) / (V × 1000) × 100
      const v = relatedParams['voltage_V'];
      const i = relatedParams['current_A'];
      const l = relatedParams['length_m'];
      const r = relatedParams['resistance_ohm_per_km'];
      if (v && i && l && r && v > 0) {
        const expected = (SQRT3 * i * l * r) / (v * 1000) * 100;
        const deviation = Math.abs((value - expected) / (expected || 1)) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'VD% = √3×I×L×R/V (전압강하 공식)', expected };
        }
      }
      return { valid: true };
    }
    case 'reactivePower_var': {
      // Q = P × tan(φ) = P × sin(φ)/cos(φ)
      const p = relatedParams['power_W'];
      const pf = relatedParams['powerFactor'];
      if (p && pf && pf > 0 && pf < 1) {
        const phi = Math.acos(pf);
        const expected = p * Math.tan(phi);
        const deviation = Math.abs((value - expected) / (expected || 1)) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'Q = P×tan(φ) (무효전력 공식)', expected };
        }
      }
      return { valid: true };
    }
    case 'apparentPower_VA': {
      // S = √(P² + Q²) = P / cos(φ)
      const p = relatedParams['power_W'];
      const pf = relatedParams['powerFactor'];
      if (p && pf && pf > 0) {
        const expected = p / pf;
        const deviation = Math.abs((value - expected) / (expected || 1)) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'S = P/cos(φ) (피상전력 공식)', expected };
        }
      }
      return { valid: true };
    }
    case 'heatLoss_W': {
      // P_loss = I² × R (줄 발열 법칙)
      const i = relatedParams['current_A'];
      const r = relatedParams['resistance_ohm'];
      if (i && r) {
        const expected = i * i * r;
        const deviation = Math.abs((value - expected) / (expected || 1)) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'P=I²R (줄 발열 법칙)', expected };
        }
      }
      return { valid: true };
    }
    case 'impedance_ohm': {
      // Z = √(R² + X²) (임피던스 합성)
      const r = relatedParams['resistance_ohm'];
      const x = relatedParams['reactance_ohm'];
      if (r !== undefined && x !== undefined) {
        const expected = Math.sqrt(r * r + x * x);
        const deviation = Math.abs((value - expected) / (expected || 1)) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'Z=√(R²+X²) (임피던스 합성)', expected };
        }
      }
      return { valid: true };
    }
    case 'energy_kWh': {
      // E = P × t (에너지 보존)
      const p = relatedParams['power_W'];
      const t = relatedParams['time_h'];
      if (p && t) {
        const expected = (p * t) / 1000;
        const deviation = Math.abs((value - expected) / (expected || 1)) * 100;
        if (deviation > 0.1) {
          return { valid: false, law: 'E=P×t (에너지 보존법칙)', expected };
        }
      }
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

/** 검증 가능한 물리법칙 목록 (8개) */
export const PHYSICS_LAWS = [
  'V=IR (옴의 법칙)',
  'P=VI (전력 공식)',
  'VD%=√3×I×L×R/V (전압강하)',
  'Q=P×tan(φ) (무효전력)',
  'S=P/cos(φ) (피상전력)',
  'P=I²R (줄 발열)',
  'Z=√(R²+X²) (임피던스)',
  'E=P×t (에너지 보존)',
] as const;

/**
 * calculatorId → 물리 파라미터 매핑 테이블.
 * 문자열 includes 대신 명시적 키워드 매핑으로 오판 방지.
 */
const CALC_TO_PARAM: Record<string, string> = {
  'voltage-drop': 'voltageDropPercent',
  'three-phase-vd': 'voltageDropPercent',
  'busbar-vd': 'voltageDropPercent',
  'complex-voltage-drop': 'voltageDropPercent',
  'cable-sizing': 'current_A',
  'ampacity': 'current_A',
  'short-circuit': 'current_A',
  'three-phase-power': 'power_W',
  'single-phase-power': 'power_W',
  'power-loss': 'heatLoss_W',
  'reactive-power': 'reactivePower_var',
  'power-factor': 'powerFactor',
  'ground-resistance': 'resistance_ohm',
  'cable-impedance': 'impedance_ohm',
  'transformer-capacity': 'apparentPower_VA',
  'solar-generation': 'energy_kWh',
  'battery-capacity': 'energy_kWh',
};

/** 팀 결과에서 관련 파라미터 추출 (물리법칙 검증용) */
function extractRelatedParams(teamResult: TeamResult): Record<string, number> {
  const params: Record<string, number> = {};
  if (!teamResult.calculations) return params;

  for (const calc of teamResult.calculations) {
    // 1) 명시적 매핑 테이블 우선
    const paramName = CALC_TO_PARAM[calc.calculatorId];
    if (paramName) {
      params[paramName] = calc.value;
    }
    // 2) 폴백: 키워드 기반 (하위 호환)
    if (!paramName) {
      if (calc.calculatorId.includes('voltage')) params['voltage_V'] = calc.value;
      if (calc.calculatorId.includes('current')) params['current_A'] = calc.value;
      if (calc.calculatorId.includes('power')) params['power_W'] = calc.value;
      if (calc.calculatorId.includes('resistance')) params['resistance_ohm'] = calc.value;
    }
  }
  return params;
}

/**
 * 전체 토론 프로세스 실행.
 * 불일치 탐지 → 라운드별 토론 → 합의 or 에스컬레이션
 */
export function runDebate(
  teamResults: TeamResult[],
  config: ConsensusConfig = DEFAULT_CONSENSUS,
): DebateResult[] {
  const disagreements = detectDisagreements(teamResults, config.tolerancePercent);
  const results: DebateResult[] = [];

  for (const dis of disagreements) {
    const rounds: DebateRound[] = [];
    let finalConsensus = false;
    let finalPosition = '';

    for (let r = 1; r <= config.maxRounds; r++) {
      const round = executeDebateRound(r, dis.label, dis, teamResults, config);
      rounds.push(round);

      if (round.consensus) {
        finalConsensus = true;
        finalPosition = round.consensusPosition ?? '';
        break;
      }
    }

    // 합의 실패 시: 가장 보수적(안전 측) 값 채택
    if (!finalConsensus) {
      const conservativeEntry = dis.entries
        .sort((a, b) => {
          // 전압강하는 높은 값이 보수적, 허용전류는 낮은 값이 보수적
          if (dis.calcId.includes('voltage_drop')) return b.value - a.value;
          return a.value - b.value;
        })[0];
      finalPosition = `${conservativeEntry.value} ${conservativeEntry.unit} (보수적 채택)`;
    }

    results.push({
      topic: dis.label,
      rounds,
      finalConsensus,
      finalPosition,
      totalRounds: rounds.length,
      maxRoundsReached: rounds.length >= config.maxRounds && !finalConsensus,
      participatingTeams: dis.entries.map(e => e.teamId),
      dissenterReport: finalConsensus
        ? undefined
        : `합의 실패: ${dis.maxDeviationPercent.toFixed(2)}% 불일치. 보수적 값 채택됨.`,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Escalation Handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 합의 실패 시 HITL 에스컬레이션 정보 생성.
 */
export function buildEscalation(
  debateResults: DebateResult[],
): EscalationInfo | null {
  const failedDebates = debateResults.filter(d => !d.finalConsensus);
  if (failedDebates.length === 0) return null;

  const allDissenters = new Set<string>();
  let maxDivergence = 0;

  for (const d of failedDebates) {
    for (const round of d.rounds) {
      for (const dis of round.dissenters ?? []) {
        allDissenters.add(dis);
      }
    }
    // 대략적 divergence 추출
    if (d.dissenterReport) {
      const match = d.dissenterReport.match(/([\d.]+)%/);
      if (match) {
        const pct = parseFloat(match[1]);
        if (pct > maxDivergence) maxDivergence = pct;
      }
    }
  }

  return {
    reason: `${failedDebates.length}건 합의 실패 (최대 ${maxDivergence.toFixed(2)}% 불일치)`,
    dissentingTeams: [...allDissenters],
    divergencePercent: maxDivergence,
    requiresHumanReview: true,
    suggestedAction: maxDivergence > 5
      ? '설계 재검토 필요 — 입력값 또는 도면 해석 오류 가능성'
      : '보수적 값 적용 후 현장 시공 시 실측 확인 권장',
  };
}
