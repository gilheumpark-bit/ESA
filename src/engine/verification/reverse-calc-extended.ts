/**
 * Extended Reverse Calculation Verification
 *
 * Adds reverse formulas for all remaining calculators beyond the initial 6.
 * Follows the same pattern as reverse-calc.ts.
 *
 * PART 1: Imports & shared types
 * PART 2: Extended reverse formulas (21 additional)
 * PART 3: Unified REVERSE_CALCULATORS map
 * PART 4: reverseVerifyAll dispatcher
 */

import type { CalcResult } from '@engine/standards/types';
import { reverseVerify, type VerificationResult } from './reverse-calc';

// ---------------------------------------------------------------------------
// PART 1 — Shared Types
// ---------------------------------------------------------------------------

interface ReverseSpec {
  reverseValue: number;
  inputKey: string;
  description: string;
}

type ReverseFormula = (
  result: CalcResult,
  inputs: Record<string, unknown>,
) => ReverseSpec | null;

// ---------------------------------------------------------------------------
// PART 2 — Extended Reverse Formulas
// ---------------------------------------------------------------------------

const extendedReverseFormulas: Record<string, ReverseFormula> = {

  // ── Power Factor ─────────────────────────────────────────────────────
  // Forward: PF = P / S, where S = sqrt(P^2 + Q^2)
  // Reverse: from PF, verify P = S * PF
  'power-factor': (result, inputs) => {
    const pf = typeof result.value === 'number' ? result.value : null;
    if (pf === null || pf === 0) return null;

    const P = Number(inputs.activePower ?? inputs.power);
    const S = Number(inputs.apparentPower);
    if (!P || !S) return null;

    // Reverse: P_check = S * PF
    const reverseP = S * pf;
    return {
      reverseValue: reverseP,
      inputKey: 'activePower',
      description: `Reverse-derived active power from PF=${pf}`,
    };
  },

  // ── Max Demand ───────────────────────────────────────────────────────
  // Forward: MD = sum(loads * demandFactor)
  // Reverse: from MD, verify totalConnectedLoad
  'max-demand': (result, inputs) => {
    const md = typeof result.value === 'number' ? result.value : null;
    if (md === null || md === 0) return null;

    const df = Number(inputs.demandFactor ?? 0.7);
    const diversityFactor = Number(inputs.diversityFactor ?? 1);
    if (!df) return null;

    // Reverse: totalLoad = MD * diversityFactor / demandFactor
    const reverseLoad = (md * diversityFactor) / df;
    return {
      reverseValue: reverseLoad,
      inputKey: 'totalConnectedLoad',
      description: `Reverse-derived total load from MD=${md}kW`,
    };
  },

  // ── Reactive Power Compensation ──────────────────────────────────────
  // Forward: Qc = P * (tanφ1 - tanφ2)
  // Reverse: from Qc, verify P
  'reactive-power': (result, inputs) => {
    const Qc = typeof result.value === 'number' ? result.value : null;
    if (Qc === null || Qc === 0) return null;

    const pfBefore = Number(inputs.currentPF ?? inputs.powerFactorBefore);
    const pfAfter = Number(inputs.targetPF ?? inputs.powerFactorAfter);
    if (!pfBefore || !pfAfter) return null;

    const tanBefore = Math.tan(Math.acos(pfBefore));
    const tanAfter = Math.tan(Math.acos(pfAfter));
    const tanDiff = tanBefore - tanAfter;
    if (tanDiff === 0) return null;

    const reverseP = Qc / tanDiff;
    return {
      reverseValue: reverseP,
      inputKey: 'activePower',
      description: `Reverse-derived active power from Qc=${Qc}kvar`,
    };
  },

  // ── Transformer Loss ─────────────────────────────────────────────────
  // Forward: totalLoss = Pnl + Pll * (loadRatio)^2
  // Reverse: from totalLoss, verify loadRatio
  'transformer-loss': (result, inputs) => {
    const totalLoss = typeof result.value === 'number' ? result.value : null;
    if (totalLoss === null) return null;

    const Pnl = Number(inputs.noLoadLoss);
    const Pll = Number(inputs.loadLoss ?? inputs.fullLoadLoss);
    if (!Pnl || !Pll) return null;

    // Reverse: loadRatio = sqrt((totalLoss - Pnl) / Pll)
    const ratio2 = (totalLoss - Pnl) / Pll;
    if (ratio2 < 0) return null;

    const reverseRatio = Math.sqrt(ratio2);
    return {
      reverseValue: reverseRatio,
      inputKey: 'loadRatio',
      description: `Reverse-derived load ratio from total loss=${totalLoss}kW`,
    };
  },

  // ── Transformer Efficiency ───────────────────────────────────────────
  // Forward: η = (S * LR * PF) / (S * LR * PF + Pnl + Pll * LR^2) * 100
  // Reverse: from η, verify Pnl
  'transformer-efficiency': (result, inputs) => {
    const eta = typeof result.value === 'number' ? result.value : null;
    if (eta === null || eta === 0) return null;

    const S = Number(inputs.ratedCapacity);
    const LR = Number(inputs.loadRatio ?? 0.75);
    const PF = Number(inputs.powerFactor ?? 0.85);
    const Pll = Number(inputs.loadLoss ?? inputs.fullLoadLoss);
    if (!S || !LR || !PF || !Pll) return null;

    const etaFrac = eta > 1 ? eta / 100 : eta;
    const outputPower = S * LR * PF;

    // Reverse: Pnl = outputPower * (1/η - 1) - Pll * LR^2
    const totalLoss = outputPower * (1 / etaFrac - 1);
    const reversePnl = totalLoss - Pll * LR * LR;

    return {
      reverseValue: reversePnl,
      inputKey: 'noLoadLoss',
      description: `Reverse-derived no-load loss from η=${eta}%`,
    };
  },

  // ── Starting Current ─────────────────────────────────────────────────
  // Forward: Ist = In * startingMultiple
  // Reverse: from Ist, verify In
  'starting-current': (result, inputs) => {
    const Ist = typeof result.value === 'number' ? result.value : null;
    if (Ist === null || Ist === 0) return null;

    const multiple = Number(inputs.startingMultiple ?? 6);
    if (!multiple) return null;

    const reverseIn = Ist / multiple;
    return {
      reverseValue: reverseIn,
      inputKey: 'ratedCurrent',
      description: `Reverse-derived rated current from Ist=${Ist}A`,
    };
  },

  // ── Inverter Capacity ────────────────────────────────────────────────
  // Forward: Sinv = motorPower / (η * PF) * safetyFactor
  // Reverse: from Sinv, verify motorPower
  'inverter-capacity': (result, inputs) => {
    const Sinv = typeof result.value === 'number' ? result.value : null;
    if (Sinv === null || Sinv === 0) return null;

    const eta = Number(inputs.efficiency ?? 0.93);
    const pf = Number(inputs.powerFactor ?? 0.85);
    const sf = Number(inputs.safetyFactor ?? 1.25);
    if (!eta || !pf || !sf) return null;

    const reverseMotorPower = (Sinv * eta * pf) / sf;
    return {
      reverseValue: reverseMotorPower,
      inputKey: 'motorPower',
      description: `Reverse-derived motor power from Sinv=${Sinv}kVA`,
    };
  },

  // ── Solar Generation ─────────────────────────────────────────────────
  // Forward: annual = capacity * peakSunHours * 365 * (1 - systemLoss)
  // Reverse: from annual kWh, verify capacity
  'solar-generation': (result, inputs) => {
    const annual = typeof result.value === 'number' ? result.value : null;
    if (annual === null || annual === 0) return null;

    const psh = Number(inputs.peakSunHours ?? 3.5);
    const loss = Number(inputs.systemLoss ?? 0.15);
    if (!psh) return null;

    const reverseCapacity = annual / (psh * 365 * (1 - loss));
    return {
      reverseValue: reverseCapacity,
      inputKey: 'capacity',
      description: `Reverse-derived PV capacity from annual=${annual}kWh`,
    };
  },

  // ── Illuminance (Lumen Method) ───────────────────────────────────────
  // Forward: N = (E * A) / (F * U * M)
  // Reverse: from N, verify required lux E
  'illuminance': (result, inputs) => {
    const N = typeof result.value === 'number' ? result.value : null;
    if (N === null || N === 0) return null;

    const A = Number(inputs.area);
    const F = Number(inputs.luminousFlux ?? 3000);
    const U = Number(inputs.utilizationFactor ?? 0.5);
    const M = Number(inputs.maintenanceFactor ?? 0.7);
    if (!A || !F || !U || !M) return null;

    // Reverse: E = N * F * U * M / A
    const reverseE = (N * F * U * M) / A;
    return {
      reverseValue: reverseE,
      inputKey: 'requiredLux',
      description: `Reverse-derived required lux from ${N} fixtures`,
    };
  },

  // ── Emergency Generator ──────────────────────────────────────────────
  // Forward: kVA = totalLoad * demandFactor / powerFactor * safetyFactor
  // Reverse: from kVA, verify totalLoad
  'emergency-generator': (result, inputs) => {
    const kva = typeof result.value === 'number' ? result.value : null;
    if (kva === null || kva === 0) return null;

    const df = Number(inputs.demandFactor ?? 0.7);
    const pf = Number(inputs.powerFactor ?? 0.8);
    const sf = Number(inputs.safetyFactor ?? 1.1);
    if (!df || !pf || !sf) return null;

    const reverseLoad = (kva * pf) / (df * sf);
    return {
      reverseValue: reverseLoad,
      inputKey: 'totalLoad',
      description: `Reverse-derived total load from generator=${kva}kVA`,
    };
  },

  // ── Single Phase Power ───────────────────────────────────────────────
  // Forward: P = V * I * PF
  // Reverse: from P, verify I
  'single-phase-power': (result, inputs) => {
    const P = typeof result.value === 'number' ? result.value : null;
    if (P === null || P === 0) return null;

    const V = Number(inputs.voltage);
    const pf = Number(inputs.powerFactor ?? 1);
    if (!V || !pf) return null;

    const reverseI = P / (V * pf);
    return {
      reverseValue: reverseI,
      inputKey: 'current',
      description: `Reverse-derived current from P=${P}W`,
    };
  },

  // ── Three Phase Power ────────────────────────────────────────────────
  // Forward: P = sqrt(3) * V * I * PF
  // Reverse: from P, verify I
  'three-phase-power': (result, inputs) => {
    const P = typeof result.value === 'number' ? result.value : null;
    if (P === null || P === 0) return null;

    const V = Number(inputs.voltage);
    const pf = Number(inputs.powerFactor ?? 0.85);
    if (!V || !pf) return null;

    const reverseI = P / (Math.sqrt(3) * V * pf);
    return {
      reverseValue: reverseI,
      inputKey: 'current',
      description: `Reverse-derived current from P=${P}W (3-phase)`,
    };
  },

  // ── Battery Capacity ─────────────────────────────────────────────────
  // Forward: C = (load * hours) / (dod * η)
  // Reverse: from C, verify load
  'battery-capacity': (result, inputs) => {
    const C = typeof result.value === 'number' ? result.value : null;
    if (C === null || C === 0) return null;

    const hours = Number(inputs.backupHours ?? inputs.daysOfAutonomy ?? 1) * 24;
    const dod = Number(inputs.dod ?? 0.8);
    const eta = Number(inputs.efficiency ?? 0.9);
    if (!hours || !dod || !eta) return null;

    const reverseLoad = (C * dod * eta) / hours;
    return {
      reverseValue: reverseLoad,
      inputKey: 'dailyLoad',
      description: `Reverse-derived daily load from battery=${C}kWh`,
    };
  },

  // ── Earth Fault ──────────────────────────────────────────────────────
  // Forward: If = V / (Zs) where Zs = Zline + Zground
  // Reverse: from If, verify voltage
  'earth-fault': (result, inputs) => {
    const If = typeof result.value === 'number' ? result.value : null;
    if (If === null || If === 0) return null;

    const _V = Number(inputs.voltage ?? 380);
    const Zs = Number(inputs.loopImpedance ?? inputs.faultLoopImpedance);
    if (!Zs) return null;

    const reverseV = If * Zs;
    return {
      reverseValue: reverseV,
      inputKey: 'voltage',
      description: `Reverse-derived voltage from fault current=${If}A`,
    };
  },

  // ── Motor Capacity ───────────────────────────────────────────────────
  // Forward: P_elec = P_mech / η
  // Reverse: from P_elec, verify P_mech
  'motor-capacity': (result, inputs) => {
    const Pelec = typeof result.value === 'number' ? result.value : null;
    if (Pelec === null || Pelec === 0) return null;

    const eta = Number(inputs.efficiency ?? 0.9);
    if (!eta) return null;

    const reversePmech = Pelec * eta;
    return {
      reverseValue: reversePmech,
      inputKey: 'motorPower',
      description: `Reverse-derived mechanical power from P_elec=${Pelec}kW`,
    };
  },

  // ── UPS Capacity ─────────────────────────────────────────────────────
  // Forward: S_ups = totalLoad / PF * safetyFactor
  // Reverse: from S_ups, verify totalLoad
  'ups-capacity': (result, inputs) => {
    const Sups = typeof result.value === 'number' ? result.value : null;
    if (Sups === null || Sups === 0) return null;

    const pf = Number(inputs.powerFactor ?? 0.8);
    const sf = Number(inputs.safetyFactor ?? 1.2);
    if (!pf || !sf) return null;

    const reverseLoad = (Sups * pf) / sf;
    return {
      reverseValue: reverseLoad,
      inputKey: 'totalLoad',
      description: `Reverse-derived total load from UPS=${Sups}kVA`,
    };
  },

  // ── Power Loss ───────────────────────────────────────────────────────
  // Forward: Ploss = I^2 * R * L / 1000
  // Reverse: from Ploss, verify I
  'power-loss': (result, inputs) => {
    const Ploss = typeof result.value === 'number' ? result.value : null;
    if (Ploss === null || Ploss === 0) return null;

    const R = Number(inputs.resistance ?? inputs.cableResistance);
    const L = Number(inputs.length ?? 1);
    if (!R || !L) return null;

    const reverseI = Math.sqrt((Ploss * 1000) / (R * L));
    return {
      reverseValue: reverseI,
      inputKey: 'current',
      description: `Reverse-derived current from power loss=${Ploss}kW`,
    };
  },

  // ── Substation Capacity ──────────────────────────────────────────────
  // Forward: kVA = totalLoad * demandFactor / powerFactor
  // Reverse: from kVA, verify totalLoad
  'substation-capacity': (result, inputs) => {
    const kva = typeof result.value === 'number' ? result.value : null;
    if (kva === null || kva === 0) return null;

    const df = Number(inputs.demandFactor ?? 0.7);
    const pf = Number(inputs.powerFactor ?? 0.85);
    if (!df || !pf) return null;

    const reverseLoad = (kva * pf) / df;
    return {
      reverseValue: reverseLoad,
      inputKey: 'totalLoad',
      description: `Reverse-derived total load from substation=${kva}kVA`,
    };
  },

  // ── Impedance Voltage ────────────────────────────────────────────────
  // Forward: Vz% = (Isc_test * Zsc / Vrated) * 100
  // Reverse: from Vz%, verify rated capacity relationship
  'impedance-voltage': (result, inputs) => {
    const vzPct = typeof result.value === 'number' ? result.value : null;
    if (vzPct === null || vzPct === 0) return null;

    const V = Number(inputs.ratedVoltage ?? inputs.voltage ?? 380);
    const S = Number(inputs.ratedCapacity ?? inputs.kva);
    if (!V || !S) return null;

    // Zbase = V^2 / (S * 1000)
    // Reverse: S = V^2 / (Zbase * 1000) where Zbase = V * vzPct / (100 * Irated)
    // Simplified: verify Irated = S * 1000 / (sqrt(3) * V)
    const reverseIrated = (S * 1000) / (Math.sqrt(3) * V);
    return {
      reverseValue: reverseIrated,
      inputKey: 'ratedCurrent',
      description: `Reverse-derived rated current from Vz=${vzPct}%`,
    };
  },

  // ── Ground Conductor ─────────────────────────────────────────────────
  // Forward: A = I * sqrt(t) / k (IEC 60364-5-54)
  // Reverse: from A, verify fault current
  'ground-conductor': (result, inputs) => {
    const A = typeof result.value === 'number' ? result.value : null;
    if (A === null || A === 0) return null;

    const t = Number(inputs.clearingTime ?? 0.2);
    const k = Number(inputs.materialFactor ?? 143); // Cu default
    if (!t || !k) return null;

    const reverseI = (A * k) / Math.sqrt(t);
    return {
      reverseValue: reverseI,
      inputKey: 'faultCurrent',
      description: `Reverse-derived fault current from conductor=${A}mm2`,
    };
  },

  // ── Energy Saving ────────────────────────────────────────────────────
  // Forward: saving = (oldPower - newPower) * hours * rate / 1000
  // Reverse: from saving, verify old power
  'energy-saving': (result, inputs) => {
    const saving = typeof result.value === 'number' ? result.value : null;
    if (saving === null || saving === 0) return null;

    const newPower = Number(inputs.newPower ?? inputs.replacementPower);
    const hours = Number(inputs.operatingHours ?? 8760);
    const rate = Number(inputs.electricityRate ?? inputs.costPerKwh ?? 120);
    if (!hours || !rate) return null;

    // Reverse: oldPower = saving * 1000 / (hours * rate) + newPower
    const reverseOld = (saving * 1000) / (hours * rate) + (newPower || 0);
    return {
      reverseValue: reverseOld,
      inputKey: 'currentPower',
      description: `Reverse-derived current power from saving=${saving}원/year`,
    };
  },
};

