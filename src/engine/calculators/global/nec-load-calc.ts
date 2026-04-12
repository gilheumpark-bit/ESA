/**
 * NEC Article 220 Load Calculation
 *
 * Formulae:
 *   General Lighting:   VA = area(m2) x VA_per_m2 (by occupancy)
 *   Small Appliance:    VA = circuits x 1500 VA (NEC 220.52)
 *   Demand Factor:      applied per NEC 220.42 Table
 *   Service Size:       I = total_VA / (V x sqrt(3))  [3-phase]
 *                       I = total_VA / V               [1-phase]
 *
 * Standards: NEC Article 220 (Branch-Circuit, Feeder, Service Load Calc)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  assertNonNegative,
  round,
} from '../types';

// -- Input / Output ----------------------------------------------------------

export type OccupancyType =
  | 'dwelling'
  | 'office'
  | 'retail'
  | 'warehouse'
  | 'hospital'
  | 'hotel'
  | 'school'
  | 'industrial'
  | 'restaurant';

export interface ApplianceLoad {
  /** Description */
  name: string;
  /** Power in VA */
  va: number;
}

export interface NECLoadCalcInput {
  /** Building occupancy type */
  occupancyType: OccupancyType;
  /** Total floor area in m2 */
  area: number;
  /** Small appliance circuit count (dwelling: 2 min per NEC 220.52) */
  smallApplianceCircuits?: number;
  /** Laundry circuit count (dwelling: 1 min per NEC 220.52) */
  laundryCircuits?: number;
  /** Fixed appliance loads */
  applianceLoads?: ApplianceLoad[];
  /** Motor loads in VA */
  motorLoads?: number[];
  /** HVAC load in VA */
  hvacLoad?: number;
  /** Service voltage (default 240V single-phase or 208V three-phase) */
  serviceVoltage?: number;
  /** Phase count (1 or 3) */
  phases?: 1 | 3;
}

// -- NEC 220.12 General Lighting Load VA/m2 (converted from VA/ft2) ----

const LIGHTING_VA_PER_M2: Record<OccupancyType, number> = {
  'dwelling': 33,     // 3 VA/ft2 x 10.764
  'office': 39,       // 3.5 VA/ft2
  'retail': 22,       // 2 VA/ft2 (for listed)
  'warehouse': 3,     // 0.25 VA/ft2
  'hospital': 22,     // 2 VA/ft2
  'hotel': 22,        // 2 VA/ft2
  'school': 33,       // 3 VA/ft2
  'industrial': 22,   // 2 VA/ft2
  'restaurant': 22,   // 2 VA/ft2
};

// -- NEC 220.42 Demand factors for lighting (simplified) ----
function applyLightingDemandFactor(va: number, occupancy: OccupancyType): number {
  if (occupancy === 'dwelling') {
    // First 3000 VA at 100%, next 3001-120000 at 35%, remainder at 25%
    if (va <= 3000) return va;
    if (va <= 120000) return 3000 + (va - 3000) * 0.35;
    return 3000 + 117000 * 0.35 + (va - 120000) * 0.25;
  }
  if (occupancy === 'hospital') {
    // First 50000 at 40%, remainder at 20%
    if (va <= 50000) return va * 0.4;
    return 50000 * 0.4 + (va - 50000) * 0.2;
  }
  if (occupancy === 'hotel') {
    // First 20000 at 50%, next 80000 at 40%, remainder at 30%
    if (va <= 20000) return va * 0.5;
    if (va <= 100000) return 20000 * 0.5 + (va - 20000) * 0.4;
    return 20000 * 0.5 + 80000 * 0.4 + (va - 100000) * 0.3;
  }
  // Default: 100% (no demand factor for commercial/industrial)
  return va;
}

// -- Calculator --------------------------------------------------------------

