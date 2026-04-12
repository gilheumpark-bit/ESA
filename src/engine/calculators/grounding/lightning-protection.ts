/**
 * Lightning Protection System Calculator
 *
 * Methods:
 *   Protection angle method: α = f(height, LPL class)
 *   Rolling sphere method:   r = f(LPL class)
 *   Mesh method:             spacing = f(LPL class)
 *
 * LPL Classes (IEC 62305-1):
 *   I:   r=20m,  mesh=5×5m
 *   II:  r=30m,  mesh=10×10m
 *   III: r=45m,  mesh=15×15m
 *   IV:  r=60m,  mesh=20×20m
 *
 * Standards: IEC 62305, KEC 152 (피뢰 시스템)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export type LPLClass = 'I' | 'II' | 'III' | 'IV';
export type ProtectionMethod = 'angle' | 'sphere';

export interface LightningProtectionInput {
  /** Building height in meters */
  buildingHeight: number;
  /** Lightning Protection Level class */
  lplClass: LPLClass;
  /** Calculation method */
  method: ProtectionMethod;
}

const VALID_LPL: readonly LPLClass[] = ['I', 'II', 'III', 'IV'];
const VALID_METHODS: readonly ProtectionMethod[] = ['angle', 'sphere'];

// IEC 62305-3 parameters
interface LPLParams {
  rollingRadius: number;  // m
  meshSpacing: number;    // m
  /** Protection angle at h=0 (degrees) — angle decreases with height */
  angleBase: number;
  /** Height limit for angle method (m) */
  angleHeightLimit: number;
}

const LPL_PARAMS: Record<LPLClass, LPLParams> = {
  'I':   { rollingRadius: 20, meshSpacing: 5,  angleBase: 25, angleHeightLimit: 20 },
  'II':  { rollingRadius: 30, meshSpacing: 10, angleBase: 35, angleHeightLimit: 30 },
  'III': { rollingRadius: 45, meshSpacing: 15, angleBase: 45, angleHeightLimit: 45 },
  'IV':  { rollingRadius: 60, meshSpacing: 20, angleBase: 55, angleHeightLimit: 60 },
};

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateLightningProtection(input: LightningProtectionInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.buildingHeight, 'buildingHeight');
  assertOneOf(input.lplClass, VALID_LPL, 'lplClass');
  assertOneOf(input.method, VALID_METHODS, 'method');

  const { buildingHeight: h, lplClass, method } = input;
  const params = LPL_PARAMS[lplClass];

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  if (method === 'sphere') {
    // ── Rolling Sphere Method ──

    // Step 1: 회전구체 반경
    const r = params.rollingRadius;
    steps.push({
      step: 1,
      title: `Rolling sphere radius for LPL ${lplClass}`,
      formula: `r = ${r}\\text{ m (IEC 62305-3, Table 2)}`,
      value: r,
      unit: 'm',
    });

    // Step 2: 건물 높이 vs 반경 비교
    const protectedBelow = h <= r;
    steps.push({
      step: 2,
      title: 'Compare building height to rolling sphere radius',
      formula: 'h \\leq r \\Rightarrow \\text{single rod may suffice}',
      value: h,
      unit: 'm',
    });

    // Step 3: 옥상 도체 간격 (mesh method supplement)
    steps.push({
      step: 3,
      title: `Roof conductor mesh spacing for LPL ${lplClass}`,
      formula: `d_{mesh} = ${params.meshSpacing}\\text{ m}`,
      value: params.meshSpacing,
      unit: 'm',
    });

    const judgmentMsg = protectedBelow
      ? `Rolling sphere r=${r}m. Building h=${h}m is within sphere — standard protection applies. Mesh spacing ${params.meshSpacing}m.`
      : `Rolling sphere r=${r}m. Building h=${h}m exceeds sphere — side-flash protection needed above ${r}m.`;

    return {
      value: r,
      unit: 'm',
      formula: 'r = f(LPL)',
      steps,
      source: [
        createSource('IEC', '62305-3', { edition: '2010' }),
        createSource('KEC', '152', { edition: '2021' }),
      ],
      judgment: createJudgment(protectedBelow, judgmentMsg, protectedBelow ? 'info' : 'warning'),
      additionalOutputs: {
        rollingRadius: { value: r, unit: 'm' },
        roofConductorSpacing: { value: params.meshSpacing, unit: 'm' },
      },
    };
  }

  // ── Protection Angle Method ──

  // Step 1: 보호각 기본값
  steps.push({
    step: 1,
    title: `Base protection angle for LPL ${lplClass}`,
    formula: `\\alpha_{base} = ${params.angleBase}°`,
    value: params.angleBase,
    unit: 'deg',
  });

  // Step 2: 높이에 따른 보호각 감소 (IEC 62305-3 Fig 3 simplified linear interpolation)
  // α = αbase × (1 - h/heightLimit), but not below 0
  const heightRatio = Math.min(h / params.angleHeightLimit, 1);
  const alpha = Math.max(params.angleBase * (1 - heightRatio * 0.8), 0);
  steps.push({
    step: 2,
    title: 'Adjust protection angle for building height',
    formula: '\\alpha = \\alpha_{base} \\times (1 - 0.8 \\times h / h_{limit})',
    value: round(alpha, 1),
    unit: 'deg',
  });

  // Step 3: 높이 제한 확인
  const withinLimit = h <= params.angleHeightLimit;
  steps.push({
    step: 3,
    title: 'Check height limit for angle method',
    formula: `h \\leq h_{limit} = ${params.angleHeightLimit}\\text{ m}`,
    value: h,
    unit: 'm',
  });

  // Step 4: 옥상 도체 간격
  steps.push({
    step: 4,
    title: `Roof conductor mesh spacing for LPL ${lplClass}`,
    formula: `d_{mesh} = ${params.meshSpacing}\\text{ m}`,
    value: params.meshSpacing,
    unit: 'm',
  });

  const pass = withinLimit && alpha > 0;
  const judgmentMsg = pass
    ? `Protection angle α=${round(alpha, 1)}° for h=${h}m, LPL ${lplClass}. Mesh spacing ${params.meshSpacing}m.`
    : `Height ${h}m exceeds angle method limit (${params.angleHeightLimit}m) for LPL ${lplClass}. Use rolling sphere or mesh method.`;

  return {
    value: round(alpha, 1),
    unit: 'deg',
    formula: '\\alpha = f(h, LPL)',
    steps,
    source: [
      createSource('IEC', '62305-3', { edition: '2010' }),
      createSource('KEC', '152', { edition: '2021' }),
    ],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'warning'),
    additionalOutputs: {
      protectionAngle: { value: round(alpha, 1), unit: 'deg' },
      roofConductorSpacing: { value: params.meshSpacing, unit: 'm' },
    },
  };
}