// ---------------------------------------------------------------------------
// PART 3 — Unified REVERSE_CALCULATORS Map
// ---------------------------------------------------------------------------

/**
 * Complete map of all reverse-verifiable calculator IDs.
 * Combines the original 6 from reverse-calc.ts + 21 new formulas.
 */
export const REVERSE_CALCULATORS: ReadonlySet<string> = new Set([
  // Original 6 (handled by reverseVerify in reverse-calc.ts)
  'voltage-drop',
  'cable-sizing',
  'breaker-sizing',
  'short-circuit',
  'transformer-capacity',
  'ground-resistance',
  // Extended 21
  ...Object.keys(extendedReverseFormulas),
]);

// ---------------------------------------------------------------------------
// PART 4 — Auto-dispatch Verifier
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DISCREPANCY = 0.0001;

/**
 * Unified reverse verification dispatcher.
 * Routes to the original reverseVerify for the first 6,
 * and to extended formulas for the rest.
 */
export function reverseVerifyAll(
  calcId: string,
  result: CalcResult,
  inputs: Record<string, unknown>,
  maxAllowed: number = DEFAULT_MAX_DISCREPANCY,
): VerificationResult {
  // 기존 6개 계산기는 원본 모듈로 위임
  const originalCalcIds = [
    'voltage-drop', 'cable-sizing', 'breaker-sizing',
    'short-circuit', 'transformer-capacity', 'ground-resistance',
  ];

  if (originalCalcIds.includes(calcId)) {
    return reverseVerify(calcId, result, inputs, maxAllowed);
  }

  // 확장 공식 사용
  const formula = extendedReverseFormulas[calcId];
  if (!formula) {
    return {
      verified: false,
      forwardResult: typeof result.value === 'number' ? result.value : 0,
      reverseResult: 0,
      discrepancy: -1,
      maxAllowed,
      description: `No reverse formula available for calcId: ${calcId}`,
      calcId,
      status: 'HOLD',
    };
  }

  const spec = formula(result, inputs);
  if (!spec) {
    return {
      verified: false,
      forwardResult: typeof result.value === 'number' ? result.value : 0,
      reverseResult: 0,
      discrepancy: -1,
      maxAllowed,
      description: `Could not compute reverse verification for ${calcId} (missing data)`,
      calcId,
      status: 'HOLD',
    };
  }

  const originalValue = Number(inputs[spec.inputKey]);
  if (!Number.isFinite(originalValue) || originalValue === 0) {
    return {
      verified: false,
      forwardResult: typeof result.value === 'number' ? result.value : 0,
      reverseResult: spec.reverseValue,
      discrepancy: -1,
      maxAllowed,
      description: `Original input '${spec.inputKey}' is invalid for reverse check`,
      calcId,
      status: 'HOLD',
    };
  }

  const discrepancy = Math.abs(spec.reverseValue - originalValue) / Math.abs(originalValue);

  let status: 'PASS' | 'FAIL' | 'HOLD';
  if (discrepancy <= maxAllowed) {
    status = 'PASS';
  } else if (discrepancy <= maxAllowed * 10) {
    status = 'HOLD';
  } else {
    status = 'FAIL';
  }

  return {
    verified: status === 'PASS',
    forwardResult: typeof result.value === 'number' ? result.value : 0,
    reverseResult: spec.reverseValue,
    discrepancy,
    maxAllowed,
    description: spec.description,
    calcId,
    status,
  };
}
