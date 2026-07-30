/**
 * Busbar (Cascaded Section) Voltage Drop Calculator
 *
 * Calculates cumulative voltage drop from main bus through sub-bus to branch.
 * Each section has its own current, cable size, and length.
 *
 * Formula per section (3-phase):
 *   VDi = √3 × Ii × Li × (Ri·cosφ + Xi·sinφ)
 *
 * Total: VDtotal = Σ VDi
 * Check: VDtotal% ≤ allowable limit
 *
 * Standards: KEC 232.3.9 (누적 전압강하), IEC 60364-5-52
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import { CalcValidationError } from '../types';
import { SQRT3 } from '@engine/constants/physical';
import {
  activeDefaults,
  resolveVoltageDropLimit,
  type SupplyLevel,
  type LoadKind,
} from '@/engine/calculators/country-defaults';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface BusbarSection {
  /** Section name (e.g. "Main Bus → Sub Bus A") */
  name: string;
  /** Current flowing through this section (A) */
  current: number;
  /** Section length in meters */
  length: number;
  /** Cable/busbar resistance per km (Ω/km) */
  resistance: number;
  /** Cable/busbar reactance per km (Ω/km) */
  reactance: number;
}

export interface BusbarVDInput {
  /** System voltage (V), line-to-line for 3-phase */
  voltage: number;
  /** Power factor */
  powerFactor: number;
  /** Sections from source to final load */
  sections: BusbarSection[];
  /** Total allowable cumulative voltage drop % (default 5%) */
  allowableTotalPercent?: number;
  /**
   * 수전 전압 구분 — KEC 232.3.9 설비 유형 A(저압) / B(고압 이상).
   * loadKind 와 묶어 KEC 표에서 한도를 뽑는다. 안 주면 기존 국가 기본값 그대로다.
   */
  supplyLevel?: SupplyLevel;
  /** 부하 종류 — KEC 232.3.9 는 조명과 기타를 다르게 본다. */
  loadKind?: LoadKind;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateBusbarVD(input: BusbarVDInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.voltage, 'voltage');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  if (!input.sections || input.sections.length === 0) {
    throw new CalcValidationError('sections','At least one busbar section is required');
  }

  for (let i = 0; i < input.sections.length; i++) {
    assertPositive(input.sections[i].current, `sections[${i}].current`);
    assertPositive(input.sections[i].length, `sections[${i}].length`);
    assertPositive(input.sections[i].resistance, `sections[${i}].resistance`);
  }

  const { voltage: V, powerFactor: pf } = input;
  const allowable = resolveVoltageDropLimit({
    explicit: input.allowableTotalPercent,
    supplyLevel: input.supplyLevel,
    loadKind: input.loadKind,
    // KEC 100m 가산은 전체 배선 길이 기준이라 구간 합을 쓴다.
    wiringLengthM: input.sections.reduce((sum, sec) => sum + sec.length, 0),
    fallback: activeDefaults().vdCombined,
  });
  const cosPhi = pf;
  const sinPhi = Math.sqrt(1 - pf * pf);
  const steps: CalcStep[] = [];

  // PART 2 — Per-section voltage drop calculation
  let cumulativeDropV = 0;
  const sectionResults: Array<{ name: string; dropV: number; dropPercent: number }> = [];

  input.sections.forEach((sec, idx) => {
    const L_km = sec.length / 1000;
    const X = sec.reactance ?? 0;
    const dropV = SQRT3 * sec.current * L_km * (sec.resistance * cosPhi + X * sinPhi);
    cumulativeDropV += dropV;
    const cumPercent = (cumulativeDropV / V) * 100;

    sectionResults.push({
      name: sec.name,
      dropV,
      dropPercent: (dropV / V) * 100,
    });

    // 번호는 밀어 넣은 순서다. 앞서는 두 push 가 같은 `idx + 1` 을 써서
    // 목록이 1,1,2,2,5 로 나왔다 — 번호가 겹치면 누적 % 항목은 번호로
    // 접근이 안 되고, 3·4 가 비어 단계가 빠진 것처럼 보인다(실측 2026-07-30).
    steps.push({
      step: steps.length + 1,
      title: `${sec.name} — voltage drop`,
      formula: 'VD_i = \\sqrt{3} \\times I_i \\times L_i \\times (R_i\\cos\\varphi + X_i\\sin\\varphi)',
      value: round(dropV, 2),
      unit: 'V',
      standardRef: 'IEC 60364-5-52',
    });

    steps.push({
      step: steps.length + 1,
      title: `Cumulative after "${sec.name}"`,
      formula: 'VD_{cum} = \\sum VD_i',
      value: round(cumPercent, 2),
      unit: '%',
    });
  });

  // Final cumulative percentage
  const totalPercent = (cumulativeDropV / V) * 100;
  steps.push({
    step: steps.length + 1,
    title: 'Total cumulative voltage drop',
    formula: 'VD_{total}\\% = \\frac{\\sum VD_i}{V} \\times 100',
    value: round(totalPercent, 2),
    unit: '%',
    standardRef: 'KEC 232.3.9',
  });

  // PART 3 — Result assembly
  const pass = totalPercent <= allowable;
  const message = pass
    ? `Cumulative VD = ${round(totalPercent, 2)}% (within ${allowable}% limit across ${input.sections.length} sections)`
    : `Cumulative VD = ${round(totalPercent, 2)}% EXCEEDS ${allowable}% limit`;

  return {
    value: round(totalPercent, 2),
    unit: '%',
    formula: 'VD_{total} = \\sum \\sqrt{3} I_i L_i (R_i\\cos\\varphi + X_i\\sin\\varphi)',
    steps,
    source: [
      createSource('KEC', '232.3.9', { edition: '2021' }),
      createSource('IEC', '60364-5-52', { edition: '2009' }),
    ],
    judgment: createJudgment(pass, message, pass ? 'info' : 'error', 'KEC 232.3.9'),
    additionalOutputs: {
      totalDropVolts: { value: round(cumulativeDropV, 2), unit: 'V' },
      totalDropPercent: { value: round(totalPercent, 2), unit: '%' },
      receivingEndVoltage: { value: round(V - cumulativeDropV, 2), unit: 'V' },
    },
  };
}