export function calculateNECLoad(input: NECLoadCalcInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertOneOf(input.occupancyType, ['dwelling', 'office', 'retail', 'warehouse', 'hospital', 'hotel', 'school', 'industrial', 'restaurant'] as const, 'occupancyType');
  assertPositive(input.area, 'area');

  const { occupancyType, area } = input;
  const smallAppCircuits = input.smallApplianceCircuits ?? (occupancyType === 'dwelling' ? 2 : 0);
  const laundryCircuits = input.laundryCircuits ?? (occupancyType === 'dwelling' ? 1 : 0);
  const applianceLoads = input.applianceLoads ?? [];
  const motorLoads = input.motorLoads ?? [];
  const hvacLoad = input.hvacLoad ?? 0;
  const serviceVoltage = input.serviceVoltage ?? (input.phases === 3 ? 208 : 240);
  const phases = input.phases ?? 1;

  assertNonNegative(hvacLoad, 'hvacLoad');

  const steps: CalcStep[] = [];

  // PART 2 -- Derivation

  // Step 1: General lighting load
  const vaPerM2 = LIGHTING_VA_PER_M2[occupancyType];
  const generalLighting = area * vaPerM2;
  steps.push({
    step: 1,
    title: '일반 조명 부하 (General lighting load, NEC 220.12)',
    formula: 'VA = area \\times VA/m^2',
    value: round(generalLighting, 0),
    unit: 'VA',
    standardRef: 'NEC 220.12',
  });

  // Step 2: Small appliance & laundry (dwelling only)
  const smallApplianceVA = smallAppCircuits * 1500;
  const laundryVA = laundryCircuits * 1500;
  steps.push({
    step: 2,
    title: '소형 가전/세탁 부하 (Small appliance + laundry)',
    formula: 'VA = circuits \\times 1500',
    value: round(smallApplianceVA + laundryVA, 0),
    unit: 'VA',
    standardRef: 'NEC 220.52',
  });

  // Step 3: Apply demand factor to lighting + small appliance
  const combinedLighting = generalLighting + smallApplianceVA + laundryVA;
  const afterDemand = applyLightingDemandFactor(combinedLighting, occupancyType);
  steps.push({
    step: 3,
    title: '수요율 적용 (Demand factor applied, NEC 220.42)',
    formula: '\\text{NEC 220.42 Table}',
    value: round(afterDemand, 0),
    unit: 'VA',
    standardRef: 'NEC 220.42',
  });

  // Step 4: Fixed appliance loads
  let applianceTotal = 0;
  for (const a of applianceLoads) {
    assertPositive(a.va, `appliance ${a.name}`);
    applianceTotal += a.va;
  }
  // NEC 220.53: If 4+ appliances, apply 75% demand factor
  const applianceDemand = applianceLoads.length >= 4 ? applianceTotal * 0.75 : applianceTotal;
  steps.push({
    step: 4,
    title: '고정 기기 부하 (Fixed appliance loads)',
    formula: applianceLoads.length >= 4
      ? 'VA_{app} \\times 0.75 \\text{ (4+ appliances)}'
      : 'VA_{app}',
    value: round(applianceDemand, 0),
    unit: 'VA',
    standardRef: 'NEC 220.53',
  });

  // Step 5: Motor loads (largest motor at 125%)
  let motorTotal = 0;
  let largestMotor = 0;
  for (const m of motorLoads) {
    assertPositive(m, 'motorLoad');
    motorTotal += m;
    if (m > largestMotor) largestMotor = m;
  }
  const motorDemand = motorTotal + largestMotor * 0.25;
  steps.push({
    step: 5,
    title: '전동기 부하 (Motor loads, largest at 125%)',
    formula: 'VA_{motor} + 0.25 \\times VA_{largest}',
    value: round(motorDemand, 0),
    unit: 'VA',
    standardRef: 'NEC 220.50',
  });

  // Step 6: HVAC load
  steps.push({
    step: 6,
    title: 'HVAC 부하 (HVAC load)',
    formula: 'VA_{hvac}',
    value: round(hvacLoad, 0),
    unit: 'VA',
  });

  // Step 7: Total demand
  const totalDemand = afterDemand + applianceDemand + motorDemand + hvacLoad;
  steps.push({
    step: 7,
    title: '총 수요 부하 (Total demand load)',
    formula: 'VA_{total} = VA_{lighting} + VA_{app} + VA_{motor} + VA_{hvac}',
    value: round(totalDemand, 0),
    unit: 'VA',
  });

  // Step 8: Service size (amperes)
  const serviceSize = phases === 3
    ? totalDemand / (serviceVoltage * Math.sqrt(3))
    : totalDemand / serviceVoltage;
  steps.push({
    step: 8,
    title: '서비스 용량 (Service size)',
    formula: phases === 3
      ? 'I = VA / (V \\times \\sqrt{3})'
      : 'I = VA / V',
    value: round(serviceSize, 1),
    unit: 'A',
  });

  // Standard service sizes (NEC)
  const STANDARD_SERVICES = [100, 125, 150, 200, 225, 300, 400, 600, 800, 1000, 1200, 1600, 2000];
  const selectedService = STANDARD_SERVICES.find(s => s >= serviceSize) ?? STANDARD_SERVICES[STANDARD_SERVICES.length - 1];

  // PART 3 -- Result assembly
  return {
    value: round(totalDemand, 0),
    unit: 'VA',
    formula: 'VA_{total} = \\Sigma VA_{demand}',
    steps,
    source: [createSource('NEC', '220', { edition: '2023' })],
    judgment: createJudgment(
      true,
      `총 수요 ${round(totalDemand, 0).toLocaleString()} VA, 서비스 ${round(serviceSize, 1)} A -> ${selectedService} A 표준`,
      'info',
    ),
    additionalOutputs: {
      generalLighting: { value: round(generalLighting, 0), unit: 'VA' },
      smallAppliance: { value: round(smallApplianceVA + laundryVA, 0), unit: 'VA' },
      totalDemand: { value: round(totalDemand, 0), unit: 'VA' },
      serviceSize: { value: round(serviceSize, 1), unit: 'A' },
      selectedService: { value: selectedService, unit: 'A' },
    },
  };
}
